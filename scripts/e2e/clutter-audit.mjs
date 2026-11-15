#!/usr/bin/env node
/**
 * Clutter audit: visits every screen of the game at 1440×900 and measures how much is on it.
 *
 *   pnpm audit:clutter                       # starts its own Vite dev server on a free port
 *   pnpm audit:clutter --out shots/clutter-audit --json docs/design/clutter-baseline.json --md docs/design/clutter-baseline.md
 *   pnpm audit:clutter --only design-instruments,report   # a few screens (still writes the files)
 *   pnpm audit:clutter --from launch                      # open the game, jump to one screen and go on from
 *                                                         # there (quick checks; writes no baseline)
 *
 * It always starts its own dev server (a long-running one, or one from another checkout, measured the
 * wrong thing): a dev server, not a preview build, because it reaches each screen by importing the game's
 * stores through Vite's module URLs (/src/state/*.ts), which are the same instances the page uses.
 *
 * Per screen it counts, on the page as drawn (the 3D scene's own labels, placed by script, counted apart):
 *   buttons  visible buttons and other controls (button, link, input, select, role=button/tab/radio/...)
 * Before measuring, each screen checks it is really there (game state plus a marker on top, `expect`);
 * if not, the run stops with the screen's id and a <id>.WRONG.png screenshot, and writes no baseline.
 *
 * Only what is on top counts (sampled with elementFromPoint): a pop-up's backdrop or the launch cinematic hides
 * what is under it. Content below the fold of a scrolling step screen counts.
 *
 *   numbers  visible numbers that carry a unit, %, $ or a Day/Month/Level word ("$18.8M", "68%", "120 kg", "Day 120")
 *   words    visible words (runs of letters)
 *   panels   distinct panels or cards: boxes of 120×40 px or more with their own background or a full border
 *   scene    items in the 3D scene: labels and markers anchored to it (drei <Html> overlays), with their own counts
 *
 *   score = numbers×2 + buttons + panels×3 + words/40      (scene items are reported, not scored)
 *
 * Writes a full-page screenshot per screen (default shots/clutter-audit/, git-ignored),
 * docs/design/clutter-baseline.json and docs/design/clutter-baseline.md (worst first).
 * Run it on two branches and compare the two .md tables for a before/after.
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright-core'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..')
const VIEWPORT = { width: 1440, height: 900 }

// ---------- arguments ----------
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const OUT = resolve(ROOT, arg('out', 'shots/clutter-audit'))
const JSON_OUT = resolve(ROOT, arg('json', 'docs/design/clutter-baseline.json'))
const MD_OUT = resolve(ROOT, arg('md', 'docs/design/clutter-baseline.md'))
const ONLY = arg('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const SETTLE_MS = Number(arg('settle', '2500'))
/** Start at this screen (after opening the game): for checking one part of the run quickly; writes no baseline */
const FROM = arg('from', '')

// ---------- dev server ----------
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

async function waitForServer(url, ms = 60_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`dev server did not answer at ${url}`)
}

