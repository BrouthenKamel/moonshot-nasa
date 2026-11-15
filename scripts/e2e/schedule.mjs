import { centre, check, design, drag, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await gotoStep(page, 'planning')
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({
      ride: 'ride-gto',
      planning: { testTurns: 0, reservePercent: 0 },
    })
  })
  await page.waitForTimeout(400)

  const wall = await centre(page, '[data-drop-slot="planning:schedule-wall"]')
  const block3 = await centre(page, '[data-testid="test-block-3"]')
  await drag(page, block3, wall)
  const afterMissed = await design(page)
  const missedShown = await page.locator('[data-testid="ride-missed"]').isVisible()
  check(afterMissed.planning.testTurns === 3 && missedShown, `dragged 3-month test block onto schedule wall and showed ride missed flag (testTurns=${afterMissed.planning.testTurns})`)
  await shot(page, 'schedule-missed')

  const block1 = await centre(page, '[data-testid="test-block-1"]')
  await drag(page, block1, wall)
  const afterOk = await design(page)
  check(afterOk.planning.testTurns === 1, `dragged 1-month test block onto schedule wall (testTurns=${afterOk.planning.testTurns})`)

  const box = await centre(page, '[data-drop-slot="planning:reserve-box"]')
  const coin15 = await centre(page, '[data-testid="reserve-coin-15"]')
  await drag(page, coin15, box)
  const afterCoin = await design(page)
  check(afterCoin.planning.reservePercent === 15, `dragged 15% reserve coin into sealed box (reservePercent=${afterCoin.planning.reservePercent})`)
  await shot(page, 'schedule-after')

  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
