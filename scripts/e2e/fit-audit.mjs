#!/usr/bin/env node
/**
 * Fit audit: visits every screen of the game at five window sizes and reports what does not fit.
 *
 *   pnpm audit:fit                                   # starts its own Vite dev server
 *   pnpm audit:fit --url http://localhost:5173/      # or uses one that is already running
 *   pnpm audit:fit --sizes 1366x768,800x600 --only design-craft,report
 *
 * Per screen and size it reports:
 *   page      the page itself scrolls (documentElement scroll size larger than the window)
 *   outside   buttons, headings and sliders that sit outside the window and cannot be scrolled to
 *             (outside the window with no scrolling box around them, or clipped by an overflow:hidden box)
 *   covered   buttons and headings whose middle is under another element (overlap)
 *   clipped   text boxes whose text is wider or taller than the box that clips it
 *   scene     3D canvases cut by the window, or drawn at an aspect other than their box (squashed)
 *
 * Screenshots of the window (not the full page) go to shots/fit-audit/<size>/<id>.png (git-ignored),
 * the findings to shots/fit-audit/fit.json and a table to stdout.
 * The screen recipes follow scripts/e2e/clutter-audit.mjs.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright-core'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..')
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const OUT = resolve(ROOT, arg('out', 'shots/fit-audit'))
const SIZES = arg('sizes', '1920x1080,1440x900,1366x768,1280x720,800x600')
  .split(',')
  .map((s) => s.trim().split('x').map(Number))
  .map(([width, height]) => ({ width, height }))
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const SETTLE_MS = Number(arg('settle', '2000'))

// ---------- dev server and browser (as in clutter-audit.mjs) ----------
function freePort() {
  return new Promise((ok, fail) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', fail)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => ok(port))
    })
  })
}
async function startDevServer() {
  const port = await freePort()
  const vite = spawn(join(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  const url = `http://localhost:${port}/`
  const end = Date.now() + 60_000
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => vite.kill() }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  vite.kill()
  throw new Error(`dev server did not answer at ${url}`)
}
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  try {
    const p = chromium.executablePath()
    if (p && existsSync(p)) return p
  } catch {
    // fall through
  }
  const caches = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]
  const tails = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux64/chrome',
    'chrome-linux/chrome',
  ]
  for (const dir of caches) {
    if (!existsSync(dir)) continue
    const builds = readdirSync(dir)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    for (const b of builds) for (const t of tails) if (existsSync(join(dir, b, t))) return join(dir, b, t)
  }
  throw new Error('No Chromium found: run `npx playwright install chromium` or set CHROME_PATH')
}

// ---------- in-page measurement ----------
/** Runs in the page. Kept free of closures: Playwright sends it as source. */
function measureFit() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const de = document.documentElement
  const name = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim()
    return `${el.tagName.toLowerCase()}${t ? ` "${t.slice(0, 40)}"` : ''}`
  }
  const visible = (el) => {
    if (el.closest('[aria-hidden="true"]')) return false
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const scrolls = (cs, axis) => /auto|scroll/.test(axis === 'x' ? cs.overflowX : cs.overflowY)

  // Click-through layers count as covering (as in clutter-audit.mjs); removed again at the end
  const force = document.createElement('style')
  force.textContent = '* { pointer-events: auto !important; }'
  document.head.appendChild(force)
  const page = { w: de.scrollWidth, h: de.scrollHeight, overX: de.scrollWidth - vw, overY: de.scrollHeight - vh }
  const outside = []
  const covered = []
  const IMPORTANT = 'button, [role=button], a[href], input, select, [role=slider], [role=tab], [role=radio], h1, h2, h3'
  for (const el of document.querySelectorAll(IMPORTANT)) {
    if (!visible(el)) continue
    if (el.closest('canvas')) continue
    const r = el.getBoundingClientRect()
    // Reachable unless a box that does not scroll cuts it off, or it sits outside the window with
    // nothing around it (nor the page) able to scroll it into view
    let reach = 'ok'
    let scrollX = false
    let scrollY = false
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
      const cr = p.getBoundingClientRect()
      const canX = scrolls(cs, 'x') && p.scrollWidth > p.clientWidth
      const canY = scrolls(cs, 'y') && p.scrollHeight > p.clientHeight
      // Past a box that scrolls on an axis, that box brings it into view: only boxes inside it can cut it on that axis
      if (!scrollX && !scrolls(cs, 'x') && (r.left < cr.left - 1 || r.right > cr.right + 1)) reach = 'clipped-x'
      if (!scrollY && !scrolls(cs, 'y') && (r.top < cr.top - 1 || r.bottom > cr.bottom + 1)) reach = 'clipped-y'
      scrollX ||= canX
      scrollY ||= canY
      if (reach !== 'ok') break
    }
    scrollX ||= page.overX > 0
    scrollY ||= page.overY > 0 && getComputedStyle(document.body).overflowY !== 'hidden'
    if (reach === 'ok') {
      if ((r.left < -1 || r.right > vw + 1) && !scrollX) reach = 'off-x'
      else if ((r.top < -1 || r.bottom > vh + 1) && !scrollY) reach = 'off-y'
    }
    if (reach !== 'ok') outside.push(`${name(el)} ${reach} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}]`)
    // Overlap: the middle of the element (when in the window) is under something else
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    if (cx > 0 && cy > 0 && cx < vw && cy < vh && reach === 'ok') {
      const hit = document.elementFromPoint(cx, cy)
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
        // A modal backdrop covering everything under it is not an overlap
        // (a pop-up, or a full-window layer such as the result card's backdrop)
        const modal = hit.closest('[role=dialog], [aria-modal=true]')
        let layer = hit
        for (let p = hit; p && p !== document.body; p = p.parentElement) {
          const pr = p.getBoundingClientRect()
          if (pr.width >= vw * 0.95 && pr.height >= vh * 0.95 && /fixed|absolute/.test(getComputedStyle(p).position)) {
            layer = p
            break
          }
          layer = null
        }
        const fullLayer = layer && !layer.contains(el)
        if ((!modal || modal.contains(el)) && !fullLayer) covered.push(`${name(el)} under ${name(hit)}`)
      }
    }
  }
  // Text cut off: a text box that clips its own text
  const clipped = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 2 || !el.textContent || el.textContent.trim().length < 3) continue
    if (el.closest('canvas, svg')) continue
    const cs = getComputedStyle(el)
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible' && cs.webkitLineClamp === 'none') continue
    if (scrolls(cs, 'x') || scrolls(cs, 'y')) continue
    if (!visible(el)) continue
    const overW = el.scrollWidth - el.clientWidth
    const overH = el.scrollHeight - el.clientHeight
    if (overW > 2 || overH > 2) clipped.push(`${name(el)} text ${overW > 2 ? `+${overW}px wide` : ''}${overH > 2 ? ` +${overH}px tall` : ''}${cs.textOverflow === 'ellipsis' ? ' (ellipsis)' : ''}`)
  }
  // 3D scenes
  const scene = []
  for (const cv of document.querySelectorAll('canvas')) {
    if (!visible(cv)) continue
    const r = cv.getBoundingClientRect()
    const drawn = cv.width / cv.height
    const box = r.width / r.height
    if (Math.abs(drawn / box - 1) > 0.03) scene.push(`canvas squashed: drawn ${cv.width}×${cv.height}, shown ${Math.round(r.width)}×${Math.round(r.height)}`)
    const cutX = Math.max(0, -r.left) + Math.max(0, r.right - vw)
    const cutY = Math.max(0, -r.top) + Math.max(0, r.bottom - vh)
    if (cutX > 4 || cutY > 4) scene.push(`canvas cut by the window: ${Math.round(cutX)}px across, ${Math.round(cutY)}px down (box ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`)
  }
  force.remove()
  return { page, outside, covered, clipped: clipped.slice(0, 12), scene }
}

