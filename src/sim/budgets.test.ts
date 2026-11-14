import { describe, it, expect } from 'vitest'
import { computeBudgets, createDefaultDesign } from './budgets'

describe('computeBudgets', () => {
  it('computes budgets for default design', () => {
    const design = createDefaultDesign()
    const budgets = computeBudgets(design, 'engineer')

    // Mass should be within limits
    expect(budgets.totalMass).toBeGreaterThan(0)
    expect(budgets.totalMass).toBeLessThanOrEqual(budgets.massLimit)

    // Volume should be within limits
    expect(budgets.totalVolume).toBeGreaterThan(0)
    expect(budgets.totalVolume).toBeLessThanOrEqual(budgets.volumeLimit)

    // Power should be positive (generation > consumption)
    expect(budgets.powerGenerated).toBeGreaterThan(0)

    // Cost should be calculated
    expect(budgets.totalCost).toBeGreaterThan(0)
    expect(budgets.budgetCap).toBe(16) // Engineer difficulty

    // Delta-v should be calculated
    expect(budgets.deltaVAvailable).toBeGreaterThan(0)
    expect(budgets.deltaVTotal).toBeGreaterThan(0)

    // Data should be calculated
    expect(budgets.dataPerTurn).toBeGreaterThan(0)
    expect(budgets.downlinkPerTurn).toBeGreaterThan(0)
  })

  it('respects difficulty presets', () => {
    const design = createDefaultDesign()

    const cadetBudgets = computeBudgets(design, 'cadet')
    const engineerBudgets = computeBudgets(design, 'engineer')
    const flightDirectorBudgets = computeBudgets(design, 'flight-director')

    // Budget caps should differ
    expect(cadetBudgets.budgetCap).toBe(20)
    expect(engineerBudgets.budgetCap).toBe(16)
    expect(flightDirectorBudgets.budgetCap).toBe(13)
  })

  it('calculates delta-v correctly using rocket equation', () => {
    const design = createDefaultDesign()
    design.propulsion = 'prop-chemical' // Isp 230s, 2kg propellant

    const budgets = computeBudgets(design, 'engineer')

    // Delta-v should be positive
    expect(budgets.deltaVAvailable).toBeGreaterThan(0)

    // With chemical propulsion, should have reasonable delta-v
    expect(budgets.deltaVAvailable).toBeGreaterThan(500)
    expect(budgets.deltaVAvailable).toBeLessThan(2000)
  })

  it('calculates reserve correctly', () => {
    const design = createDefaultDesign()
    design.planning.reservePercent = 20

    const budgets = computeBudgets(design, 'engineer')

    // Reserve should be ~20% of base cost
    const baseCost = budgets.partsCost + budgets.rideCost + budgets.groundCost + budgets.operationsCost
    const expectedReserve = baseCost * 0.2
    expect(Math.abs(budgets.reserveAmount - expectedReserve)).toBeLessThan(0.01)
  })

  it('calculates time correctly', () => {
    const design = createDefaultDesign()
    design.planning.buildTurns = 5
    design.planning.testTurns = 2

    const budgets = computeBudgets(design, 'engineer')

    expect(budgets.buildTurns).toBe(5)
    expect(budgets.testTurns).toBe(2)
    expect(budgets.totalPrepTurns).toBe(7)
    expect(budgets.readyTurn).toBe(7)
    expect(budgets.rideTurn).toBe(8) // Default lunar ride
    expect(budgets.timeMarginTurns).toBe(1)
  })

  it('handles multiple instruments', () => {
    const design = createDefaultDesign()
    design.instruments = ['inst-ir-spec', 'inst-camera']

    const budgets = computeBudgets(design, 'engineer')

    // Data should be sum of both instruments
    expect(budgets.dataPerTurn).toBeGreaterThan(2) // IR spec is 2 GB/turn, camera is 3 GB/turn
  })

  it('handles electric propulsion', () => {
    const design = createDefaultDesign()
    // Default already uses electric propulsion
    expect(design.propulsion).toBe('prop-ion')
    expect(design.transfer).toBe('transfer-low-energy')

    const budgets = computeBudgets(design, 'engineer')

    // Electric propulsion should have high Isp, so high delta-v
    expect(budgets.deltaVAvailable).toBeGreaterThan(2000)

    // Should track thrusting power (separate from normal power draw)
    expect(budgets.thrustingPowerConsumed).toBe(60)

    // Normal power should be positive (thruster only draws standby power)
    expect(budgets.powerMargin).toBeGreaterThan(0)
  })
})

describe('createDefaultDesign', () => {
  it('creates a valid design', () => {
    const design = createDefaultDesign()

    expect(design.planning).toBeDefined()
    expect(design.instruments.length).toBeGreaterThan(0)
    expect(design.structure).toBeDefined()
    expect(design.solar).toBeDefined()
    expect(design.battery).toBeDefined()
    expect(design.radio).toBeDefined()
    expect(design.computer).toBeDefined()
    expect(design.attitude).toBeDefined()
    expect(design.propulsion).toBeDefined()
    expect(design.orbit).toBeDefined()
    expect(design.ride).toBeDefined()
    expect(design.transfer).toBeDefined()
    expect(design.groundStation).toBeDefined()
  })

  it('default design passes Go/No-Go on engineer difficulty', () => {
    const design = createDefaultDesign()
    const budgets = computeBudgets(design, 'engineer')

    // Should have positive margins on key resources
    expect(budgets.massMargin).toBeGreaterThanOrEqual(0)
    expect(budgets.volumeMargin).toBeGreaterThanOrEqual(0)
    expect(budgets.powerMargin).toBeGreaterThanOrEqual(0)
    expect(budgets.budgetMargin).toBeGreaterThanOrEqual(0)
    expect(budgets.timeMarginTurns).toBeGreaterThanOrEqual(0)
    expect(budgets.deltaVMargin).toBeGreaterThanOrEqual(0)
  })
})
