import { describe, expect, it } from 'vitest'
import { createDefaultDesign, computeBudgets } from '../../sim/budgets'
import type { Design } from '../../sim/types'
import {
  bugsFound, buildModel, initialState, loadWatts, phaseAt, stepEnergy, testOutcome, totalHours, type EnergyModel,
} from './logic'

const design = createDefaultDesign()
const allOn = (m: EnergyModel) => Object.fromEntries(m.loads.map((l) => [l.id, l.startsOn]))
const run = (m: EnergyModel, on: Record<string, boolean>) => {
  let s = initialState(m)
  for (let i = 0; i < 4000 && !s.dead && !s.done; i++) s = stepEnergy(m, s, 0.01, on)
  return s
}

describe('eclipse energy model', () => {
  it('takes numbers from computeBudgets', () => {
    const m = buildModel(design, 'engineer')
    const b = computeBudgets(design, 'engineer')
    expect(m.generationW).toBe(b.powerGenerated)
    expect(m.busW).toBe(b.busPower)
    expect(m.capacityWh).toBe(b.batteryCapacity)
    expect(m.eclipseH).toBeCloseTo(b.eclipseDurationMinutes / 60)
    expect(m.floorPct).toBeCloseTo(20)
    expect(loadWatts(m, { 'inst-ir-spec': true })).toBe(b.busPower + b.instrumentPower)
  })
  it('splits sunlight and eclipse', () => {
    const m = buildModel(design, 'engineer')
    expect(phaseAt(m, 0).eclipse).toBe(false)
    expect(phaseAt(m, m.periodH - 0.01).eclipse).toBe(true)
    expect(totalHours(m)).toBeCloseTo(3 * m.periodH)
  })
  it('survives with a big battery, and drains by the load in eclipse', () => {
    const m = buildModel(design, 'engineer')
    const s = run(m, allOn(m))
    expect(s.done).toBe(true)
    expect(s.dead).toBe(false)
    const expected = 100 - (loadWatts(m, allOn(m)) * m.eclipseH * 100) / m.capacityWh
    expect(s.minPct).toBeCloseTo(expected, 0)
  })
  it('dies with a small battery and everything on; switching loads off saves it', () => {
    const small: Design = { ...design, battery: 'battery-small', instruments: ['inst-laser', 'inst-ir-spec'], orbit: 'orbit-100km' }
    const m = buildModel(small, 'engineer')
    const dead = run(m, allOn(m))
    expect(dead.dead).toBe(true)
    expect(dead.minPct).toBeCloseTo(20)
    const off = Object.fromEntries(m.loads.map((l) => [l.id, false]))
    expect(run(m, off).dead).toBe(false)
  })
  it('halo loop has no eclipse', () => {
    const m = buildModel({ ...design, orbit: 'orbit-halo' }, 'engineer')
    expect(m.eclipseH).toBe(0)
    expect(run(m, allOn(m)).minPct).toBeGreaterThan(90)
  })
})

describe('test campaigns', () => {
  it('finds more bugs with more campaigns', () => {
    expect([0, 1, 2, 3].map(bugsFound)).toEqual([0, 4, 6, 7])
  })
  it('costs a month each and raises the odds', () => {
    const a = testOutcome(design, 'engineer', 0)
    const c = testOutcome(design, 'engineer', 3)
    expect(c.readyMonths - a.readyMonths).toBe(3)
    expect(c.success).toBeGreaterThanOrEqual(a.success)
  })
})
