import { chromium } from 'playwright-core'
const S = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)))
await page.goto('http://localhost:5210/')
await page.getByRole('button').first().click()
await page.waitForSelector('[data-testid="astronaut-setup"]', { timeout: 90000 })
await page.click('[data-testid="astronaut-begin"]')
await page.evaluate(() => window.__game.campus.getState().enterRoom('briefing'))
await page.waitForSelector('[data-testid="shadow-hunt"]', { timeout: 60000 })
await page.waitForTimeout(4000)
const prog = () => page.textContent('[data-testid="shadow-progress"]')
console.log('start:', await prog())
// click a crater pin (from the earlier screenshot)
await page.mouse.click(662, 462)
await page.waitForTimeout(1500)
console.log('card after click:', await page.locator('[data-testid="crater-card"]').count())
await page.screenshot({ path: S + '/shadow-click.png' })
// try to tag too early
if (await page.locator('[data-testid="tag-psr"]').count()) { await page.click('[data-testid="tag-psr"]'); console.log('early note:', await page.textContent('[data-testid="shadow-note"]')) }
await page.click('text=Zoom out')
await page.waitForTimeout(1500)
// sweep: drag left (moves the Sun right) in many small steps
for (let r = 0; r < 14 && !(await prog()).includes('tagged') ; r++) break
for (let i = 0; i < 12; i++) {
  await page.mouse.move(300, 450); await page.mouse.down()
  for (let x = 300; x <= 1100; x += 40) await page.mouse.move(x, 450)
  await page.mouse.up(); await page.waitForTimeout(400)
  const p = await prog(); if (!p.includes('lap')) break
}
console.log('after sweeping:', await prog())
await page.screenshot({ path: S + '/shadow-swept.png' })
for (const [x, y] of [[662,462],[697,421],[625,520],[682,516],[591,588],[716,577]]) {
  await page.mouse.click(x, y); await page.waitForTimeout(1200)
  if (!(await page.locator('[data-testid="tag-psr"]').count())) continue
  await page.click('[data-testid="tag-psr"]', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500)
  console.log('tag:', (await page.textContent('[data-testid="shadow-note"]')).slice(0, 90), '|', await prog())
  if (await page.locator('text=Zoom out').count()) { await page.click('text=Zoom out'); await page.waitForTimeout(1500) }
  if ((await page.getAttribute('[data-testid="shadow-hunt"]', 'data-phase')) !== 'shadow') break
}
await page.screenshot({ path: S + '/shadow-tagged.png' })
console.log('page errors', errs)
await browser.close()
