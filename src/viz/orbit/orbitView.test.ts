import { describe, it, expect } from 'vitest'
import { buildOrbitView, coverageAt, stripCount, upkeepLine, COVERAGE_GOAL } from './orbitView'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign, lunahMapDesign } from '../../sim/fixtures'

const opt = (v: ReturnType<typeof buildOrbitView>, id: string) => v.options.find((o) => o.id === id)!

describe('buildOrbitView', () => {
  it('lists the three orbits and marks the picked one', () => {
    const v = buildOrbitView(lunahMapDesign, 'engineer')
    expect(v.options.map((o) => o.id)).toEqual(['orbit-halo', 'orbit-elliptical', 'orbit-100km'])
    expect(v.selectedId).toBe('orbit-elliptical')
    expect(v.selected).toBe(opt(v, 'orbit-elliptical'))
  })

  it('shows the same numbers and checks as the game rules, for every design and orbit', () => {
    for (const d of [flashlightDesign, lunahMapDesign, createDefaultDesign()]) {
      const v = buildOrbitView(d, 'engineer')
      for (const o of v.options) {
        const trial = { ...d, orbit: o.id }
        const b = computeBudgets(trial, 'engineer')
        const checks = goNoGo(trial, b).checks
        expect(o.projectedCoverage).toBe(b.projectedCoverage)
        expect(o.captureDeltaV).toBe(b.captureDeltaV)
        expect(o.checks.slice(0, 3).map((c) => c.resource)).toEqual(['Delta-v', 'Power', 'Science'])
        for (const extra of o.checks.slice(3)) {
          expect(['Budget', 'Data Link']).toContain(extra.resource)
          expect(extra.status).not.toBe('green')
        }
        for (const name of ['Budget', 'Data Link']) {
          const real = checks.find((x) => x.resource === name)!
          expect(o.checks.some((c) => c.resource === name)).toBe(real.status !== 'green')
        }
        for (const c of o.checks) {
          const real = checks.find((x) => x.resource === c.resource)!
          expect(c.status).toBe(real.status)
          expect(c.reason).toBe(real.reason)
        }
        expect(coverageAt(o, 12)).toBeCloseTo(o.reachable && o.bestIceRate > 0 ? b.projectedCoverage : 0, 6)
        expect(o.verdict.tone === 'bad').toBe(o.checks.some((c) => c.status === 'red'))
        if (o.verdict.tone === 'good') expect(o.checks.every((c) => c.status === 'green')).toBe(true)
      }
    }
  })

  it('gives the verdicts of the LunaH-Map-like design', () => {
    const v = buildOrbitView(lunahMapDesign, 'engineer')
    expect(opt(v, 'orbit-halo').verdict).toEqual({ tone: 'warn', text: 'MAPS TOO SLOWLY' })
    // The long ion transfer makes these two orbits cost more: the Budget check decides their verdicts
    expect(opt(v, 'orbit-elliptical').verdict).toEqual({ tone: 'warn', text: 'EATS INTO THE RESERVE' })
    expect(opt(v, 'orbit-elliptical').checks.find((c) => c.resource === 'Science')!.status).toBe('green')
    expect(opt(v, 'orbit-100km').verdict).toEqual({ tone: 'bad', text: 'OVER BUDGET WITH THIS ORBIT' })
    expect(opt(v, 'orbit-100km').stripTone).toBe('blind')
    expect(opt(v, 'orbit-100km').iceInRange).toBe(false)
    expect(opt(v, 'orbit-elliptical').stripTone).toBe('ice')
  })

  it('blocks orbits the tank cannot reach', () => {
    const o = opt(buildOrbitView(flashlightDesign, 'engineer'), 'orbit-elliptical')
    expect(o.reachable).toBe(false)
    expect(o.verdict).toEqual({ tone: 'bad', text: 'NOT ENOUGH FUEL TO GET IN' })
    expect(o.checks[0]).toMatchObject({ resource: 'Delta-v', status: 'red' })
    expect(coverageAt(o, 6)).toBe(0)
    expect(stripCount(o, 12)).toBe(0)
  })

  it('says so when no ice instrument is on board, and still draws grey passes', () => {
    const v = buildOrbitView(createDefaultDesign(), 'engineer')
    for (const o of v.options) {
      expect(o.iceInstruments).toEqual([])
      expect(o.stripTone).toBe('none')
      if (!o.checks.some((c) => c.status === 'red')) expect(o.verdict).toEqual({ tone: 'warn', text: 'NO ICE INSTRUMENT ON BOARD' })
      expect(coverageAt(o, 12)).toBe(0)
      expect(stripCount(o, 12)).toBeGreaterThan(0)
    }
  })

  it('names the cause the Power check names when no instrument is on board', () => {
    const o = buildOrbitView({ ...lunahMapDesign, instruments: [] }, 'engineer').selected
    expect(o.checks.find((c) => c.resource === 'Power')!.status).toBe('red')
    expect(o.verdict).toEqual({ tone: 'bad', text: 'NO POWER FOR THE INSTRUMENTS' })
  })

  it('says too high when the ice instruments are out of range and nothing is red', () => {
    // The cadet budget is large enough that the 100 km orbit is not over budget
    const o = opt(buildOrbitView(lunahMapDesign, 'cadet'), 'orbit-100km')
    expect(o.checks.some((c) => c.status === 'red')).toBe(false)
    expect(o.verdict).toEqual({ tone: 'warn', text: 'TOO HIGH FOR THE ICE INSTRUMENTS' })
    expect(o.stripTone).toBe('blind')
  })

  it('falls back to the first orbit for an unknown id', () => {
    const v = buildOrbitView({ ...lunahMapDesign, orbit: 'orbit-gone' }, 'engineer')
    expect(v.selectedId).toBe('orbit-halo')
  })

  it('runs the time-lapse from 0 to the projected value without NaN, also at 100%', () => {
    const full = opt(buildOrbitView(lunahMapDesign, 'engineer'), 'orbit-elliptical')
    const slow = opt(buildOrbitView(lunahMapDesign, 'engineer'), 'orbit-halo')
    for (const o of [full, slow]) {
      expect(coverageAt(o, 0)).toBe(0)
      let last = -1
      for (let m = 0; m <= 12; m += 0.5) {
        const c = coverageAt(o, m)
        const n = stripCount(o, m)
        expect(Number.isFinite(c)).toBe(true)
        expect(Number.isFinite(n)).toBe(true)
        expect(c).toBeGreaterThanOrEqual(last)
        last = c
        expect(n).toBeLessThanOrEqual(600)
      }
    }
    expect(coverageAt(slow, 12)).toBeLessThan(COVERAGE_GOAL)
    expect(stripCount(full, 12)).toBeGreaterThan(stripCount(slow, 12))
  })

  it('says upkeep against the 12-month mission, with a number only when it falls short', () => {
    const halo = opt(buildOrbitView(lunahMapDesign, 'engineer'), 'orbit-halo')
    expect(halo.upkeepTurns).toBeGreaterThan(24)
    expect(upkeepLine(halo)).toBe('Holding the orbit costs 1 m/s a month: fuel for far beyond the 12-month mission.')
    expect(upkeepLine({ ...halo, upkeepTurns: 15 })).toBe('Holding the orbit costs 1 m/s a month: fuel for 15 months, enough for the mission.')
    expect(upkeepLine({ ...halo, upkeepTurns: 9 })).toBe('Only 9 months of fuel to hold the orbit: the mission will end early.')
  })

  it('agrees with the game when the ion engine has no power to thrust (Important 1)', () => {
    const d = { ...createDefaultDesign(), solar: 'solar-1wing', instruments: ['inst-laser'], orbit: 'orbit-elliptical' }
    const b = computeBudgets(d, 'engineer')
    expect(b.thrustLevel).toBe(0)
    const o = buildOrbitView(d, 'engineer').selected
    expect(o.verdict).toEqual({ tone: 'bad', text: 'NO POWER TO FLY THERE' })
    expect(coverageAt(o, 12)).toBeCloseTo(b.projectedCoverage, 6)
  })

  it('says when the stored orbit is not one of the three (Important 2)', () => {
    expect(buildOrbitView({ ...lunahMapDesign, orbit: 'orbit-gone' }, 'engineer').storedIsKnown).toBe(false)
    expect(buildOrbitView(lunahMapDesign, 'engineer').storedIsKnown).toBe(true)
  })
})