async function startDevServer() {
  const port = await freePort()
  const vite = spawn(join(ROOT, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  let log = ''
  vite.stdout.on('data', (d) => (log += d))
  vite.stderr.on('data', (d) => (log += d))
  const url = `http://localhost:${port}/`
  try {
    await waitForServer(url)
  } catch (e) {
    vite.kill()
    throw new Error(`${e.message}\n${log}`)
  }
  return { url, stop: () => vite.kill() }
}

// ---------- browser ----------
/** Playwright's own Chromium if it is installed, else the newest one in the Playwright cache, else CHROME_PATH */
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
function measureInPage() {
  const CONTROL =
    'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=slider], [role=menuitem], [role=option], [role=link]'
  const vw = window.innerWidth
  const vh = window.innerHeight
  const laidOut = (el) => {
    if (!(el instanceof Element)) return false
    if (el.closest('[aria-hidden="true"]')) return false
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  // On top: something covering the whole thing (a cinematic, a pop-up's backdrop) hides it.
  // Sampled at five points with pointer events forced on, so click-through overlays count as covering.
  // Parts below the fold (the step screens scroll) cannot be tested and count as shown.
  const force = document.createElement('style')
  force.textContent = '* { pointer-events: auto !important; }'
  document.head.appendChild(force)
  const onTopCache = new Map()
  const onTop = (el, rect) => {
    if (!rect && onTopCache.has(el)) return onTopCache.get(el)
    const r = rect || el.getBoundingClientRect()
    const pts = [
      [0.5, 0.5],
      [0.2, 0.2],
      [0.8, 0.2],
      [0.2, 0.8],
      [0.8, 0.8],
    ].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
    const inView = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh)
    let ok = inView.length === 0
    for (const [x, y] of inView) {
      const hit = document.elementFromPoint(x, y)
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) {
        ok = true
        break
      }
    }
    if (!rect) onTopCache.set(el, ok)
    return ok
  }
  const shown = (el) => laidOut(el) && onTop(el)

  // Panels/cards: a box with its own background or a full border, big enough to hold content,
  // not a control, not a page-sized wrapper, and not the same box as its parent
  const isPanel = (el) => {
    if (el.matches(CONTROL) || el.closest(CONTROL)) return false
    if (el.tagName === 'CANVAS' || el.tagName === 'svg' || el.closest('svg')) return false
    const r = el.getBoundingClientRect()
    if (r.width < 120 || r.height < 40) return false
    if (r.width * r.height > vw * vh * 0.8) return false
    const cs = getComputedStyle(el)
    const bg = cs.backgroundColor
    const hasBg = bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(
      (s) => parseFloat(cs[`border${s}Width`]) >= 1 && cs[`border${s}Style`] !== 'none',
    ).length
    if (!hasBg && sides < 4) return false
    const p = el.parentElement
    if (p) {
      const pr = p.getBoundingClientRect()
      if (Math.abs(pr.width - r.width) < 2 && Math.abs(pr.height - r.height) < 2 && Math.abs(pr.top - r.top) < 2) {
        // Same box as the parent: only the outer one counts, and only if the parent is a panel itself
        const pcs = getComputedStyle(p)
        const pbg = pcs.backgroundColor
        if ((pbg && pbg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(pbg)) || parseFloat(pcs.borderTopWidth) >= 1) return false
      }
    }
    return true
  }
  // The 3D scene: the box around each <canvas> (its highest ancestor of the same size) holds the scene and
  // whatever is laid over it. Labels and markers placed in that box are scene items; panels laid over it
  // (an event card, a dialog) are interface and count as panels, not scene.
  const sceneRoots = []
  const sceneShown = (c) => {
    if (!laidOut(c)) return null
    const cr = c.getBoundingClientRect()
    let box = c.parentElement
    while (box.parentElement && box.parentElement !== document.body) {
      const r = box.parentElement.getBoundingClientRect()
      if (Math.abs(r.width - cr.width) > 6 || Math.abs(r.height - cr.height) > 6) break
      box = box.parentElement
    }
    // The scene is on top when its box (canvas or its own labels) is what is hit, not a backdrop over it
    return onTop(box) ? { cr, box } : null
  }
  for (const c of document.querySelectorAll('canvas')) {
    const sc = sceneShown(c)
    if (!sc) continue
    const { cr, box } = sc
    const walk = (el) => {
      for (const child of el.children) {
        if (child === c || child.contains(c) || !laidOut(child)) {
          if (child.contains(c) && child !== c) walk(child)
          continue
        }
        if (isPanel(child)) continue
        const cs = getComputedStyle(child)
        const r = child.getBoundingClientRect()
        // A scene label is placed by script, frame by frame (an inline transform or left/top: BaseMap's
        // labels, drei <Html>); a HUD laid over the canvas by CSS classes is interface, not scene
        const placed =
          (cs.position === 'absolute' || cs.position === 'fixed') &&
          !!(child.style.transform || child.style.left || child.style.top)
        const small = r.width * r.height < cr.width * cr.height * 0.5
        if (placed && small && ((child.innerText || '').trim() || child.matches(CONTROL) || child.querySelector(CONTROL))) {
          // Labels are often moved by a transform outside their wrapper's box: test the parts too
          const parts = [child, ...child.querySelectorAll('*')].slice(0, 30)
          if (parts.some((d) => laidOut(d) && onTop(d))) sceneRoots.push(child)
          continue
        }
        walk(child)
      }
    }
    walk(box)
  }
  const inScene = (el) => sceneRoots.some((r) => r === el || r.contains(el))

  // Text, words and numbers, from innerText (it skips hidden nodes and joins split spans like "$1" "8.8M")
  const UNIT =
    '(?:%|kg|g|t|W|Wh|kW|V|m\\/s|km\\/s|km|m|MB|GB|kB|TB|kbps|Mbps|bps|M|B|K|k|days?|d|months?|mo|hours?|hrs?|h|min|s|years?|yrs?|°|U|x|×|dB|AU)'
  const NUM = '\\d[\\d,]*(?:\\.\\d+)?'
  const numberRe = new RegExp(
    [
      `[$€]\\s?${NUM}\\s?[MKBk]?`, // $18.8M
      `${NUM}\\s?${UNIT}(?![A-Za-z])`, // 120 kg, 68%, 3 months
      `\\b(?:day|month|turn|level|lvl|year|week|step)\\s+${NUM}`, // Day 120, Month 0
    ].join('|'),
    'gi',
  )
  const textStats = (text) => {
    const words = (text.match(/\p{L}[\p{L}'’-]*/gu) || []).length
    const numbers = (text.match(numberRe) || []).length
    const bareNumbers = (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).length
    return { words, numbers, bareNumbers }
  }
  // Visible text, block by block: text nodes in one block join without a gap (split-flap digits like
  // "$1" "8.8M" stay one number); blocks are separated by a newline. A text node counts when its
  // element is laid out and its own box is on top.
  const blockOf = (el) => {
    let e = el
    while (e && e !== document.body && getComputedStyle(e).display.startsWith('inline')) e = e.parentElement
    return e
  }
  const uiBlocks = new Map()
  const sceneBlocks = new Map()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.nodeValue
    if (!t || !t.trim()) continue
    const el = n.parentElement
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(el.tagName) || !laidOut(el)) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    const rr = range.getBoundingClientRect()
    if (rr.width < 1 || rr.height < 1 || !onTop(el, rr)) continue
    const block = blockOf(el)
    const map = inScene(el) ? sceneBlocks : uiBlocks
    map.set(block, (map.get(block) || '') + t)
  }
  const ui = textStats([...uiBlocks.values()].join('\n'))
  const scn = textStats([...sceneBlocks.values()].join('\n'))

  // Controls: outermost visible ones (a button inside a button counts once)
  const controls = [...document.querySelectorAll(CONTROL)].filter(
    (el) => shown(el) && !el.disabled && !el.parentElement?.closest(CONTROL),
  )
  const uiControls = controls.filter((el) => !inScene(el))
  const sceneControls = controls.length - uiControls.length

  const panelEls = [...document.body.querySelectorAll('*')].filter((el) => shown(el) && isPanel(el))
  const uiPanels = panelEls.filter((el) => !inScene(el))

  // A short list of what is on the screen, to write the keep/hide/delete lists from
  const label = (el) =>
    (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
  const panelHeads = uiPanels
    .filter((el) => !uiPanels.some((o) => o !== el && o.contains(el)))
    .map((el) => {
      const h = el.getAttribute('aria-label') || el.querySelector('h1,h2,h3,.fp-label')?.innerText || el.innerText
      return (h || '').replace(/\s+/g, ' ').trim().slice(0, 50)
    })

  force.remove()
  return {
    buttons: uiControls.length,
    numbers: ui.numbers,
    bareNumbers: ui.bareNumbers,
    words: ui.words,
    panels: uiPanels.length,
    scene: {
      items: sceneRoots.length,
      buttons: sceneControls,
      words: scn.words,
      numbers: scn.numbers,
      canvases: [...document.querySelectorAll('canvas')].filter((c) => sceneShown(c)).length,
    },
    // How many screens tall the content is (the step screens scroll inside <main>, not the page)
    screensTall:
      Math.round(
        (Math.max(
          document.documentElement.scrollHeight,
          ...[...document.querySelectorAll('main, [class*="overflow-auto"], [class*="overflow-y-auto"]')]
            .filter((el) => el.clientHeight > vh * 0.5)
            .map((el) => el.scrollHeight + (vh - el.clientHeight)),
        ) /
          vh) *
          10,
      ) / 10,
    controls: uiControls.map(label).filter(Boolean),
    sceneLabels: sceneRoots.map((r) => (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean),
    topPanels: panelHeads,
  }
}

/**
 * Runs in the page before the screenshot: lets inner scroll areas (the step screens scroll inside
 * <main>) grow to their full height, so the full-page screenshot shows everything. Returns nothing;
 * undo with `restoreInPage`.
 */
function expandInPage() {
  const changed = []
  const set = (el, prop, value) => {
    changed.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)])
    el.style.setProperty(prop, value, 'important')
  }
  const scrollers = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el)
    return (
      /(auto|scroll)/.test(cs.overflowY) &&
      el.scrollHeight > el.clientHeight + 40 &&
      el.clientHeight > innerHeight * 0.5 &&
      el.clientWidth > innerWidth * 0.6
    )
  })
  for (const el of scrollers) {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      set(e, 'overflow', 'visible')
      set(e, 'height', 'auto')
      set(e, 'max-height', 'none')
    }
  }
  window.__clutterRestore = changed
}
function restoreInPage() {
  for (const [el, prop, value, prio] of (window.__clutterRestore || []).reverse()) {
    if (value) el.style.setProperty(prop, value, prio)
    else el.style.removeProperty(prop)
  }
  window.__clutterRestore = []
}

