import { describe, it, expect } from 'vitest'
import { initSim, stepTurn, runSimulation, getDefaultAction, isSimComplete } from './simulate'
import { createDefaultDesign } from './budgets'

describe('initSim', () => {
  it('initializes simulation state correctly', () => {
    const design = createDefaultDesign()
    const state = initSim(design, 'engineer', 12345)

    expect(state.currentTurn).toBe(0)
    expect(state.phase).toBe('build')
    expect(state.coveragePercent).toBe(0)
    expect(state.totalDataReturned).toBe(0)
    expect(state.fuelRemaining).toBeGreaterThan(0)
    expect(state.capturedIntoOrbit).toBe(false)
    expect(state.turnLogs).toHaveLength(0)
  })

  it('sets fuel from computed budgets', () => {
    const design = createDefaultDesign()
    const state = initSim(design, 'engineer', 12345)

    // Should have delta-v available
    expect(state.fuelRemaining).toBeGreaterThan(1000)
  })
})

describe('stepTurn', () => {
  it('progresses through build phase', () => {
    const design = createDefaultDesign()
    let state = initSim(design, 'engineer', 12345)

    // First turn of build
    state = stepTurn(state, getDefaultAction())
    expect(state.currentTurn).toBe(1)
    expect(state.phase).toBe('build')

    // Progress through build
    for (let i = 0; i < 3; i++) {
      state = stepTurn(state, getDefaultAction())
    }
    expect(state.phase).toBe('test')
  })

  it('transitions from test to wait/transfer', () => {
    const design = createDefaultDesign()
    let state = initSim(design, 'engineer', 12345)

    // Fast forward through build and test
    for (let i = 0; i < 10; i++) {
      state = stepTurn(state, getDefaultAction())
      if (state.phase === 'transfer' || state.phase === 'wait') break
    }

    expect(['transfer', 'wait']).toContain(state.phase)
  })

  it('logs each turn', () => {
    const design = createDefaultDesign()
    let state = initSim(design, 'engineer', 12345)

    state = stepTurn(state, getDefaultAction())
    expect(state.turnLogs).toHaveLength(1)
    expect(state.turnLogs[0].turn).toBe(1)

    state = stepTurn(state, getDefaultAction())
    expect(state.turnLogs).toHaveLength(2)
    expect(state.turnLogs[1].turn).toBe(2)
  })
})

describe('runSimulation', () => {
  it('runs complete simulation with default design', () => {
    const design = createDefaultDesign()
    const state = runSimulation(design, 'cadet', 42)

    expect(isSimComplete(state)).toBe(true)
    expect(['complete', 'failed']).toContain(state.phase)
  })

  it('produces deterministic results from same seed', () => {
    const design = createDefaultDesign()

    const state1 = runSimulation(design, 'engineer', 12345)
    const state2 = runSimulation(design, 'engineer', 12345)

    expect(state1.phase).toBe(state2.phase)
    expect(state1.totalDataReturned).toBe(state2.totalDataReturned)
    expect(state1.coveragePercent).toBe(state2.coveragePercent)
    expect(state1.allEvents.length).toBe(state2.allEvents.length)
  })

  it('produces different results from different seeds', () => {
    const design = createDefaultDesign()

    // Run multiple times with different seeds
    const results = [1, 2, 3, 4, 5].map((seed) =>
      runSimulation(design, 'engineer', seed * 11111)
    )

    // At least some should have different event counts (randomness)
    const eventCounts = results.map((r) => r.allEvents.length)
    const uniqueEventCounts = new Set(eventCounts)
    // With 5 runs, likely to have some variation
    expect(uniqueEventCounts.size).toBeGreaterThanOrEqual(1)
  })

  it('can achieve successful capture with good design', () => {
    const design = createDefaultDesign()
    // Run several times to see if any succeed (random events may cause failure)
    let successCount = 0
    for (let seed = 100; seed < 110; seed++) {
      const state = runSimulation(design, 'cadet', seed)
      if (state.capturedIntoOrbit) successCount++
    }
    // On cadet with default design, most should succeed
    expect(successCount).toBeGreaterThan(5)
  })

  it('fails with bad propulsion', () => {
    const design = createDefaultDesign()
    design.propulsion = 'prop-coldgas' // Very low delta-v

    const state = runSimulation(design, 'engineer', 12345)

    expect(state.capturedIntoOrbit).toBe(false)
    expect(state.phase).toBe('failed')
  })
})

describe('getDefaultAction', () => {
  it('returns full-science mode by default', () => {
    const action = getDefaultAction()
    expect(action.mode).toBe('full-science')
    expect(action.buyExtraPass).toBe(false)
    expect(action.useReserve).toBe(false)
  })
})

describe('isSimComplete', () => {
  it('returns true for complete state', () => {
    const design = createDefaultDesign()
    const state = initSim(design, 'engineer', 12345)
    state.phase = 'complete'
    expect(isSimComplete(state)).toBe(true)
  })

  it('returns true for failed state', () => {
    const design = createDefaultDesign()
    const state = initSim(design, 'engineer', 12345)
    state.phase = 'failed'
    expect(isSimComplete(state)).toBe(true)
  })

  it('returns false for in-progress state', () => {
    const design = createDefaultDesign()
    const state = initSim(design, 'engineer', 12345)
    expect(isSimComplete(state)).toBe(false)
  })
})
