// QA: play Mission Control (WP-3A). Usage: node scripts/e2e/ih-qa-mission-control.mjs <shotDir> [baseUrl]
// Red board -> fix routing; then a GO board -> weather hold -> scrub by letting go -> hold to liftoff -> flight hand-off.
import { chromium } from 'playwright-core'
const S = process.argv[2]
const URL = process.argv[3] ?? 'http://localhost:5233/'
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome',
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200) + ' @ ' + (e.stack ?? '').split('\n').slice(1, 4).join(' | ')))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('synchronously unmount')) errs.push('CONSOLE ' + m.text().slice(0, 200)) })
const shot = (n) => page.screenshot({ path: `${S}/${n}.png` })
const ds = () => page.evaluate(() => ({ ...document.querySelector('[data-testid=launch-director]')?.dataset }))
const waitPhase = (p, t = 90000) => page.waitForFunction((p) => document.querySelector('[data-testid=launch-director]')?.dataset.phase === p, p, { timeout: t })

await page.goto(URL)
await page.getByRole('button').first().click()
await page.waitForSelector('[data-testid="astronaut-setup"]', { timeout: 90000 })
await page.click('[data-testid="astronaut-begin"]')
// Mute the voice: lines then last as long as their caption timer, which is the pace a muted player gets
await page.evaluate(() => {
  ;['briefing', 'science-lab', 'flight-dynamics', 'clean-room', 'thermal-vac', 'ground-station', 'launch-hangar'].forEach((r) => window.__game.completeRoom(r))
})

// 1. A red board: lock half the budget away as reserve, so Budget goes red
await page.evaluate(() => window.__moonshot.game.getState().updateDesign({ planning: { ...window.__moonshot.game.getState().design.planning, reservePercent: 40 } }))
await page.evaluate(() => window.__game.campus.getState().enterRoom('mission-control'))
await waitPhase('board')
await shot('1-board-red')
console.log('red board', await ds(), await page.textContent('[data-testid=objective]'))
// walk to the red console by clicking it (the Spacecraft console sits right of centre)
await page.mouse.click(1440 * 0.6, 900 * 0.5)
await page.waitForSelector('[data-testid=console-card]', { timeout: 20000 })
await shot('2-red-console-card')
console.log('card', await page.textContent('[data-testid=console-card]'))
await page.click('[data-testid=fix-room]')
await page.waitForTimeout(800)
console.log('after fix click, room =', await page.evaluate(() => window.__game.campus.getState().currentRoom))
await page.evaluate(() => window.__game.campus.getState().leaveRoom())

// 2. A GO board: reserve back to 0; re-enter until today's weather rolls a hold
await page.evaluate(() => window.__moonshot.game.getState().updateDesign({ planning: { ...window.__moonshot.game.getState().design.planning, reservePercent: 0 } }))
let got = false
for (let i = 0; i < 6 && !got; i++) {
  await page.evaluate(() => window.__game.campus.getState().enterRoom('mission-control'))
  await page.waitForFunction(() => ['weather', 'count'].includes(document.querySelector('[data-testid=launch-director]')?.dataset.phase), null, { timeout: 90000 })
  got = (await ds()).phase === 'weather'
  if (!got) await page.evaluate(() => window.__game.campus.getState().leaveRoom())
}
console.log('weather hold rolled:', got)
if (got) {
  await shot('3-weather-hold')
  await page.click(process.env.CHOICE === 'proceed' ? '[data-testid=choose-proceed]' : '[data-testid=choose-hold]')
}
await waitPhase('count')
await page.waitForTimeout(400)
// 3. hold SPACE for 4 s, let go: scrub
await page.keyboard.down('Space')
await page.waitForTimeout(4000)
await shot('4-counting')
await page.keyboard.up('Space')
await page.waitForTimeout(300)
console.log('after let-go', await ds(), await page.textContent('[data-testid=caption]').catch(() => null))
await shot('5-scrub')
// 4. hold the full count: liftoff, then the flight starts
await page.waitForTimeout(400)
await page.keyboard.down('Space')
// pressed on and lost the roll: the sequencer scrubs at T-3; let go and hold again
await page.waitForFunction(() => ['liftoff', 'scrubbed'].includes(document.querySelector('[data-testid=launch-director]')?.dataset.countdown), null, { timeout: 20000 })
if ((await ds()).countdown === 'scrubbed') {
  await shot('5b-weather-scrub')
  console.log('weather scrub:', await page.textContent('[data-testid=caption]'))
  await page.keyboard.up('Space')
  await page.waitForTimeout(300)
  await page.keyboard.down('Space')
  await page.waitForFunction(() => document.querySelector('[data-testid=launch-director]')?.dataset.countdown === 'liftoff', null, { timeout: 20000 })
}
await page.keyboard.up('Space')
await shot('6-liftoff')
await page.waitForFunction(() => !!window.__moonshot.game.getState().simState, null, { timeout: 10000 })
const after = await page.evaluate(() => ({
  screen: window.__moonshot.game.getState().screen,
  sim: !!window.__moonshot.game.getState().simState,
  insights: window.__game.campus.getState().insights.filter((i) => i.room === 'mission-control'),
}))
console.log('handed off', JSON.stringify(after))
await page.waitForTimeout(1500)
await shot('7-after-handoff')
console.log(errs.length ? errs.slice(0, 6) : 'no page errors')
await browser.close()
