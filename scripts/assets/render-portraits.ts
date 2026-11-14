/**
 * pnpm assets:portraits [--only <catalogue id | manifest model id>] [--group <group>] [--sheet <png>] [--deploy 0]
 *
 * Renders a 512 x 512 transparent WebP portrait of every catalogue model (src/assets/catalogueModels.ts)
 * whose optimized GLB exists in public/assets/, in the shared card studio of portrait-lab.html,
 * into public/assets/img/portraits/<catalogue id>.webp.
 *
 * --only   one model, or a comma-separated list; also takes any manifest model id (cubesat-6u or model.cubesat-6u)
 * --group  only the models built by scripts/assets/models/parts/<group>.ts
 * --sheet  also write a labelled contact sheet (PNG, dark background) of everything rendered
 * --deploy 0 renders the stowed pose (default 1, deployed)
 *
 * Starts Vite in-process and drives headless Chromium (SwiftShader WebGL) through playwright-core.
 */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'
import sharp, { type OverlayOptions } from 'sharp'
import { assets } from '../../src/assets/manifest.ts'
import { CATALOGUE_MODELS } from '../../src/assets/catalogueModels.ts'
import { ROOT, ensureDir, kb, outPath } from './lib/paths.ts'

const CHROME = process.env.PORTRAIT_CHROME ?? '/home/brouthen/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
const CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
const SIZE = 512
const TIMEOUT = 90_000

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null)
const only = arg('--only')
const group = arg('--group')
const sheet = arg('--sheet')
const deploy = arg('--deploy') === '0' ? 0 : 1

/** Set by portrait-lab.html in the page */
interface Flags {
  __portraitReady?: boolean
  __portraitError?: string
}

interface Job {
  modelId: string
  /** Catalogue id: model id without the `model.` prefix; names the output file */
  id: string
  file: string
  credit: string
}

const groupOf = (credit: string) => credit.match(/models\/parts\/([\w-]+)\.ts/)?.[1] ?? null
const allModels: Job[] = assets
  .filter((a) => a.kind === 'model')
  .map((a) => ({ modelId: a.id, id: a.id.replace(/^model\./, ''), file: a.file, credit: a.credit }))

function selectJobs(): Job[] {
  if (only) {
    return only.split(',').map((raw) => {
      const key = raw.trim().replace(/^model\./, '')
      const job = allModels.find((m) => m.id === key)
      if (!job) throw new Error(`--only ${raw}: no manifest model with that id`)
      return job
    })
  }
  const catalogue = new Set<string>(CATALOGUE_MODELS.map((m) => m.id))
  const jobs = allModels.filter((m) => catalogue.has(m.modelId) && (!group || groupOf(m.credit) === group))
  if (group && jobs.length === 0) throw new Error(`--group ${group}: no catalogue models from that group`)
  return jobs
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port
      s.close(() => resolve(port))
    })
  })
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Grid of portraits with the id under each, on a dark background */
async function writeSheet(file: string, items: { id: string; png: Buffer }[]) {
  const cell = 256
  const label = 30
  const gap = 12
  const cols = Math.min(6, items.length, Math.ceil(Math.sqrt(items.length * 1.5)))
  const rows = Math.ceil(items.length / cols)
  const width = gap + cols * (cell + gap)
  const height = gap + rows * (cell + label + gap)
  const composites: OverlayOptions[] = []
  const tiles: string[] = []
  for (const [i, it] of items.entries()) {
    const x = gap + (i % cols) * (cell + gap)
    const y = gap + Math.floor(i / cols) * (cell + label + gap)
    tiles.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="14" fill="#161d2e"/>` +
        `<text x="${x + cell / 2}" y="${y + cell + 21}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#c9d4ea">${escapeXml(it.id)}</text>`,
    )
    composites.push({ input: await sharp(it.png).resize(cell, cell).png().toBuffer(), left: x, top: y })
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${tiles.join('')}</svg>`
  ensureDir(file)
  await sharp({ create: { width, height, channels: 4, background: '#0b1020' } })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }, ...composites])
    .png()
    .toFile(file)
  console.log(`sheet  ${path.resolve(file)} (${items.length} portraits)`)
}

async function main() {
  const jobs = selectJobs().filter((j) => {
    if (fs.existsSync(outPath(j.file))) return true
    console.warn(`skip   ${j.id}: public/assets/${j.file} not built yet`)
    return false
  })
  if (jobs.length === 0) {
    console.warn('No models to render.')
    return
  }

  const port = await freePort()
  const server = await createServer({
    root: ROOT,
    logLevel: 'warn',
    clearScreen: false,
    server: { port, strictPort: true, host: '127.0.0.1', hmr: false },
  })
  await server.listen()
  const base = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({ executablePath: CHROME, args: CHROME_ARGS, headless: true })
  const rendered: { id: string; png: Buffer }[] = []
  let failed = 0
  try {
    const context = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`))

    const render = async (job: Job) => {
      const url = `${base}/portrait-lab.html?id=${encodeURIComponent(job.modelId)}&deploy=${deploy}`
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForFunction(() => (globalThis as Flags).__portraitReady || (globalThis as Flags).__portraitError, null, {
        timeout: TIMEOUT,
        polling: 100,
      })
      const error = await page.evaluate(() => (globalThis as Flags).__portraitError)
      if (error) throw new Error(error)
      return page.locator('canvas').screenshot({ omitBackground: true, type: 'png' })
    }

    for (const job of jobs) {
      const t0 = Date.now()
      let png: Buffer
      try {
        // A first visit can be interrupted by Vite optimizing dependencies and reloading: retry once
        png = await render(job).catch(() => render(job))
      } catch (e) {
        failed++
        console.error(`fail   ${job.id}: ${e instanceof Error ? e.message : e}`)
        continue
      }
      const out = outPath('img/portraits', `${job.id}.webp`)
      ensureDir(out)
      const square = await sharp(png).resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
      await sharp(square).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toFile(out)
      rendered.push({ id: job.id, png: square })
      console.log(`ok     ${job.id} -> public/assets/img/portraits/${job.id}.webp (${kb(fs.statSync(out).size)}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    }
  } finally {
    await browser.close()
    await server.close()
  }
  if (sheet && rendered.length) await writeSheet(sheet, rendered)
  console.log(`${rendered.length} portrait(s) rendered${failed ? `, ${failed} failed` : ''}`)
  if (failed) process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e)
  process.exit(1)
})