const score = (m) => Math.round((m.numbers * 2 + m.buttons + m.panels * 3 + m.words / 40) * 10) / 10

// ---------- driving the game ----------
/** Run code against the game's stores inside the page */
const stores = (page, fn, arg) =>
  page.evaluate(
    async ([src, a]) => {
      // The app's own store instances. After a hot reload Vite serves modules as /src/x.ts?t=…, and a
      // plain import('/src/x.ts') would give a second, stale copy that the page never reads. So: the
      // stores the app hands out on window.__moonshot (src/devHook.ts), and for the world store, which
      // it does not hand out, the newest URL the page loaded, checked against the hook's game store.
      const hook = window.__moonshot
      if (!hook) throw new Error('window.__moonshot is missing: run the audit against a dev server (pnpm dev), not a build')
      const newest = async (path) => {
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => new URL(u).pathname === path)
        return import(urls.length ? urls[urls.length - 1] : path)
      }
      if ((await newest('/src/state/gameStore.ts')).useGameStore !== hook.game)
        throw new Error('the dev server serves stale modules (hot reload): restart it and run the audit again')
      const s = {
        game: hook.game,
        ui: hook.ui,
        inside: hook.inside,
        world: (await newest('/src/state/worldStore.ts')).useWorldStore,
      }
      // h: is a marker on top? Plain hit-testing: click-through decoration (a pulsing ring) does not
      // hide it, a pop-up's backdrop or another screen does
      const h = {
        onTop: (sel) =>
          [...document.querySelectorAll(sel)].some((el) => {
            const r = el.getBoundingClientRect()
            if (r.width < 2 || r.height < 2) return false
            const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1)
            const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 40), 0), innerHeight - 1)
            const hit = document.elementFromPoint(x, y)
            return !!hit && (hit === el || el.contains(hit))
          }),
        inside: async () => s.inside.getState(),
        // a button whose text matches is on top
        buttonOnTop: (re) =>
          [...document.querySelectorAll('button')].some((el) => {
            if (!re.test(el.innerText || el.getAttribute('aria-label') || '')) return false
            const r = el.getBoundingClientRect()
            if (r.width < 2 || r.height < 2) return false
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return !!hit && (hit === el || el.contains(hit))
          }),
      }
      return new Function('s', 'a', 'h', `return (async () => { ${src} })()`)(s, a, h)
    },
    [fn, arg],
  )

