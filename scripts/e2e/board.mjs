import { centre, check, design, drag, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await gotoStep(page, 'ride')
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({
      ride: 'ride-commercial',
      structure: 'bus-6u',
      solar: 'solar-2wing',
      battery: 'battery-large',
      radio: 'radio-xband',
      computer: 'computer-redundant',
      attitude: 'attitude-precision',
      propulsion: 'prop-chemical-large',
      instruments: ['inst-neutron'],
    })
  })
  await page.waitForTimeout(400)

  const pass = await centre(page, '[data-testid="boarding-pass"]')
  const lunarGate = await centre(page, '[data-drop-slot="ride:row:ride-lunar"]')
  await drag(page, pass, lunarGate)
  const refused = await page.evaluate(() => window.__moonshot.drag.getState().lastRefusal)
  const afterOver = await design(page)
  check(afterOver.ride === 'ride-commercial' && refused?.field === 'boarding-pass', `overweight boarding pass refused at ride-lunar gate (ride=${afterOver.ride})`)
  await shot(page, 'board-overweight')

  // Switch back to light configuration and board ride-lunar cleanly
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({
      ride: 'ride-commercial',
      transfer: 'transfer-direct',
      structure: 'bus-6u',
      solar: 'solar-1wing',
      battery: 'battery-medium',
      radio: 'radio-sband',
      computer: 'computer-basic',
      attitude: 'attitude-basic',
      propulsion: 'prop-chemical',
      instruments: ['inst-laser'],
    })
  })
  await page.waitForTimeout(400)

  const passLight = await centre(page, '[data-testid="boarding-pass"]')
  await drag(page, passLight, lunarGate)
  const afterBoard = await design(page)
  check(afterBoard.ride === 'ride-lunar', `dragged boarding pass onto ride-lunar gate (${afterBoard.ride})`)

  const lowEnergyCard = await centre(page, '[data-choice-id="transfer-low-energy"]')
  await drag(page, lowEnergyCard, { x: lunarGate.x, y: 240 })
  const afterTransfer = await design(page)
  check(afterTransfer.transfer === 'transfer-low-energy', `dragged transfer card onto Earth-Moon chart (${afterTransfer.transfer})`)
  await shot(page, 'board-after')

  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
