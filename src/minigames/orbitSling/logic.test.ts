import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from '../../sim/budgets'
import { getOrbitById } from '../../data/orbits'
import {
  CAPTURE_RADIUS,
  FAMILIES,
  RA_MAX,
  buildResult,
  commitFamily,
  coverageSamples,
  nearestIndex,
  pullToMorph,
  evaluate,
  familyById,
  gaugeFill,
  gaugeTone,
  handlesFromRadii,
  lapseCoverage,
  magnet,
  nearestFamily,
  raOf,
  rpOf,
  shapeAt,
  trailMagnet,
  trailPath,
  tripText,
} from './logic'

describe('handles and families', () => {
  it('has the three real families seated at their anchors', () => {
    expect(FAMILIES.map((f) => f.id)).toEqual(['orbit-halo', 'orbit-elliptical', 'orbit-100km'])
    for (const f of FAMILIES) {
      const m = magnet(f.at)
      expect(m.family.id).toBe(f.id)
      expect(m.seated).toBe(true)
    }
  })
  it('round-trips radii to handles', () => {
    const h = handlesFromRadii(rpOf(0.4), raOf(0.4, 0.6))
    expect(h.p).toBeCloseTo(0.4, 5)
    expect(h.q).toBeCloseTo(0.6, 5)
    expect(raOf(0, 1)).toBeCloseTo(RA_MAX, 5)
  })
  it('morphs freely far from any family and pulls in close', () => {
    const far = magnet({ p: 0.5, q: 0.8 })
    expect(nearestFamily({ p: 0.5, q: 0.8 }).distance).toBeGreaterThan(CAPTURE_RADIUS)
    expect(far.pull).toBe(0)
    expect(far.shown).toEqual({ p: 0.5, q: 0.8 })
    const near = magnet({ p: 0.12, q: 0.9 })
    expect(near.pull).toBeGreaterThan(0)
    expect(near.shown.q).toBeGreaterThan(0.9)
  })
  it('always commits to the nearest family on release', () => {
    expect(commitFamily({ p: 0.9, q: 0.2 }).id).toBe('orbit-100km')
    expect(commitFamily({ p: 0.1, q: 0.5 }).id).toBe('orbit-elliptical')
    expect(commitFamily({ p: 0.0, q: 0.95 }).id).toBe('orbit-halo')
  })
  it('clamps wild input', () => {
    expect(magnet({ p: -5, q: 9 }).shown.q).toBeLessThanOrEqual(1)
  })
  it('draws a longer period for a bigger orbit', () => {
    expect(shapeAt(familyById('orbit-halo').at).period).toBeGreaterThan(shapeAt(familyById('orbit-100km').at).period)
  })
})

describe('numbers per family', () => {
  const design = { ...createDefaultDesign(), instruments: ['inst-laser'] }
  it('matches orbits.ts for eclipse and blackout', () => {
    for (const f of FAMILIES) {
      const o = getOrbitById(f.id)!
      const c = evaluate(design, 'engineer', f.id, 'transfer-low-energy')
      expect(c.eclipseMin).toBe(Math.round(o.eclipseHours * 60))
      expect(c.blackoutPct).toBe(Math.round((1 - o.earthVisible) * 100))
    }
  })
  it('the laser maps the pole from 15 km but not from 100 km', () => {
    const low = evaluate(design, 'engineer', 'orbit-elliptical', 'transfer-low-energy')
    const high = evaluate(design, 'engineer', 'orbit-100km', 'transfer-low-energy')
    expect(low.coveragePct).toBeGreaterThan(0)
    expect(high.coveragePct).toBe(0)
  })
  it('costs more fuel to reach the circular orbit than the halo', () => {
    const halo = evaluate(design, 'engineer', 'orbit-halo', 'transfer-low-energy')
    const circ = evaluate(design, 'engineer', 'orbit-100km', 'transfer-low-energy')
    expect(circ.dvNeeded).toBeGreaterThan(halo.dvNeeded)
  })
  it('uses a reference laser when the payload cannot see ice', () => {
    const blind = { ...createDefaultDesign(), instruments: ['inst-ir-spec'] }
    const c = evaluate(blind, 'engineer', 'orbit-elliptical', 'transfer-low-energy')
    expect(c.referenceSensor).toBe(true)
    expect(c.coveragePct).toBeGreaterThan(0)
  })
  it('an ion engine cannot do a direct transfer', () => {
    const c = evaluate(design, 'engineer', 'orbit-elliptical', 'transfer-direct')
    expect(c.captureDv).toBeNull()
    expect(c.reachable).toBe(false)
    expect(c.transferMonths).toBeNull()
  })
  it('a chemical engine gets there in days directly and months low-energy', () => {
    const chem = { ...design, propulsion: 'prop-chemical-large' }
    const d = evaluate(chem, 'engineer', 'orbit-halo', 'transfer-direct')
    const l = evaluate(chem, 'engineer', 'orbit-halo', 'transfer-low-energy')
    expect(d.captureDv).not.toBeNull()
    expect(d.transferMonths).toBe(0)
    expect(l.transferMonths ?? 0).toBeGreaterThan(0)
    expect(l.captureDv!).toBeLessThan(d.captureDv!)
  })
})