/**
 * Skip any launch that is playing or about to start (liftoff starts it a frame or two after the
 * month flips), until none has played for a second
 */
const SKIP_LAUNCH = `
  const inside = s.inside
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
/**
 * Give the flight a fixed seed, so the same branch flies the same flight (same events, same report)
 * on every run and a before/after compares designs, not luck. startSimulation() picks a random seed;
 * this replaces the fresh flight with the same one on seed `n`.
 */
const reseed = (n) => `
  {
    const { initSim } = await import('/src/sim/simulate.ts')
    const gs = s.game.getState()
    s.game.setState({ simState: initSim(gs.design, gs.difficulty, ${n}) })
  }
`
/**
 * Click a button: a page busy drawing its 3D scene in software can take long to take a click, so
 * wait up to 90 s and try once more before giving up
 */
async function click(locator) {
  try {
    await locator.click({ timeout: 90_000 })
  } catch {
    await locator.click({ timeout: 90_000, force: true })
  }
}

const pause = (page) => stores(page, `s.world.getState().setSpeed('paused')`)
const settle = (page, ms = SETTLE_MS) => page.waitForTimeout(ms)

/**
 * The steps in play order with their player-facing names, read from the game's own single source
 * (src/ui/kit/stepNumbers.ts: STEP_ORDER and STEP_NAMES), so a renamed or folded step is followed
 * here without editing the audit
 */
function readSteps() {
  const src = readFileSync(join(ROOT, 'src/ui/kit/stepNumbers.ts'), 'utf8')
  const order = src.match(/STEP_ORDER[^=]*=\s*\[([^\]]*)\]/)
  if (!order) throw new Error('src/ui/kit/stepNumbers.ts: STEP_ORDER not found; update readSteps() in the audit')
  const ids = [...order[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1])
  const names = src.slice(src.indexOf('STEP_NAMES'))
  return ids.map((id) => {
    const m = names.match(new RegExp(`['"]?${id}['"]?\\s*:\\s*'([^']+)'`))
    return [id, m ? m[1] : id]
  })
}
const STEPS = readSteps()

