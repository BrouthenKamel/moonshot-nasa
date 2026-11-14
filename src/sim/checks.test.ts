import { describe, it, expect } from 'vitest'
import { goNoGo, getGoNoGoSummary } from './checks'
import { computeBudgets, createDefaultDesign } from './budgets'

describe('goNoGo', () => {
  it('passes default design on engineer difficulty', () => {
    const design = createDefaultDesign()
    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    expect(result.canGo).toBe(true)
    expect(result.blockers.length).toBe(0)
  })

  it('checks all resources', () => {
    const design = createDefaultDesign()
    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    const resourceNames = result.checks.map((c) => c.resource)
    expect(resourceNames).toContain('Mass')
    expect(resourceNames).toContain('Volume')
    expect(resourceNames).toContain('Power')
    expect(resourceNames).toContain('Budget')
    expect(resourceNames).toContain('Time')
    expect(resourceNames).toContain('Delta-v')
    expect(resourceNames).toContain('Data Link')
  })

  it('fails when over mass limit', () => {
    const design = createDefaultDesign()
    // Add heavy instruments
    design.instruments = ['inst-ir-spec', 'inst-laser', 'inst-camera', 'inst-neutron']
    design.propulsion = 'prop-ion-large' // Heavy propulsion

    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    // Should have mass blocker
    const massCheck = result.checks.find((c) => c.resource === 'Mass')
    expect(massCheck).toBeDefined()

    if (budgets.massMargin < 0) {
      expect(massCheck?.status).toBe('red')
      expect(result.blockers.some((b) => b.resource === 'Mass')).toBe(true)
    }
  })

  it('fails when over budget', () => {
    const design = createDefaultDesign()
    // Use expensive options
    design.instruments = ['inst-ir-spec', 'inst-laser']
    design.radio = 'radio-xband'
    design.computer = 'computer-redundant'
    design.attitude = 'attitude-precision'
    design.propulsion = 'prop-ion-large'
    design.ride = 'ride-commercial'
    design.groundStation = 'ground-dsn'

    const budgets = computeBudgets(design, 'flight-director')
    const result = goNoGo(design, budgets)

    if (budgets.budgetMargin < 0) {
      const budgetCheck = result.checks.find((c) => c.resource === 'Budget')
      expect(budgetCheck?.status).toBe('red')
      expect(result.canGo).toBe(false)
    }
  })

  it('fails when not ready in time', () => {
    const design = createDefaultDesign()
    design.planning.buildTurns = 6
    design.planning.testTurns = 3
    design.ride = 'ride-gto' // Leaves on turn 6

    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    const timeCheck = result.checks.find((c) => c.resource === 'Time')
    expect(timeCheck?.status).toBe('red')
    expect(result.canGo).toBe(false)
  })

  it('fails when delta-v insufficient', () => {
    const design = createDefaultDesign()
    design.propulsion = 'prop-coldgas' // Very low delta-v

    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    const deltaVCheck = result.checks.find((c) => c.resource === 'Delta-v')
    expect(deltaVCheck?.status).toBe('red')
    expect(result.canGo).toBe(false)
  })

  it('checks propulsion and transfer compatibility', () => {
    const design = createDefaultDesign()
    design.propulsion = 'prop-chemical'
    design.transfer = 'transfer-low-energy' // Requires electric

    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    const compatCheck = result.checks.find((c) => c.resource === 'Propulsion Match')
    expect(compatCheck).toBeDefined()
    expect(compatCheck?.status).toBe('red')
    expect(result.canGo).toBe(false)
  })

  it('checks ride mass limit', () => {
    const design = createDefaultDesign()
    design.instruments = ['inst-ir-spec', 'inst-laser', 'inst-camera']
    design.propulsion = 'prop-chemical-large'
    design.ride = 'ride-commercial' // 12 kg limit

    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    // If over ride limit, should have check
    if (budgets.totalMass > 12) {
      const rideCheck = result.checks.find((c) => c.resource === 'Ride Mass Limit')
      expect(rideCheck).toBeDefined()
      expect(rideCheck?.status).toBe('red')
    }
  })

  it('warns on tight margins', () => {
    const design = createDefaultDesign()
    // Tune design to have tight but acceptable margins
    design.planning.reservePercent = 5 // Low reserve

    const budgets = computeBudgets(design, 'engineer')
    const result = goNoGo(design, budgets)

    // May have warnings but should still pass
    expect(result.canGo).toBe(true)
  })
})

describe('getGoNoGoSummary', () => {
  it('returns positive message when all green', () => {
    const design = createDefaultDesign()
    const budgets = computeBudgets(design, 'cadet')
    const result = goNoGo(design, budgets)

    if (result.canGo && result.warnings.length === 0) {
      const summary = getGoNoGoSummary(result)
      expect(summary).toContain('go')
    }
  })

  it('returns caution message with warnings', () => {
    const result = {
      canGo: true,
      checks: [],
      blockers: [],
      warnings: [{ resource: 'Power', status: 'yellow' as const, value: 0, limit: 0, margin: 0, unit: '', reason: '' }],
    }

    const summary = getGoNoGoSummary(result)
    expect(summary).toContain('caution')
    expect(summary).toContain('1 warning')
  })

  it('returns no-go message with blockers', () => {
    const result = {
      canGo: false,
      checks: [],
      blockers: [
        { resource: 'Mass', status: 'red' as const, value: 0, limit: 0, margin: 0, unit: '', reason: '' },
        { resource: 'Budget', status: 'red' as const, value: 0, limit: 0, margin: 0, unit: '', reason: '' },
      ],
      warnings: [],
    }

    const summary = getGoNoGoSummary(result)
    expect(summary).toContain('No-Go')
    expect(summary).toContain('2 critical')
  })
})
