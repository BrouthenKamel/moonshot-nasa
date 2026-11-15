import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from './budgets'
import { buildReport } from './evaluate'
import { firstPassCoverage, firstPassLine, firstPassRates, passMix, passRate } from './firstPass'
import { getDefaultAction, initSim, runToEnd, stepTurn } from './simulate'
import type { Design, SimState } from './types'

const design = (patch: Partial<Design>): Design => ({ ...createDefaultDesign(), ...patch })
const seeing = design({ instruments: ['inst-laser'] })
const blind = design({ instruments: ['inst-ir-spec'] })

/** Fly a design to arrival in lunar orbit, before the first science month (event cards: first option) */
function toOrbit(d: Design, seed = 11): SimState {
  for (let k = 0; k < 20; k++) {
    let s = initSim(d, 'engineer', seed + k)
    for (let n = 0; n < 80 && !(s.flight.captured && s.flight.scienceTurns === 0 && s.phase === 'orbit'); n++) {
      if (s.phase === 'failed' || s.phase === 'complete') break
      const action = getDefaultAction()
      s = stepTurn(s, s.pendingDecision ? { ...action, choices: { [s.pendingDecision.key]: s.pendingDecision.options[0].id } } : action)
    }
    if (s.phase === 'orbit' && s.flight.scienceTurns === 0) return s
  }
  throw new Error('no flight reached orbit')
}

describe('first pass: floor, ceiling and mix', () => {
  it('places the player between the autopilot and the best, clamped', () => {
    expect(passMix(40, 40, 80)).toBe(0)
    expect(passMix(60, 40, 80)).toBeCloseTo(0.5)
    expect(passMix(95, 40, 80)).toBe(1) // above the best: clamped to the ceiling
    expect(passMix(10, 40, 80)).toBe(0) // worse than the autopilot: playing never hurts
    expect(passMix(50, 40, 40)).toBe(0) // nothing to gain
  })

  it('a rate at mix 0 is today; at mix 1 it is the no-overlap ceiling, never above it', () => {
    expect(passRate(0.2, 0)).toBeCloseTo(0.2)
    expect(passRate(0.2, 1)).toBeCloseTo(-Math.log(0.8))
    expect(passRate(0.2, 7)).toBeCloseTo(passRate(0.2, 1))
    expect(passRate(0.9, 1)).toBe(1)
    expect(passRate(0, 1)).toBe(0)
  })

  it('a pass at or above the ceiling gives the ceiling', () => {
    const b = computeBudgets(seeing, 'engineer')
    expect(firstPassCoverage(seeing, b, passMix(200, 40, 80))).toBeCloseTo(firstPassCoverage(seeing, b, 1))
    expect(firstPassCoverage(seeing, b, 1)).toBeGreaterThan(firstPassCoverage(seeing, b, 0))
  })

  it('a design forecast at 0% stays at 0%, however well it is flown', () => {
    const b = computeBudgets(blind, 'engineer')
    expect(b.projectedCoverage).toBe(0)
    expect(firstPassCoverage(blind, b, 1)).toBe(0)
    const s = toOrbit(blind)
    expect(runToEnd({ ...s, firstPass: { mix: 1, how: 'flown' } }).flight.coverage).toBe(0)
  })
})

describe('first pass in the flight', () => {
  it('a skipped or autopilot pass gives exactly today’s result', () => {
    const s = toOrbit(seeing)
    const today = runToEnd(s)
    for (const how of ['skipped', 'autopilot'] as const) {
      const withPass = runToEnd({ ...s, firstPass: { mix: 0, how } })
      expect(withPass.flight.coverage).toBe(today.flight.coverage)
      expect(withPass.flight.data).toBe(today.flight.data)
      expect(withPass.turnLogs.map((l) => l.coveragePercent)).toEqual(today.turnLogs.map((l) => l.coveragePercent))
    }
  })

  it('a good pass maps more in the first science month, and only there', () => {
    const s = toOrbit(seeing)
    const action = getDefaultAction()
    const auto = stepTurn(s, action)
    const best = stepTurn({ ...s, firstPass: { mix: 1, how: 'flown' } }, action)
    expect(best.flight.science.observed['inst-laser']).toBeGreaterThan(auto.flight.science.observed['inst-laser'])
    // month 2 runs on the budgets' own rates again
    expect(firstPassRates(computeBudgets(seeing, 'engineer'), 0)).toEqual(computeBudgets(seeing, 'engineer').coverageRate)
  })

  it('the report says the same line as the card after the pass', () => {
    const s = toOrbit(seeing)
    const fp = { mix: 0.5, how: 'flown' as const }
    const end = runToEnd({ ...s, firstPass: fp })
    const cov = buildReport(end).requirements.find((r) => r.id === 'coverage')!
    expect(cov.reason).toContain(firstPassLine(seeing, computeBudgets(seeing, 'engineer'), fp))
  })
})