/** Each screen: id, name, how to reach it from the screen before (screens run in this order) */
const SCREENS = [
  {
    id: 'title',
    expect: `return !s.ui.getState().openingDone && /begin/i.test(document.body.innerText) ? '' : 'the opening curtain is not showing'`,
    name: 'Title (opening curtain)',
    go: async (page, url) => {
      await page.goto(url)
      await page.getByRole('button').first().waitFor({ timeout: 180_000 })
      // Load what the run imports later now: Vite may reload the page the first time it optimizes a
      // dependency, and that must happen here, not in the middle of a measurement
      await page
        .evaluate(async () => {
          await import('/src/sim/simulate.ts')
          await import('/src/sim/fixtures.ts')
        })
        .catch(() => {})
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(1500)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.getByRole('button').first().waitFor({ timeout: 180_000 })
    },
  },
  {
    id: 'base',
    expect: `const g = s.game.getState(); return g.screen === 'base' && !g.simState && !s.world.getState().missionOpen && h.onTop('section[aria-label="Current mission"]') ? '' : \`screen \${g.screen}, mission open \${s.world.getState().missionOpen}, or the mission panel is covered\``,
    name: 'Base map (no mission)',
    go: async (page) => {
      await click(page.getByRole('button').first())
      await page.getByRole('button', { name: /new mission/i }).first().waitFor({ timeout: 180_000 })
      await pause(page)
    },
  },
  {
    id: 'panel-funds',
    expect: `return s.ui.getState().agencyWalletDetail === 'funds' ? '' : 'the funds panel is not open'`,
    name: 'Agency panel: Funds',
    go: (page) => stores(page, `s.ui.getState().setAgencyWalletDetail('funds')`),
    leave: (page) => stores(page, `s.ui.getState().setAgencyWalletDetail(null)`),
  },
  {
    id: 'panel-popularity',
    expect: `return s.ui.getState().agencyWalletDetail === 'popularity' ? '' : 'the popularity panel is not open'`,
    name: 'Agency panel: Popularity',
    go: (page) => stores(page, `s.ui.getState().setAgencyWalletDetail('popularity')`),
    leave: (page) => stores(page, `s.ui.getState().setAgencyWalletDetail(null)`),
  },
  {
    id: 'panel-settings',
    expect: `return h.onTop('input[type=range]') ? '' : 'no settings slider on top'`,
    name: 'Agency panel: Sound & graphics settings',
    go: (page) => click(page.getByRole('button', { name: /settings/i }).first()),
    leave: (page) => click(page.getByRole('button', { name: /settings/i }).first()),
  },
  {
    // HQ and "New mission" both open the campaign since the campaign ladder replaced the new-mission dialog
    id: 'panel-campaign',
    expect: `return h.onTop('[role=dialog][aria-label="Campaign"]') ? '' : 'the campaign is not on top'`,
    name: 'Agency panel: Headquarters (campaign)',
    go: (page) => click(page.locator('button', { hasText: /headquarters/i }).first()),
    leave: (page) => click(page.locator('[role=dialog][aria-label="Campaign"] button', { hasText: /close/i }).first()),
  },
  {
    id: 'base-mission',
    expect: `const g = s.game.getState(); return g.screen === 'base' && !g.simState && s.world.getState().missionOpen && h.onTop('section[aria-label="Current mission"]') ? '' : \`screen \${g.screen}, mission open \${s.world.getState().missionOpen}\``,
    name: 'Base map (mission chosen)',
    go: (page) => stores(page, `s.world.getState().openMission()`),
  },
  ...STEPS.flatMap(([step, label], i) => [
    {
      id: `design-${step}`,
      name: `Step ${i}: ${label}`,
      go: (page) =>
        stores(page, `s.ui.getState().setRideView?.('launch'); s.game.getState().setDesignStep(a); s.game.getState().setScreen('design')`, step),
      expect: `const g = s.game.getState(); return g.screen === 'design' && g.designStep === ${JSON.stringify(step)} && h.onTop('[data-role]') ? '' : \`screen \${g.screen}, step \${g.designStep}\``,
    },
    // The Ride step has two views: the launch, and the trip (the dock's "Trip" tab), kept in uiStore.rideView
    ...(step === 'ride'
      ? [
          {
            id: 'design-ride-transfer',
            name: `Step ${i}b: Trip (Ride's second view)`,
            go: async (page) => {
              const ok = await stores(page, `if (!('rideView' in s.ui.getState())) return false; s.ui.getState().setRideView('transfer'); return true`)
              if (!ok) throw new Error('uiStore has no rideView: the Ride step changed, update this screen in the audit')
            },
            expect: `const g = s.game.getState(); return g.screen === 'design' && g.designStep === 'ride' && s.ui.getState().rideView === 'transfer' && h.onTop('[data-role]') ? '' : \`step \${g.designStep}, ride view \${s.ui.getState().rideView}\``,
          },
        ]
      : []),
  ]),
  {
    id: 'flight-build',
    expect: `const g = s.game.getState(); return g.screen === 'base' && g.simState && g.simState.flight.launchedTurn === null ? '' : \`screen \${g.screen}, flight \${g.simState ? 'launched' : 'none'}\``,
    name: 'Flight: build months on the base',
    go: async (page) => {
      // The flight flies the Lunar Flashlight reference design: main's starting design often fails at
      // launch, before any event card or the science orbit shows up
      await stores(
        page,
        `s.game.getState().updateDesign((await import('/src/sim/fixtures.ts')).flashlightDesign); s.game.getState().startSimulation(); ${reseed(1001)}`,
      )
      await pause(page)
    },
  },
  {
    id: 'launch',
    expect: `const g = s.game.getState(); return g.simState?.flight.launchedTurn != null && s.ui.getState().launchAt !== null && !/fly the ride to orbit/i.test(document.body.innerText) ? '' : \`no countdown is playing (launched in month \${g.simState?.flight.launchedTurn}, launchAt \${s.ui.getState().launchAt})\``,
    name: 'Liftoff (countdown on the island)',
    go: async (page) => {
      // Fly the build and test months one by one (React must see liftoff happen to start the launch)
      await stores(
        page,
        `
        const g = s.game.getState
        for (let i = 0; i < 40 && g().simState.flight.launchedTurn === null; i++) {
          // An event card (a build delay) holds the clock until it is answered
          const card = g().simState.pendingDecision
          if (card) g().answerEvent(card.options[0].id)
          else g().advanceTurn()
          await new Promise((r) => setTimeout(r, 80))
        }
        for (let i = 0; i < 40 && s.ui.getState().launchAt === null; i++) await new Promise((r) => setTimeout(r, 50))
        `,
      )
      await pause(page)
    },
    wait: 1500,
  },
  {
    // After the island countdown, Launch Day: the player flies the ride to orbit (a mini-game)
    id: 'launch-game',
    expect: `return h.buttonOnTop(/start countdown/i) ? '' : 'the Launch Day briefing is not on top'`,
    name: 'Launch Day: briefing',
    go: (page) => page.getByRole('button', { name: /start countdown/i }).first().waitFor({ timeout: 180_000 }),
  },
  {
    id: 'launch-game-flying',
    expect: `return h.onTop('button[aria-label$=" now"], button[aria-label="Nothing to do yet"]') ? '' : 'the Launch Day flight is not on top'`,
    name: 'Launch Day: flying',
    go: (page) => click(page.getByRole('button', { name: /start countdown/i }).first()),
    wait: 4000,
    // The ride flies itself through (a missed mark counts as a late tap); then its result slip
    // hands back to the flight, which opens the space view
    leave: async (page) => {
      // The ride runs on the page's frame rate, which the 3D map underneath starves in a software-
      // rendered browser: hide the WebGL canvases (those whose 2D context is unavailable) until it lands
      await page.evaluate(() => {
        for (const c of document.querySelectorAll('canvas')) if (c.getContext('2d') === null) c.dataset.clutter3d = ''
        const style = document.createElement('style')
        style.id = 'clutter-no-3d'
        style.textContent = 'canvas[data-clutter3d] { display: none !important; }'
        document.head.appendChild(style)
      })
      const done = page.getByRole('button', { name: /watch it fly to the moon/i }).first()
      await done.waitFor({ timeout: 600_000 })
      await page.evaluate(() => document.getElementById('clutter-no-3d')?.remove())
      await click(done)
    },
  },
  {
    id: 'flight-space',
    expect: `const g = s.game.getState(); const i = await h.inside(); return g.screen === 'base' && s.ui.getState().flightView === 'space' && g.simState?.flight.launchedTurn != null && !i.shot && h.buttonOnTop(/advance one month/i) ? '' : \`view \${s.ui.getState().flightView}, shot \${i.shot?.id ?? 'none'}\``,
    name: 'Flight HUD (space view)',
    go: async (page) => {
      await stores(
        page,
        `
        // Straight after the launch: in transit, before any arrival prompt or event card
        ${SKIP_LAUNCH}
        s.ui.getState().setFlightView('space')
        `,
      )
      await pause(page)
    },
  },
  {
    id: 'flight-event',
    expect: `const g = s.game.getState(); return g.screen === 'base' && g.simState?.pendingDecision && h.buttonOnTop(/\\[1\\]/) ? '' : 'no event card on top'`,
    name: 'Flight with an event card',
    go: async (page) => {
      const ok = await stores(
        page,
        `
        const g = s.game.getState
        for (let attempt = 0; attempt < 30; attempt++) {
          if (attempt > 0) {
            g().startSimulation()
            ${reseed('2000 + attempt')}
          }
          // A card before arrival: once the craft is in lunar orbit the first mapping pass (a mini-game)
          // takes the screen, so a flight that gets there without a card is tried again on the next seed
          for (let i = 0; i < 60 && !g().simState.pendingDecision; i++) {
            const sim = g().simState
            if (sim.phase === 'complete' || sim.phase === 'failed' || sim.flight.captured) break
            g().flyOn()
          }
          if (g().simState.pendingDecision && !g().simState.flight.captured) break
        }
        // The flights tried before this one finished and went into the run history: the report
        // should show a first play's history (this flight only)
        g().clearHistory()
        ${SKIP_LAUNCH}
        return !!g().simState.pendingDecision && !g().simState.flight.captured
        `,
      )
      await pause(page)
      if (!ok) throw new Error('flight-event: no event card came up before arrival in 30 seeded flights')
    },
  },
  {
    id: 'mission-result',
    expect: `const g = s.game.getState(); const sim = g.simState; return sim && (sim.phase === 'complete' || sim.phase === 'failed') && h.buttonOnTop(/see the report/i) ? '' : \`phase \${sim?.phase}, or no result pop-up with "See the report" on top\``,
    name: 'Mission result pop-up',
    go: async (page) => {
      await stores(
        page,
        `
        const g = s.game.getState
        for (let i = 0; i < 200; i++) {
          const sim = g().simState
          if (sim.phase === 'complete' || sim.phase === 'failed') break
          // On arrival the flight waits for the first mapping pass (the Ice Mapper mini-game): record it
          // as skipped, as its own Skip does
          const passDue = sim.phase === 'orbit' && sim.flight.captured && sim.flight.scienceTurns === 0 && sim.firstPass === undefined
          if (passDue) s.game.setState({ simState: { ...sim, firstPass: { how: 'skipped', mix: 0 } } })
          else if (sim.pendingDecision) g().answerEvent(sim.pendingDecision.options[0].id)
          else g().flyOn()
        }
        ${SKIP_LAUNCH}
        s.ui.getState().setFlightView('island')
        `,
      )
      await pause(page)
    },
  },
  {
    id: 'report',
    expect: `const g = s.game.getState(); return g.screen === 'report' ? '' : \`screen \${g.screen}\``,
    name: 'Report',
    go: (page) => stores(page, `s.game.getState().showReport()`),
  },
]

