import { chromium } from 'playwright-core'
// Films the launch ascent (WP-3B): node scripts/e2e/ih-qa-ascent.mjs <out dir> [url]. Needs `pnpm dev` and Google Chrome.
const OUT = process.argv[2]
const URL = process.argv[3] ?? 'http://localhost:5199/?classic=1'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
page.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 200)))
await page.goto(URL)
await page.getByRole('button', { name: 'Begin' }).click()
await page.waitForTimeout(1500)
// Log every sound with the mission time it fired at
await page.evaluate(async () => {
  const { audio } = await import('/src/assets/audio.ts')
  window.__sounds = []
  const stamp = (kind, id) => {
    const at = window.__moonshot.ui.getState().launchAt
    window.__sounds.push(`${kind} ${id} @ ${at === null ? 'no launch' : 'T' + ((performance.now() - at) / 1000 - 10).toFixed(2)}`)
  }
  const play = audio.play.bind(audio)
  const say = audio.say.bind(audio)
  audio.play = (id) => (stamp('play', id), play(id))
  audio.say = (id) => (stamp('say', id), say(id))
})
await page.evaluate(() => window.__moonshot.game.getState().startSimulation())
await page.waitForTimeout(3000)
const before = await page.evaluate(() => window.__sounds.slice())
await page.evaluate(async () => {
  const m = window.__moonshot
  for (let i = 0; i < 14; i++) {
    const s = m.game.getState().simState
    if (s.flight.launchedTurn !== null || s.pendingDecision) break
    m.game.getState().advanceTurn()
    await new Promise((r) => setTimeout(r, 60))
  }
})
await page.waitForSelector('[data-testid="ascent-overlay"]', { timeout: 20000 })
const skipButton = () => page.$('[data-testid="ascent-overlay"] button')
console.log('first viewing: Skip offered =', (await skipButton()) !== null)
const clockNow = () => page.evaluate(() => (performance.now() - window.__moonshot.ui.getState().launchAt) / 1000)
const shots = [
  ['shot1', 4],
  ['shot2-countdown', 8.6],
  ['liftoff-T0', 10.4],
  ['shot3', 14],
  ['shot4', 24],
  ['shot5', 31.5],
  ['shot5b', 34],
  ['shot6', 38.5],
  ['shot6b', 42],
  ['shot7', 46.5],
  ['shot7b', 50.5],
]
for (const [name, at] of shots) {
  while ((await clockNow()) < at) await page.waitForTimeout(50)
  const info = await page.evaluate(() => ({ shot: document.querySelector('[data-testid="ascent-overlay"]')?.dataset.shot ?? 'none', word: document.querySelector('[data-testid="ascent-overlay"] .text-7xl')?.textContent ?? '' }))
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, 'clock', (await clockNow()).toFixed(1), 'shot', info.shot, 'word', JSON.stringify(info.word))
}
await page.waitForTimeout(3500)
console.log('after end: overlay', await page.$('[data-testid="ascent-overlay"]') !== null, 'launchAt', await page.evaluate(() => window.__moonshot.ui.getState().launchAt))
// Second viewing: Skip is offered and ends the ascent
await page.evaluate(async () => (await import('/src/scene/launch/ascentStore.ts')).playAscent())
await page.waitForSelector('[data-testid="ascent-overlay"]')
console.log('second viewing: Skip offered =', (await skipButton()) !== null)
await (await skipButton())?.click()
await page.waitForTimeout(500)
console.log('after Skip: overlay', (await page.$('[data-testid="ascent-overlay"]')) !== null)
console.log('sounds before liftoff turn:', before)
console.log('sounds:', await page.evaluate(() => window.__sounds))
console.log('errors', errs)
await browser.close()
