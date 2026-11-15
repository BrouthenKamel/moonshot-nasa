import { centre, check, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({
      planning: { buildTurns: 0, testTurns: 2, reservePercent: 10 },
      instruments: ['inst-laser'],
      structure: 'bus-6u',
      solar: 'solar-1wing',
      battery: 'battery-large',
      radio: 'radio-sband',
      computer: 'computer-basic',
      attitude: 'attitude-precision',
      propulsion: 'prop-chemical',
      orbit: 'orbit-halo',
      ride: 'ride-lunar',
      transfer: 'transfer-low-energy',
      groundStation: 'ground-medium',
      contactHours: 1,
    })
  })
  await gotoStep(page, 'go-nogo')
  await page.locator('[data-testid="launch-key"]').scrollIntoViewIfNeeded()
  const key = await centre(page, '[data-testid="launch-key"]')
  // Drag clockwise around the dial to turn the launch key 90 degrees
  await page.mouse.move(key.x, key.y - 16)
  await page.mouse.down()
  await page.mouse.move(key.x + 16, key.y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await shot(page, 'launch-key-armed')

  await page.locator('[data-testid="launch-hold"]').scrollIntoViewIfNeeded()
  const holdDisabled = await page.locator('[data-testid="launch-hold"]').isDisabled()
  check(!holdDisabled, 'turning the launch key enabled the 1.5 s hold button')
  const holdBtn = await centre(page, '[data-testid="launch-hold"]')
  await page.mouse.move(holdBtn.x, holdBtn.y)
  await page.mouse.down()
  await page.waitForTimeout(1750)
  await page.mouse.up()
  await page.waitForTimeout(500)
  await shot(page, 'launch-key-started')
  const launched = await page.evaluate(() => window.__moonshot.game.getState().simState !== null)
  check(launched, 'holding the armed launch key 1.5s started the mission simulation')
  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