// ---------- output ----------
function gitInfo() {
  const sh = (c) => {
    try {
      return execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  return { branch: sh('git rev-parse --abbrev-ref HEAD'), commit: sh('git rev-parse --short HEAD') }
}

function writeReports(results, meta) {
  const sorted = [...results].sort((a, b) => b.score - a.score)
  mkdirSync(dirname(JSON_OUT), { recursive: true })
  writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        ...meta,
        score: 'numbers*2 + buttons + panels*3 + words/40',
        screens: sorted.map(({ controls, sceneLabels, topPanels, ...r }) => ({ ...r, controls, sceneLabels, topPanels })),
      },
      null,
      2,
    ) + '\n',
  )
  const row = (r, i) =>
    `| ${i + 1} | ${r.name} | **${r.score}** | ${r.numbers} | ${r.buttons} | ${r.panels} | ${r.words} | ${r.scene.items} | ${r.screensTall} | ${r.numbers > 3 ? `+${r.numbers - 3}` : 'ok'} |`
  const md = [
    '# Clutter baseline',
    '',
    `Measured by \`pnpm audit:clutter\` (scripts/e2e/clutter-audit.mjs) on \`${meta.branch}\` @ \`${meta.commit}\`, ${meta.date}, at ${VIEWPORT.width}×${VIEWPORT.height}.`,
    '',
    '**Score** = numbers×2 + buttons + panels×3 + words/40. Higher is more cluttered. Numbers weigh most because the',
    'screen budget allows three; panels weigh three because each one is a separate place the eye has to visit.',
    '',
    '- **numbers**: visible numbers with a unit, %, $ or Day/Month word ("$18.8M", "68%", "120 kg", "Day 120").',
    '- **buttons**: visible, enabled controls outside the 3D scene (buttons, links, inputs, tabs, radios…).',
    '- **panels**: boxes ≥ 120×40 px with their own background or a full border (cards inside panels count too).',
    '- **words**: visible words outside the 3D scene, including text further down a scrolling step screen.',
    '- Everything counts only where it is on top: panels under a pop-up\'s backdrop or a cinematic do not count;',
    '  content below the fold of a scrolling screen does (see screens tall).',
    '- The flight screens fly the Lunar Flashlight reference design (src/sim/fixtures.ts): main\'s starting design',
    '  often fails at launch, before an event card or the science orbit shows. The nine steps show the starting design.',
    '- **scene**: labels and markers drawn inside the 3D scene (not scored; listed so a redesign does not just move clutter there).',
    '- **screens tall**: how many 900 px screens the content needs (1 = fits; more means scrolling).',
    '- **over budget**: numbers above the 3 the budget allows (the six-resource line is not separated out yet).',
    '',
    '| # | Screen | Score | Numbers | Buttons | Panels | Words | Scene items | Screens tall | Numbers over budget |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...sorted.map(row),
    '',
    'Screenshots: `shots/clutter-audit/<id>.png` (git-ignored; re-run the audit to make them).',
    '',
  ].join('\n')
  writeFileSync(MD_OUT, md)
  return sorted
}

