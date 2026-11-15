// QA sweep: open every room, record page errors + screenshot. Usage: node scripts/e2e/ih-qa-rooms.mjs <shotDir>
import { chromium } from 'playwright-core'
const S = process.argv[2]
const ROOMS = (process.env.ROOMS ?? 'briefing,science-lab,flight-dynamics,clean-room,thermal-vac,ground-station,launch-hangar').split(',')
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
let errs = []
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)) })
await page.goto('http://localhost:5210/')
await page.getByRole('button').first().click()
await page.waitForSelector('[data-testid="astronaut-setup"]', { timeout: 90000 })
await page.click('[data-testid="astronaut-begin"]')
const done = ['briefing','science-lab','flight-dynamics','clean-room','thermal-vac','ground-station'].filter((r) => !ROOMS.includes(r) && process.env.ROOMS)
for (const id of ROOMS) {
  errs = []
  await page.evaluate(([ids]) => ids.forEach((r) => window.__game.completeRoom(r)), [done])
  await page.waitForSelector(`[data-testid="door-${id}"]`, { timeout: 60000 })
  await page.evaluate((r) => window.__game.campus.getState().enterRoom(r), id)
  await page.waitForSelector(`[data-room="${id}"]`, { timeout: 30000 })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${S}/room-${id}.png` })
  console.log(id, errs.length ? errs.slice(0, 4) : 'clean')
  await page.evaluate(() => window.__game.campus.getState().leaveRoom())
  done.push(id)
}
await browser.close()