// ---------- driving the game (as in clutter-audit.mjs) ----------
const stores = (page, fn, arg) =>
  page.evaluate(
    async ([src, a]) => {
      const s = {
        game: (await import('/src/state/gameStore.ts')).useGameStore,
        ui: (await import('/src/state/uiStore.ts')).useUiStore,
        world: (await import('/src/state/worldStore.ts')).useWorldStore,
      }
      return new Function('s', 'a', `return (async () => { ${src} })()`)(s, a)
    },
    [fn, arg],
  )
const SKIP_LAUNCH = `
  const inside = (await import('/src/ui/interaction/insideStore.ts')).useInsideStore
  let quiet = 0
  for (let i = 0; i < 40 && quiet < 4; i++) {
    await new Promise((r) => setTimeout(r, 250))
    if (inside.getState().shot || s.ui.getState().launchAt !== null) {
      inside.getState().end(true)
      s.ui.getState().endLaunch()
      quiet = 0
    } else quiet++
  }
`
const pause = (page) => stores(page, `s.world.getState().setSpeed('paused')`)

const STEPS = ['brief', 'planning', 'instruments', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']

const SCREENS = [
  {
    id: 'title',
    go: async (page, url) => {
      await page.goto(url)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.getByRole('button').first().waitFor({ timeout: 60_000 })
    },
  },
  {
    id: 'base',
    go: async (page) => {
      await page.getByRole('button').first().click()
      await page.getByRole('button', { name: /new mission/i }).first().waitFor({ timeout: 60_000 })
      await pause(page)
    },
  },
  { id: 'base-mission', go: (page) => stores(page, `s.world.getState().openMission()`) },
  ...STEPS.flatMap((step) => [
    { id: `design-${step}`, go: (page) => stores(page, `s.game.getState().setDesignStep(a); s.game.getState().setScreen('design')`, step) },
    ...(step === 'ride'
      ? [{ id: 'design-ride-transfer', go: (page) => page.getByRole('button', { name: /plan the transfer/i }).first().click() }]
      : []),
  ]),
  {
    id: 'flight-build',
    go: async (page) => {
      await stores(page, `s.game.getState().updateDesign((await import('/src/sim/fixtures.ts')).flashlightDesign); s.game.getState().startSimulation()`)
      await pause(page)
    },
  },
  {
    id: 'launch',
    go: async (page) => {
      await stores(
        page,
        `
        const g = s.game.getState
        const inside = (await import('/src/ui/interaction/insideStore.ts')).useInsideStore
        for (let i = 0; i < 40 && g().simState.flight.launchedTurn === null; i++) {
          g().advanceTurn()
          await new Promise((r) => setTimeout(r, 80))
        }
        for (let i = 0; i < 40 && !inside.getState().shot && s.ui.getState().launchAt === null; i++) await new Promise((r) => setTimeout(r, 50))
        `,
      )
      await pause(page)
    },
    wait: 600,
    leave: (page) => stores(page, `(await import('/src/ui/interaction/insideStore.ts')).useInsideStore.getState().end(true); s.ui.getState().endLaunch()`),
  },
  {
    id: 'flight-event',
    go: async (page) => {
      await stores(
        page,
        `
        const g = s.game.getState
        for (let attempt = 0; attempt < 30; attempt++) {
          if (attempt > 0) g().startSimulation()
          for (let i = 0; i < 60 && !g().simState.pendingDecision; i++) {
            const sim = g().simState
            if (sim.phase === 'complete' || sim.phase === 'failed' || sim.phase === 'orbit') break
            g().flyOn()
          }
          if (g().simState.pendingDecision) break
        }
        g().clearHistory()
        ${SKIP_LAUNCH}
        `,
      )
      await pause(page)
    },
  },
  {
    id: 'flight-space',
    go: async (page) => {
      await stores(
        page,
        `
        const g = s.game.getState
        const sim = g().simState
        if (sim.pendingDecision) g().answerEvent(sim.pendingDecision.options[0].id)
        ${SKIP_LAUNCH}
        s.ui.getState().setFlightView('space')
        `,
      )
      await pause(page)
    },
  },
  {
    // Fly on to arrival in the science orbit: the first mapping pass (Ice Mapper) asks to begin
    id: 'ice-arrival',
    go: async (page) => {
      await stores(
        page,
        `
        const g = s.game.getState
        const due = (sim) => sim.phase === 'orbit' && sim.flight.captured && sim.flight.scienceTurns === 0 && sim.firstPass === undefined
        for (let i = 0; i < 200; i++) {
          const sim = g().simState
          if (due(sim) || sim.phase === 'complete' || sim.phase === 'failed') break
          if (sim.pendingDecision) g().answerEvent(sim.pendingDecision.options[0].id)
          else g().advanceTurn()
        }
        ${SKIP_LAUNCH}
        s.ui.getState().setFlightView('island')
        `,
      )
      await pause(page)
    },
  },
  {
    id: 'ice-pass',
    go: async (page) => {
      const b = page.getByRole('button', { name: /begin first mapping pass/i })
      if (await b.count()) await b.first().click()
      else console.warn('  ! no mapping pass came up')
    },
  },
  {
    id: 'ice-pass-play',
    go: async (page) => {
      const b = page.getByRole('button', { name: /fly it myself/i })
      if (await b.count()) await b.first().click()
    },
    wait: 4000,
    leave: (page) =>
      stores(page, `s.game.setState((st) => (st.simState && st.simState.firstPass === undefined ? { simState: { ...st.simState, firstPass: { how: 'autopilot', mix: 0 } } } : {}))`),
  },
  {
    id: 'mission-result',
    go: async (page) => {
      await stores(
        page,
        `
        const g = s.game.getState
        for (let i = 0; i < 200; i++) {
          const sim = g().simState
          if (sim.phase === 'complete' || sim.phase === 'failed') break
          if (sim.pendingDecision) g().answerEvent(sim.pendingDecision.options[0].id)
          else g().flyOn()
        }
        ${SKIP_LAUNCH}
        s.ui.getState().setFlightView('island')
        `,
      )
      await pause(page)
    },
  },
  { id: 'report', go: (page) => stores(page, `s.game.getState().showReport()`) },
]

/**
 * `--set craft`: the Craft step and leaving it (the craft carried into the rocket, then the rocket
 * explained), screenshotted through the carry. Needs a branch with the carry (data-testid craft-next).
 */
const CRAFT = [
  ...SCREENS.slice(0, 3),
  { id: 'design-spacecraft', go: (page) => stores(page, `s.game.getState().setDesignStep('spacecraft'); s.game.getState().setScreen('design')`), wait: 4000 },
  { id: 'craft-carry-early', go: (page) => page.getByTestId('craft-next').click(), wait: 1500 },
  { id: 'craft-carry-mid', go: () => {}, wait: 3000 },
  { id: 'craft-carry-late', go: () => {}, wait: 3000 },
  { id: 'craft-explainer', go: (page) => page.getByTestId('explainer-next').waitFor({ timeout: 90_000 }), wait: 2500 },
]
const SET = arg('set', 'all') === 'craft' ? CRAFT : SCREENS

// ---------- main ----------
async function main() {
  let server = null
  let url = arg('url', '')
  if (!url) {
    server = await startDevServer()
    url = server.url
    console.log(`dev server: ${url}`)
  }
  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const all = []
  try {
    for (const size of SIZES) {
      const tag = `${size.width}x${size.height}`
      const dir = join(OUT, tag)
      mkdirSync(dir, { recursive: true })
      const page = await browser.newPage({ viewport: size })
      console.log(`\n== ${tag}`)
      for (const screen of SET) {
        try {
          await screen.go(page, url)
          await page.waitForTimeout(ONLY.length && !ONLY.includes(screen.id) ? 300 : (screen.wait ?? SETTLE_MS))
          if (!ONLY.length || ONLY.includes(screen.id)) {
            const m = await page.evaluate(measureFit)
            await page.screenshot({ path: join(dir, `${screen.id}.png`), timeout: 20_000 }).catch(() => {})
            const issues = [
              ...(m.page.overX > 0 ? [`page scrolls across by ${m.page.overX}px`] : []),
              ...(m.page.overY > 0 ? [`page scrolls down by ${m.page.overY}px`] : []),
              ...m.outside.map((x) => `outside: ${x}`),
              ...m.covered.map((x) => `covered: ${x}`),
              ...m.clipped.map((x) => `clipped: ${x}`),
              ...m.scene,
            ]
            all.push({ size: tag, id: screen.id, ...m, issues })
            console.log(`${screen.id.padEnd(22)} ${issues.length ? issues.length + ' issue(s)' : 'ok'}`)
            for (const i of issues) console.log(`    ${i}`)
          }
          if (screen.leave) {
            await screen.leave(page)
            await page.waitForTimeout(300)
          }
        } catch (e) {
          console.log(`${screen.id.padEnd(22)} ! ${e.message.split('\n')[0]}`)
        }
      }
      await page.close()
    }
  } finally {
    await browser.close()
    server?.stop()
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'fit.json'), JSON.stringify(all, null, 2) + '\n')
  const bad = all.filter((r) => r.issues.length)
  console.log(`\n${bad.length} of ${all.length} screen×size checks have issues; details in ${join(OUT, 'fit.json')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
