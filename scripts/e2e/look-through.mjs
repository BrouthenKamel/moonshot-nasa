import { centre, check, design, drag, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await gotoStep(page, 'instruments')
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({ instruments: ['inst-camera'] })
  })
  await page.waitForTimeout(400)

  const stage = await centre(page, '[data-drop-slot="lab:cradle"]')
  const irCard = await centre(page, '[data-choice-id="inst-ir-spec"]')
  await drag(page, irCard, stage)
  const afterIr = await design(page)
  check(afterIr.instruments.includes('inst-ir-spec'), `dragged inst-ir-spec onto optical bench (${afterIr.instruments.join(', ')})`)

  // Look through optics with IR + Camera (neither sees permanent shadow)
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({ instruments: ['inst-ir-spec'] })
  })
  await page.waitForTimeout(300)
  await page.click('[data-testid="look-through-btn"]')
  await page.waitForTimeout(500)
  const irCaption = await page.evaluate(() => window.__moonshot.inside.getState().caption)
  check(irCaption.includes("can't see into the dark"), `IR look-through caption says blind in shadow: "${irCaption}"`)
  await shot(page, 'look-through-ir')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Drag laser onto cradle, look through at 15 km, then flip Altitude Lever to 100 km
  const laserCard = await centre(page, '[data-choice-id="inst-laser"]')
  await drag(page, laserCard, stage)
  const afterLaser = await design(page)
  check(afterLaser.instruments.includes('inst-laser'), `dragged inst-laser onto cradle (${afterLaser.instruments.join(', ')})`)

  await page.click('[data-testid="look-through-btn"]')
  await page.waitForTimeout(600)
  const laser15 = await page.evaluate(() => window.__moonshot.inside.getState().caption)
  check(laser15.includes('cyan') || laser15.includes('ice'), `Laser at 15 km shows ice glints caption: "${laser15}"`)
  await shot(page, 'look-through-15km')

  await page.click('[data-testid="altitude-lever"]')
  await page.waitForTimeout(600)
  const laser100 = await page.evaluate(() => window.__moonshot.inside.getState().caption)
  check(laser100.includes('100 km') && laser100.includes('fades'), `Flipping lever to 100 km updates caption: "${laser100}"`)
  await shot(page, 'look-through-100km')

  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
