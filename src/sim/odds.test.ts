import { describe, it, expect } from 'vitest'
import { estimateSuccess, estimateChoices, planningOdds, ODDS_RUNS, clearOddsCache, percent, oddsSeeds } from './odds'
import { getDefaultAction, initSim, isSimComplete, runSimulation, stepTurn } from './simulate'
import { flashlightDesign, iceCubeDesign, lunahMapDesign } from './fixtures'
import { buildReport } from './evaluate'
import type { Design, SimState, TurnAction } from './types'

/** The slow reference: one stepTurn per turn on standing orders */
function referenceRun(design: Design, seed: number): SimState {
  let s = initSim(design, 'engineer', seed)
  const action: TurnAction = { ...getDefaultAction(), autoDecide: true }
  let n = 0
  while (!isSimComplete(s) && n++ < 200) s = stepTurn(s, action)
  return s
}

describe('runSimulation', () => {
  it('gives exactly the same flight as stepping turn by turn', () => {
    for (const design of [flashlightDesign, iceCubeDesign, lunahMapDesign]) {
      for (const seed of [1, 42, 7919, 123456]) {
        const fast = runSimulation(design, 'engineer', seed)
        const slow = referenceRun(design, seed)
        expect(fast.turnLogs).toEqual(slow.turnLogs)
        expect(fast.flight).toEqual(slow.flight)
        expect(buildReport(fast).outcome).toBe(buildReport(slow).outcome)
      }
    }
  })
})

describe('estimateSuccess', () => {
  it('returns shares of success, partial and failed that add up to 1', () => {
    const e = estimateSuccess(flashlightDesign, 'engineer', 40)
    expect(e.success + e.partial + e.failed).toBeCloseTo(1, 9)
    for (const v of [e.success, e.partial, e.failed]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(e.runs).toBe(40)
  })

  it('is deterministic: the same design gives the same odds, also after the cache is cleared', () => {
    const a = estimateSuccess(lunahMapDesign, 'engineer', 30)
    clearOddsCache()
    const b = estimateSuccess(lunahMapDesign, 'engineer', 30)
    expect(b).toEqual(a)
  })

  it('caches by design: a second call returns the cached result', () => {
    const a = estimateSuccess(flashlightDesign, 'engineer', 25)
    const b = estimateSuccess(JSON.parse(JSON.stringify(flashlightDesign)), 'engineer', 25)
    expect(b).toBe(a)
  })

  it('agrees with counting the outcomes of the same seeds by hand', () => {
    const e = estimateSuccess(flashlightDesign, 'engineer', 20)
    const outcomes = oddsSeeds(20).map((seed) => buildReport(runSimulation(flashlightDesign, 'engineer', seed)).outcome)
    expect(e.success).toBe(outcomes.filter((o) => o === 'success').length / 20)
    expect(e.failed).toBe(outcomes.filter((o) => o === 'failed').length / 20)
  })

  it('a design that cannot meet the brief has no chance of full success', () => {
    // The starting design's IR spectrometer cannot see into shadow (see fixtures)
    expect(estimateSuccess(iceCubeDesign, 'engineer', 30).success).toBe(0)
  })

  it('is fast enough for the UI at the default number of runs', () => {
    clearOddsCache()
    const t0 = performance.now()
    estimateSuccess(flashlightDesign, 'engineer')
    const ms = performance.now() - t0
    // Generous bound so a slow CI box does not flake; locally it is far below this
    expect(ms).toBeLessThan(1500)
    expect(ODDS_RUNS).toBeLessThanOrEqual(200)
  })
})

describe('planningOdds', () => {
  it('gives the full-success chance for every test-time and reserve setting', () => {
    const o = planningOdds(flashlightDesign, 'engineer', 20)
    expect(Object.keys(o.test).map(Number).sort()).toEqual([0, 1, 2, 3])
    expect(Object.keys(o.reserve).map(Number).sort((a, b) => a - b)).toEqual([0, 5, 10, 15, 20])
    // The current setting is the same number in both rows
    expect(o.test[flashlightDesign.planning.testTurns]).toBe(o.reserve[flashlightDesign.planning.reservePercent])
    expect(o.current).toBe(o.test[flashlightDesign.planning.testTurns])
  })
})

describe('estimateChoices', () => {
  it('gives each option of a waiting event card its chance of full success', () => {
    // Find a seed where the build-delay card comes up for a design with tests to cut
    const design: Design = { ...flashlightDesign, planning: { ...flashlightDesign.planning, testTurns: 3 } }
    let found: SimState | null = null
    for (let seed = 1; seed < 400 && !found; seed++) {
      let s = initSim(design, 'engineer', seed)
      let n = 0
      while (!isSimComplete(s) && !s.pendingDecision && n++ < 60) s = stepTurn(s, getDefaultAction())
      if (s.pendingDecision?.key === 'build-delay') found = s
    }
    expect(found).not.toBeNull()
    const odds = estimateChoices(found!, getDefaultAction(), 20)
    expect(Object.keys(odds).sort()).toEqual(['cut-test', 'wait'])
    for (const v of Object.values(odds)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    // Deterministic
    expect(estimateChoices(found!, getDefaultAction(), 20)).toEqual(odds)
  })
})

describe('percent', () => {
  it('rounds to a whole percent', () => {
    expect(percent(0.855)).toBe('86%')
    expect(percent(0)).toBe('0%')
    expect(percent(1)).toBe('100%')
  })
})
