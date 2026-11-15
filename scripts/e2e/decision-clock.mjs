import { check, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await page.evaluate(() => {
    const { game, ui } = window.__moonshot
    ui.getState().finishOpening()
    game.getState().updateDesign({
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
    game.getState().startSimulation()
    game.getState().setScreen('base')
  })
  await page.waitForTimeout(800)

  // Advance until launched/in transit so space view is available, then ensure an active flight event card
  await page.evaluate(() => {
    const { game, ui } = window.__moonshot
    for (let i = 0; i < 12; i++) {
      const sim = game.getState().simState
      if (!sim || sim.phase === 'complete' || sim.phase === 'failed') break
      if (sim.pendingDecision) {
        game.getState().answerEvent(sim.pendingDecision.options[0].id)
      } else {
        game.getState().advanceTurn()
      }
      const after = game.getState().simState
      if (after && after.flight.launchedTurn !== null && (after.phase === 'transfer' || after.phase === 'orbit')) {
        break
      }
    }
    ui.getState().endLaunch()
    ui.getState().setFlightView('space')
    const cur = game.getState().simState
    if (cur && !cur.pendingDecision) {
      game.setState({
        simState: {
          ...cur,
          phase: 'capture',
          pendingDecision: {
            key: 'radiation-reset',
            title: 'Radiation upset',
            text: 'Cosmic ray flipped flight computer state during lunar orbit insertion.',
            options: [
              { id: 'reboot', label: 'Cycle power (Safe mode)' },
              { id: 'hold', label: 'Wait for ground check' },
            ],
            realMission: 'LunaH-Map',
            turn: typeof cur.turn === 'number' ? cur.turn : 3,
          },
        },
      })
    } else if (cur) {
      game.setState({
        simState: { ...cur, phase: 'capture' },
      })
    }
  })

  const clock = page.locator('[data-testid="decision-clock"]')
  await clock.waitFor({ state: 'visible', timeout: 5000 })
  const remBefore = Number(await clock.getAttribute('data-remaining-ms'))
  await page.waitForTimeout(1500)
  const remAfter = Number(await clock.getAttribute('data-remaining-ms'))
  check(
    Number.isFinite(remBefore) && Number.isFinite(remAfter) && remAfter < remBefore,
    `decision clock advanced over ~1.5s (${remBefore}ms -> ${remAfter}ms)`,
  )
  await shot(page, 'decision-clock')

  // Clear the event card via keyboard [1] (or click option) so CAPCOM camera strip can be inspected cleanly
  await page.keyboard.press('1')
  await page.evaluate(() => {
    const { game, ui } = window.__moonshot
    const cur = game.getState().simState
    if (cur) {
      game.setState({
        simState: {
          ...cur,
          pendingDecision: undefined,
          phase: 'capture',
          flight: {
            ...cur.flight,
            launchedTurn: cur.flight.launchedTurn ?? 0,
            transferProgress: 1,
            transferLeft: 0,
          },
        },
      })
    }
    ui.getState().endLaunch()
    ui.getState().setFlightView('space')
  })

  const cams = page.locator('[data-testid="capcom-cams"]')
  await cams.waitFor({ state: 'visible', timeout: 5000 })
  const camText = await cams.innerText()
  check(
    camText.includes('CAM 1') && camText.includes('CAM 2') && camText.includes('CAM 3'),
    `CAPCOM cameras visible (${camText.replace(/\s+/g, ' ').trim()})`,
  )

  const cam2 = cams.getByText('CAM 2 · CRAFT')
  await cam2.click()
  const camAfter2 = await page.evaluate(() => window.__moonshot.ui.getState().flightCam)
  check(camAfter2 === 'earth', `clicking CAM 2 · CRAFT switches flightCam to earth (got ${camAfter2})`)

  const cam3 = cams.getByText('CAM 3 · MOON')
  await cam3.click()
  const camAfter3 = await page.evaluate(() => window.__moonshot.ui.getState().flightCam)
  check(camAfter3 === 'moon', `clicking CAM 3 · MOON switches flightCam to moon (got ${camAfter3})`)

  const burnVisible = await page.locator('[data-testid="capture-burn"]').isVisible()
  check(burnVisible, 'capture burn tension indicator visible during capture phase')

  await page.waitForTimeout(300)
  await shot(page, 'capcom-space')
  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
