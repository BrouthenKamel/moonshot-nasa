import { centre, check, design, drag, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await gotoStep(page, 'comms')
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({
      instruments: ['inst-camera'],
      computer: 'computer-basic',
      radio: 'radio-uhf',
      groundStation: 'ground-small',
      contactHours: 1,
    })
  })
  await page.waitForTimeout(300)

  const spillCount = await page.locator('[data-testid="data-spill"]').count()
  check(spillCount >= 1, 'storage spill indicator shown when UHF radio cannot close Moon link')
  await shot(page, 'comms-aim-before')

  const aimHandle = await centre(page, '[data-testid="dish-aim-handle"]')
  const aimRailBox = await page.locator('[data-testid="dish-aim-handle"]').locator('..').boundingBox()
  await drag(page, aimHandle, { x: aimRailBox.x + aimRailBox.width * 0.92, y: aimHandle.y })
  const afterAim = await design(page)
  check(afterAim.groundStation === 'ground-dsn', `aimed dish handle across to NASA DSN (${afterAim.groundStation})`)

  await page.evaluate(() => {
    const m = document.querySelector('main')
    if (m) m.scrollTop = 120
  })
  await page.waitForTimeout(250)
  const sbandBox = await page.locator('[data-choice-id="radio-sband"]').boundingBox()
  const sband = { x: sbandBox.x + sbandBox.width / 2, y: Math.min(850, sbandBox.y + 80) }
  const radioSlot = await centre(page, '[data-drop-slot="comms:radio-slot"]')
  await drag(page, sband, radioSlot)
  const afterRadio = await design(page)
  check(afterRadio.radio === 'radio-sband', `dragged radio-sband into Moon radio slot (${afterRadio.radio})`)

  await page.locator('[data-choice-id="ground-medium"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const medCard = await centre(page, '[data-choice-id="ground-medium"]')
  const globeSlot = await centre(page, '[data-drop-slot="comms:ribbon-globe"]')
  await drag(page, medCard, globeSlot)
  const afterStation = await design(page)
  check(afterStation.groundStation === 'ground-medium', `dragged ground-medium card onto Earth pad (${afterStation.groundStation})`)

  await page.locator('[data-testid="contact-dial"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const dial = await centre(page, '[data-testid="contact-dial"]')
  const dialTrack = await page.locator('[data-testid="contact-dial"]').locator('..').boundingBox()
  await drag(page, dial, { x: dialTrack.x + dialTrack.width * 0.85, y: dial.y })
  const afterHours = await design(page)
  check(afterHours.contactHours > 1, `dragged 24 h contact dial to increase hours (${afterHours.contactHours} h)`)
  await shot(page, 'comms-aim-after')

  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
