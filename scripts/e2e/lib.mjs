// Shared helpers for the Hands on Hardware Playwright checks (SwiftShader Chromium, no GPU needed).
// Start the dev server first:  pnpm dev --port 5199 --strictPort
// Then run a check:           node scripts/e2e/factory-fit.mjs
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const URL = process.env.E2E_URL ?? 'http://localhost:5199/'

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const root = join(homedir(), '.cache/ms-playwright')
  const dir = existsSync(root) ? readdirSync(root).find((d) => /^chromium-\d+$/.test(d)) : undefined
  return dir ? join(root, dir, 'chrome-linux64/chrome') : undefined
}

export async function open({ width = 1440, height = 900 } = {}) {
  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForFunction(() => !!window.__moonshot, null, { timeout: 30000 })
  return { browser, page, errors }
}

/** Skip the opening and go straight to a design step */
export async function gotoStep(page, step) {
  await page.evaluate((step) => {
    const m = window.__moonshot
    m.ui.getState().finishOpening()
    m.game.getState().setScreen('design')
    m.game.getState().setDesignStep(step)
  }, step)
  await page.waitForTimeout(5000)
}

export const design = (page) => page.evaluate(() => window.__moonshot.game.getState().design)

/** Drag with real pointer events from one point to another, in steps so every slot on the way feels it */
export async function drag(page, from, to, { steps = 24, hold = 250 } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps })
  await page.waitForTimeout(hold)
  await page.mouse.up()
  await page.waitForTimeout(400)
}

export async function centre(page, selector) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`no element for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export async function shot(page, name) {
  mkdirSync('shots', { recursive: true })
  await page.screenshot({ path: `shots/${name}.png` })
}

export function check(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg)
    process.exitCode = 1
  } else console.log('ok  ', msg)
}
