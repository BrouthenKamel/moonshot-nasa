// WP-1A check: the 3D campus renders and walking to an unlocked door opens its room.
// Usage: node scripts/e2e/wp1a-campus.mjs [url]   (dev server must be running)
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5199/'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR', e.stack))
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)))
await page.goto(url)
await page.getByRole('button').first().click()
await page.waitForSelector('[data-testid="door-briefing"]', { timeout: 30000 }).catch(async () => { await page.screenshot({ path: '/tmp/claude-1000/fail.png' }); throw new Error('no door') })
await page.waitForTimeout(4000)
const stats = await page.evaluate(() => {
  const gl = window.__ihGl
  gl.info.autoReset = false
  gl.info.reset()
  return new Promise((res) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const r = { calls: gl.info.render.calls, tris: gl.info.render.triangles, frames: gl.info.render.frame }
        gl.info.autoReset = true
        res(r)
      }),
    ),
  )
})
console.log('render stats over 2 frames', stats)
console.log('objective:', await page.textContent('[data-testid="objective"]'))

console.log('hq:', await page.evaluate(() => document.body.innerText.includes('budget left') + ' ' + document.querySelectorAll('[data-testid=hq-board]').length))
await page.screenshot({ path: 'docs/design/shots/wp1a-campus.png' })
await page.click('[data-testid="door-briefing"]')
await page.waitForSelector('[data-room="briefing"]', { timeout: 20000 })
console.log('room opened: briefing')
await browser.close()
