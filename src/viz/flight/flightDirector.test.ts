import { describe, expect, it } from 'vitest'
import { flashlightDesign, iceCubeDesign } from '../../sim/fixtures'
import { initSim, runSimulation, stepTurn, getDefaultAction, isSimComplete } from '../../sim/simulate'
import { flightShot } from './flightDirector'

describe('flightShot', () => {
  const sim = runSimulation(flashlightDesign, 'cadet', 4)
  const logs = sim.turnLogs
  const terminal = sim.phase === 'failed' ? 'failed' : 'complete'
  const launchIdx = logs.findIndex((l) => l.notes.some((n) => n.startsWith('Launched')))
  const captureIdx = logs.findIndex((l) => l.notes.some((n) => n.startsWith('Capture burn successful')))

  it('this flight launches and captures (the fixture meets the brief)', () => {
    expect(launchIdx).toBeGreaterThan(0)
    expect(captureIdx).toBeGreaterThan(launchIdx)
  })

  it('stays on the ground until the launch turn', () => {
    expect(flightShot(flashlightDesign, [], 0).stage).toBe('ground')
    const before = flightShot(flashlightDesign, logs, launchIdx - 1, { terminal })
    expect(before.stage).toBe('ground')
    expect(before.transferT).toBe(0)
  })

  it('moves along the path during the transfer and never backwards', () => {
    let previous = 0
    for (let i = launchIdx; i < captureIdx; i++) {
      const shot = flightShot(flashlightDesign, logs, i, { terminal })
      expect(shot.stage).toBe('transfer')
      expect(shot.transferT).toBeGreaterThanOrEqual(previous)
      expect(shot.transferT).toBeLessThanOrEqual(1)
      previous = shot.transferT
    }
    expect(previous).toBeGreaterThan(0.5)
  })

  it('fires the burn on the capture turn and is in orbit from then on', () => {
    const shot = flightShot(flashlightDesign, logs, captureIdx, { terminal })
    expect(shot.burn).toBe(true)
    expect(shot.stage).toBe('orbit')
    expect(shot.transferT).toBe(1)
    expect(flightShot(flashlightDesign, logs, captureIdx + 1, { terminal }).burn).toBe(false)
  })

  it('ends with the core numbers: coverage from the last log, ending on the last turn only', () => {
    const end = flightShot(flashlightDesign, logs, logs.length - 1, { terminal })
    expect(end.ending).toBe(terminal)
    expect(end.coverage).toBeCloseTo(logs[logs.length - 1].coveragePercent / 100, 6)
    expect(flightShot(flashlightDesign, logs, logs.length - 2, { terminal }).ending).toBeNull()
  })

  it('a live transfer uses the turns still to fly', () => {
    let s = initSim(iceCubeDesign, 'cadet', 11)
    const action = { ...getDefaultAction(), autoDecide: true }
    while (!isSimComplete(s) && (s.flight.launchedTurn === null || s.flight.transferLeft === 0)) s = stepTurn(s, action)
    s = stepTurn(s, action)
    if (isSimComplete(s) || s.flight.captured) return // nothing to check for this seed
    const shot = flightShot(s.design, s.turnLogs, s.turnLogs.length - 1, { transferLeft: s.flight.transferLeft })
    expect(shot.stage).toBe('transfer')
    expect(shot.transferT).toBeGreaterThan(0)
    expect(shot.transferT).toBeLessThan(1)
  })

  it('copes with bad input', () => {
    expect(flightShot(flashlightDesign, logs, Number.NaN).turn).toBe(logs[0].turn)
    expect(flightShot(flashlightDesign, logs, 9999, { terminal }).ending).toBe(terminal)
  })
})
