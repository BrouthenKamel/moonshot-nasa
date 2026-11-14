import { describe, it, expect } from 'vitest'
import { buildReport, getGrade } from './evaluate'
import { runSimulation } from './simulate'
import { createDefaultDesign } from './budgets'

describe('buildReport', () => {
  it('generates report from completed simulation', () => {
    const design = createDefaultDesign()
    const state = runSimulation(design, 'cadet', 42)
    const report = buildReport(state)

    expect(report.outcome).toBeDefined()
    expect(['success', 'partial', 'failed']).toContain(report.outcome)
    expect(report.outcomeReason).toBeTruthy()
    expect(report.requirements.length).toBe(5)
    expect(report.score.total).toBeGreaterThanOrEqual(0)
    expect(report.score.total).toBeLessThanOrEqual(1000)
  })

  it('checks all five requirements', () => {
    const design = createDefaultDesign()
    const state = runSimulation(design, 'engineer', 123)
    const report = buildReport(state)

    const reqIds = report.requirements.map((r) => r.id)
    expect(reqIds).toContain('capture')
    expect(reqIds).toContain('coverage')
    expect(reqIds).toContain('data')
    expect(reqIds).toContain('lifetime')
    expect(reqIds).toContain('budget')
  })

  it('reports failure when capture fails', () => {
    const design = createDefaultDesign()
    design.propulsion = 'prop-coldgas' // Will fail

    const state = runSimulation(design, 'engineer', 12345)
    const report = buildReport(state)

    expect(report.outcome).toBe('failed')
    expect(report.requirements.find((r) => r.id === 'capture')?.met).toBe(false)
  })

  it('generates improvement hints', () => {
    const design = createDefaultDesign()
    design.propulsion = 'prop-coldgas' // Will fail

    const state = runSimulation(design, 'engineer', 12345)
    const report = buildReport(state)

    expect(report.hints.length).toBeGreaterThan(0)
    // Should suggest propulsion fix
    const propHint = report.hints.find((h) => h.area === 'Propulsion')
    expect(propHint).toBeDefined()
  })

  it('calculates score breakdown', () => {
    const design = createDefaultDesign()
    const state = runSimulation(design, 'cadet', 42)
    const report = buildReport(state)

    expect(report.score.requirements).toBeGreaterThanOrEqual(0)
    expect(report.score.requirements).toBeLessThanOrEqual(600)
    expect(report.score.science).toBeGreaterThanOrEqual(0)
    expect(report.score.science).toBeLessThanOrEqual(200)
    expect(report.score.efficiency).toBeGreaterThanOrEqual(0)
    expect(report.score.efficiency).toBeLessThanOrEqual(100)
    expect(report.score.riskHandling).toBeGreaterThanOrEqual(0)
    expect(report.score.riskHandling).toBeLessThanOrEqual(100)

    const sum =
      report.score.requirements +
      report.score.science +
      report.score.efficiency +
      report.score.riskHandling
    expect(report.score.total).toBe(sum)
  })

  it('includes design and timestamp', () => {
    const design = createDefaultDesign()
    const state = runSimulation(design, 'engineer', 42)
    const report = buildReport(state)

    expect(report.design).toEqual(design)
    expect(report.difficulty).toBe('engineer')
    expect(report.timestamp).toBeGreaterThan(0)
  })

  it('tracks events encountered', () => {
    const design = createDefaultDesign()

    // Run many simulations to likely encounter events
    let foundEvents = false
    for (let seed = 1; seed <= 20; seed++) {
      const state = runSimulation(design, 'flight-director', seed * 1000)
      const report = buildReport(state)
      if (report.eventsEncountered > 0) {
        foundEvents = true
        expect(report.eventsHandledWell).toBeLessThanOrEqual(report.eventsEncountered)
        break
      }
    }
    // With flight-director difficulty, should encounter events eventually
    expect(foundEvents).toBe(true)
  })
})

describe('getGrade', () => {
  it('returns A+ for high scores', () => {
    expect(getGrade(950)).toBe('A+')
    expect(getGrade(900)).toBe('A+')
  })

  it('returns A for good scores', () => {
    expect(getGrade(875)).toBe('A')
    expect(getGrade(850)).toBe('A')
  })

  it('returns B for medium scores', () => {
    expect(getGrade(750)).toBe('B+')
    expect(getGrade(700)).toBe('B')
    expect(getGrade(650)).toBe('B-')
  })

  it('returns C for lower scores', () => {
    expect(getGrade(600)).toBe('C+')
    expect(getGrade(550)).toBe('C')
    expect(getGrade(500)).toBe('C-')
  })

  it('returns D for poor scores', () => {
    expect(getGrade(450)).toBe('D')
    expect(getGrade(400)).toBe('D')
  })

  it('returns F for very low scores', () => {
    expect(getGrade(300)).toBe('F')
    expect(getGrade(0)).toBe('F')
  })
})

describe('balance tests', () => {
  it('default design can achieve full success on cadet', () => {
    const design = createDefaultDesign()

    // Run 20 simulations, most should succeed
    let successCount = 0
    for (let seed = 1; seed <= 20; seed++) {
      const state = runSimulation(design, 'cadet', seed * 100)
      const report = buildReport(state)
      if (report.outcome === 'success') successCount++
    }

    // Should succeed most of the time on cadet
    expect(successCount).toBeGreaterThanOrEqual(10)
  })

  it('three different designs can achieve full success on engineer', () => {
    const designs = [
      // Design 1: Electric propulsion with low-energy transfer (default)
      createDefaultDesign(),

      // Design 2: Chemical propulsion with commercial ride
      {
        ...createDefaultDesign(),
        propulsion: 'prop-chemical-large',
        transfer: 'transfer-direct',
        ride: 'ride-commercial',
        instruments: ['inst-ir-spec'], // Single instrument to save mass
      },

      // Design 3: Electric with dual instruments
      {
        ...createDefaultDesign(),
        instruments: ['inst-ir-spec', 'inst-neutron'],
        radio: 'radio-xband',
        groundStation: 'ground-dsn',
      },
    ]

    for (const design of designs) {
      let succeeded = false
      for (let seed = 1; seed <= 30; seed++) {
        const state = runSimulation(design, 'engineer', seed * 100)
        const report = buildReport(state)
        if (report.outcome === 'success') {
          succeeded = true
          break
        }
      }
      expect(succeeded).toBe(true)
    }
  })

  it('buy-everything design fails Go/No-Go', async () => {
    const design = {
      planning: {
        buildTurns: 4,
        testTurns: 2,
        reservePercent: 10,
      },
      instruments: ['inst-ir-spec', 'inst-laser', 'inst-camera', 'inst-neutron'],
      structure: 'bus-6u',
      solar: 'solar-2wing',
      battery: 'battery-large',
      radio: 'radio-xband',
      computer: 'computer-redundant',
      attitude: 'attitude-precision',
      propulsion: 'prop-ion-large',
      orbit: 'orbit-50km',
      ride: 'ride-commercial',
      transfer: 'transfer-low-energy',
      groundStation: 'ground-dsn',
    }

    const { goNoGo } = await import('./checks')
    const { computeBudgets } = await import('./budgets')

    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    // Should fail due to mass, budget, or volume
    expect(result.canGo).toBe(false)
  })
})