describe('lapse and gauge', () => {
  it('coverage grows monotonically to the sim number', () => {
    const s = coverageSamples(60)
    expect(s[0]).toBe(0)
    expect(s[12]).toBeCloseTo(60, 5)
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1])
    expect(lapseCoverage(0, 0.5)).toBe(0)
    expect(lapseCoverage(50, 2)).toBeCloseTo(50, 5)
  })
  it('reads the gauge', () => {
    expect(gaugeFill(0, 100)).toBe(0)
    expect(gaugeFill(50, 100)).toBe(0.5)
    expect(gaugeFill(500, 100)).toBe(1.2)
    expect(gaugeFill(10, 0)).toBe(1.2)
    expect(gaugeTone(0.5)).toBe('good')
    expect(gaugeTone(0.9)).toBe('warn')
    expect(gaugeTone(1.1)).toBe('bad')
  })
})

describe('transfer trail', () => {
  it('starts at Earth and ends at the Moon for both routes', () => {
    for (const u of [0, 0.5, 1]) {
      const p = trailPath(u)
      expect(p[0]).toEqual([0, 0])
      expect(p[p.length - 1][0]).toBeCloseTo(1, 5)
      expect(p[p.length - 1][1]).toBeCloseTo(0, 5)
    }
  })
  it('low-energy swings far past the Moon', () => {
    const maxX = Math.max(...trailPath(1).map((p) => p[0]))
    expect(maxX).toBeGreaterThan(1.3)
    expect(Math.max(...trailPath(0).map((p) => p[0]))).toBeLessThanOrEqual(1.001)
  })
  it('maps drag to morph and snaps to one of two', () => {
    expect(pullToMorph(0.0)).toBe(0)
    expect(pullToMorph(0.7)).toBe(1)
    const path = trailPath(0)
    expect(nearestIndex(path, 0, 0)).toBe(0)
    expect(nearestIndex(path, 1, 0)).toBe(path.length - 1)
    expect(trailMagnet(0.1).pick).toBe('transfer-direct')
    expect(trailMagnet(0.9).pick).toBe('transfer-low-energy')
    expect(trailMagnet(0.99).seated).toBe(true)
    expect(trailMagnet(0.5).shown).toBeCloseTo(0.5, 5)
  })
  it('words the trip', () => {
    expect(tripText(null, 'transfer-direct')).toBe('cannot brake')
    expect(tripText(0, 'transfer-direct')).toBe('5 days')
    expect(tripText(1, 'transfer-low-energy')).toBe('1 month')
    expect(tripText(4, 'transfer-low-energy')).toBe('4 months')
  })
})

describe('result', () => {
  const design = { ...createDefaultDesign(), instruments: ['inst-laser'] }
  it('patches orbit and transfer and gives three insights', () => {
    const orbit = evaluate(design, 'engineer', 'orbit-elliptical', 'transfer-low-energy')
    const transfer = evaluate(design, 'engineer', 'orbit-elliptical', 'transfer-low-energy')
    const r = buildResult({ orbit, transfer, durationS: 42 })
    expect(r.patch).toEqual({
      orbit: 'orbit-elliptical',
      transfer: 'transfer-low-energy',
    })
    expect(r.insights.map((i) => i.id)).toEqual(['orbit-coverage', 'orbit-dv-margin', 'transfer-time'])
    expect(r.insights.every((i) => i.room === 'flight-dynamics')).toBe(true)
    expect(r.insights[0].metric.value).toBe(orbit.coveragePct)
    expect(r.durationS).toBe(42)
  })
  it('words a shortfall and an impossible route', () => {
    const orbit = evaluate(design, 'engineer', 'orbit-100km', 'transfer-direct')
    const r = buildResult({ orbit, transfer: orbit, durationS: 1 })
    expect(r.insights[1].text).toContain('no way to brake')
    expect(r.insights[2].text).toContain('cannot brake')
    const weak = evaluate({ ...design, propulsion: 'prop-coldgas' }, 'engineer', 'orbit-100km', 'transfer-low-energy')
    if (weak.captureDv !== null && weak.dvMargin < 0) {
      expect(buildResult({ orbit: weak, transfer: weak, durationS: 1 }).insights[1].text).toContain('short')
    }
  })
  it('says no eclipses for the halo', () => {
    const o = evaluate(design, 'engineer', 'orbit-halo', 'transfer-low-energy')
    expect(buildResult({ orbit: o, transfer: o, durationS: 1 }).insights[0].text).toContain('no eclipses')
  })
})
