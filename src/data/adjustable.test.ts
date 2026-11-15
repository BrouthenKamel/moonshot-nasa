import { describe, expect, it } from 'vitest'
import { ORBIT_FAR_KM, ORBIT_MAX_KM, ORBIT_MIN_KM, getOrbitById, orbitPeriodHours, polarOrbit, polarOrbitId, polarOrbitKm } from './orbits'
import { LOW_ENERGY_DAYS, TRANSFER_MAX_DAYS, TRANSFER_MIN_DAYS, getTransferById, timedTransfer, timedTransferDays, timedTransferId, transferDays } from './transfers'
import { computeBudgets, iceSignal } from '../sim/budgets'
import { archetypes } from '../sim/fixtures'

describe('polar orbit at any height over the pole', () => {
  it('stays within the safe range: no lower than crashing, no higher than drifting off', () => {
    expect(polarOrbitId(2)).toBe(`orbit-polar-${ORBIT_MIN_KM}`)
    expect(polarOrbitId(99999)).toBe(`orbit-polar-${ORBIT_MAX_KM}`)
    expect(polarOrbitKm('orbit-polar-42')).toBe(42)
    expect(polarOrbitKm('orbit-elliptical')).toBeNull()
  })

  it('is LunaH-Map-like when low: lopsided, about 150 passes a month, cheap to hold', () => {
    const o = polarOrbit(15)
    expect(o.type).toBe('elliptical')
    expect(o.farPointKm).toBe(ORBIT_FAR_KM)
    expect(o.passesPerTurn).toBeGreaterThan(130)
    expect(o.passesPerTurn).toBeLessThan(170)
    expect(o.stationKeepingDeltaV).toBeGreaterThan(3)
    expect(o.stationKeepingDeltaV).toBeLessThan(8)
  })

  it('becomes a circle above the far point, and higher orbits are slower and cheaper to hold', () => {
    expect(polarOrbit(ORBIT_FAR_KM + 500).type).toBe('circular')
    const heights = [10, 25, 100, 1000, 4000]
    const periods = heights.map((h) => orbitPeriodHours(polarOrbit(h)))
    const holding = heights.map((h) => polarOrbit(h).stationKeepingDeltaV)
    for (let i = 1; i < heights.length; i++) {
      expect(periods[i]).toBeGreaterThan(periods[i - 1])
      expect(holding[i]).toBeLessThanOrEqual(holding[i - 1])
    }
  })

  it('is found by id, and the named orbits still are', () => {
    expect(getOrbitById('orbit-polar-20')?.altitude).toBe(20)
    // Since 15 Nov the named elliptical orbit is the slider's 15 km orbit, worked out the same way (was a listed 141)
    expect(getOrbitById('orbit-elliptical')?.passesPerTurn).toBe(151)
    const { id: _a, name: _b, description: _c, flownBy: _d, ...named } = getOrbitById('orbit-elliptical')!
    const { id: _e, name: _f, description: _g, flownBy: _h, ...polar } = getOrbitById('orbit-polar-15')!
    expect(named).toEqual(polar)
    expect(getOrbitById('orbit-nonsense')).toBeUndefined()
  })
})

describe('transfer of any length', () => {
  it('clamps to real paths: 4 days direct to 4 months low-energy', () => {
    expect(timedTransferId(1)).toBe(`transfer-${TRANSFER_MIN_DAYS}d`)
    expect(timedTransferId(999)).toBe(`transfer-${TRANSFER_MAX_DAYS}d`)
    expect(timedTransferDays('transfer-45d')).toBe(45)
    expect(timedTransferDays('transfer-direct')).toBeNull()
  })

  it('a fast path is direct and chemical-only; a slow one is low-energy and open to ion engines', () => {
    expect(timedTransfer(5)).toMatchObject({ type: 'direct', propulsionType: 'chemical', durationTurns: 0 })
    expect(timedTransfer(LOW_ENERGY_DAYS)).toMatchObject({ type: 'low_energy', propulsionType: 'any' })
    expect(timedTransfer(120).durationTurns).toBe(4)
    expect(timedTransfer(120).arrivalExcessKms).toBe(0)
  })

  it('arrives slower the longer it takes', () => {
    let prev = Infinity
    for (const d of [4, 10, 20, 45, 70, 90]) {
      const v = timedTransfer(d).arrivalExcessKms!
      expect(v).toBeLessThanOrEqual(prev)
      prev = v
    }
  })

  it('knows its days, worked out or named', () => {
    expect(transferDays(getTransferById('transfer-30d')!)).toBe(30)
    expect(transferDays(getTransferById('transfer-direct')!)).toBe(5)
    expect(transferDays(getTransferById('transfer-low-energy')!)).toBe(120)
  })
})

describe('the budget follows the drag', () => {
  const lean = archetypes.lean // big chemical engine, lunar ride

  it('a longer transfer needs a smaller capture burn', () => {
    const capture = (days: number) =>
      computeBudgets({ ...lean, orbit: polarOrbitId(15), transfer: timedTransferId(days) }, 'engineer').captureDeltaV!
    expect(capture(5)).toBeGreaterThan(capture(45))
    expect(capture(45)).toBeGreaterThan(capture(120))
  })

  it('a lower orbit maps the ice only below the instruments\' height limit', () => {
    const coverage = (km: number) =>
      computeBudgets({ ...lean, orbit: polarOrbitId(km), transfer: timedTransferId(120) }, 'engineer').projectedCoverage
    expect(coverage(15)).toBeGreaterThan(50)
    expect(coverage(100)).toBe(0)
  })

  it('an ion engine cannot brake from a fast path, only from the slow end', () => {
    const ion = archetypes.lunahMap
    const at = (days: number) =>
      computeBudgets({ ...ion, orbit: polarOrbitId(15), transfer: timedTransferId(days) }, 'engineer').captureDeltaV
    expect(at(45)).toBeNull()
    expect(at(120)).not.toBeNull()
  })
})

describe('ice signal fades with height', () => {
  it('is full up to the limit, then fades, and is gone from about three times the limit', () => {
    expect(iceSignal(20, 15)).toBe(1)
    expect(iceSignal(20, 20)).toBe(1)
    expect(iceSignal(20, 25)).toBeLessThan(1)
    expect(iceSignal(20, 25)).toBeGreaterThan(iceSignal(20, 30))
    expect(iceSignal(20, 70)).toBe(0)
    expect(iceSignal(null, 5000)).toBe(1)
  })

  it('the ice map shrinks step by step above the limit instead of dropping from 100 to 0', () => {
    const coverage = (km: number) =>
      computeBudgets({ ...archetypes.lean, orbit: polarOrbitId(km), transfer: timedTransferId(120) }, 'engineer').projectedCoverage
    const heights = [25, 35, 40, 45, 50, 60, 80]
    const maps = heights.map(coverage)
    for (let i = 1; i < maps.length; i++) expect(maps[i]).toBeLessThanOrEqual(maps[i - 1])
    // Somewhere in between, neither full nor empty
    expect(maps.some((m) => m > 20 && m < 80)).toBe(true)
    expect(coverage(100)).toBe(0)
  })
})