// ---------- main ----------
async function main() {
  const server = await startDevServer()
  const url = server.url
  console.log(`dev server: ${url}`)
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: chromePath(),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const results = []
  const errors = []
  try {
    const page = await browser.newPage({ viewport: VIEWPORT })
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)))
    const fromAt = FROM ? SCREENS.findIndex((x) => x.id === FROM) : 0
    if (fromAt < 0) throw new Error(`--from ${FROM}: no such screen (${SCREENS.map((x) => x.id).join(', ')})`)
    for (const [n, screen] of SCREENS.entries()) {
      // --from: open the game (title, base), then skip to the chosen screen
      if (n < fromAt && n > 1) continue
      process.stdout.write(`${screen.id.padEnd(20)} `)
      await screen.go(page, url)
      await settle(page, screen.wait ?? SETTLE_MS)
      // Fail loudly rather than measure the wrong screen
      // (retried for up to 15 s: a pop-up may still be animating in on a busy machine)
      let wrong = screen.expect ? await stores(page, screen.expect) : ''
      for (let t = 0; wrong && t < 15; t++) {
        await page.waitForTimeout(1000)
        wrong = await stores(page, screen.expect)
      }
      if (wrong) {
        await page.screenshot({ path: join(OUT, `${screen.id}.WRONG.png`), timeout: 20_000 }).catch(() => {})
        throw new Error(`${screen.id}: expected screen is not on top (${wrong}); see ${join(OUT, screen.id)}.WRONG.png. No baseline written.`)
      }
      if (!ONLY.length || ONLY.includes(screen.id)) {
        const m = await page.evaluate(measureInPage)
        await page.evaluate(expandInPage)
        await page.waitForTimeout(300)
        const shot = join(OUT, `${screen.id}.png`)
        await page
          .screenshot({ path: shot, fullPage: true, timeout: 20_000 })
          // A busy WebGL scene (the launch) can starve a full-page capture: fall back to the viewport
          .catch(() => page.screenshot({ path: shot, timeout: 20_000 }))
          .catch((e) => console.warn(`  ! no screenshot for ${screen.id}: ${e.message.split('\n')[0]}`))
        await page.evaluate(restoreInPage)
        const r = { id: screen.id, name: screen.name, score: score(m), ...m }
        results.push(r)
        console.log(
          `score ${String(r.score).padStart(6)}  numbers ${r.numbers}  buttons ${r.buttons}  panels ${r.panels}  words ${r.words}  scene ${r.scene.items}  tall ${r.screensTall}`,
        )
      } else console.log('(skipped)')
      if (screen.leave) {
        await screen.leave(page)
        await page.waitForTimeout(400)
      }
    }
  } finally {
    await browser.close()
    server.stop()
  }
  if (FROM) {
    console.log('--from: partial run, no baseline written')
    return
  }
  const meta = { ...gitInfo(), date: new Date().toISOString().slice(0, 10), viewport: VIEWPORT }
  const sorted = writeReports(results, meta)
  console.log(`\nworst: ${sorted.slice(0, 3).map((r) => `${r.id} (${r.score})`).join(', ')}`)
  console.log(`wrote ${JSON_OUT.replace(ROOT + '/', '')}, ${MD_OUT.replace(ROOT + '/', '')}, screenshots in ${OUT.replace(ROOT + '/', '')}/`)
  if (errors.length) console.log(`page errors (${errors.length}):\n  ${[...new Set(errors)].join('\n  ')}`)
  if (results.length !== (ONLY.length || SCREENS.length)) {
    console.error('some screens were not measured')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
