import { describe, it, expect } from 'vitest'
import {
  shapeFor,
  orbitPoint,
  trueAnomaly,
  meanAnomalyOf,
  hiddenBy,
  hiddenStretch,
  inStretch,
  overCap,
  SUN_DIR,
  EARTH_DIR,
} from './orbitGeometry'

const len = (v: number[]) => Math.hypot(v[0], v[1], v[2])

describe('orbitGeometry', () => {
  it('has the low point over the south pole and the far point over the north', () => {
    const s = shapeFor('orbit-elliptical')
    const low = orbitPoint(s, 0)
    const far = orbitPoint(s, Math.PI)
    expect(low[1]).toBeCloseTo(-1.035, 6)
    expect(len(low)).toBeCloseTo(1.035, 6)
    expect(far[1]).toBeCloseTo(2.81, 6)
  })
  it('never goes below the low point, for every shape', () => {
    for (const id of ['orbit-halo', 'orbit-elliptical', 'orbit-100km']) {
      const s = shapeFor(id)
      for (let i = 0; i < 360; i++) expect(len(orbitPoint(s, (i / 360) * 2 * Math.PI))).toBeGreaterThanOrEqual(s.rp - 1e-9)
    }
  })
  it('keeps every orbit polar: the plane contains the y axis', () => {
    const s = shapeFor('orbit-halo')
    const a = orbitPoint(s, 1)
    const b = orbitPoint(s, 2.5)
    expect(a[0] * b[2] - a[2] * b[0]).toBeCloseTo(0, 9)
  })
  it('solves Kepler: fixed points, monotonic, and equal to the mean anomaly on a circle', () => {
    const e = shapeFor('orbit-elliptical')
    const c = shapeFor('orbit-100km')
    expect(trueAnomaly(e, 0)).toBeCloseTo(0, 9)
    expect(Math.abs(trueAnomaly(e, Math.PI))).toBeCloseTo(Math.PI, 6)
    expect(trueAnomaly(c, 1.3)).toBeCloseTo(1.3, 9)
    expect(trueAnomaly(e, 0.5)).toBeGreaterThan(0.5)
  })
  it('gives an unknown orbit the circular shape', () => {
    expect(shapeFor('nope')).toEqual(shapeFor('orbit-100km'))
  })
  it('knows when the Moon is in the way', () => {
    expect(hiddenBy([-2, 0, 0], [1, 0, 0])).toBe(true)
    expect(hiddenBy([2, 0, 0], [1, 0, 0])).toBe(false)
    expect(hiddenBy([-2, 1.5, 0], [1, 0, 0])).toBe(false)
  })
  it('knows when a point is over the polar cap', () => {
    expect(overCap([0, -1.04, 0])).toBe(true)
    expect(overCap([1.04, 0, 0])).toBe(false)
  })
  it('sizes the hidden stretch from the data, in time, and has none for a share of 0', () => {
    const s = shapeFor('orbit-100km')
    expect(hiddenStretch(shapeFor('orbit-halo'), SUN_DIR, 0)).toBeNull()
    expect(inStretch(null, 1)).toBe(false)
    const st = hiddenStretch(s, SUN_DIR, 0.4)!
    expect(st.half).toBeCloseTo(Math.PI * 0.4, 9)
    let inside = 0
    for (let i = 0; i < 1000; i++) if (inStretch(st, (i / 1000) * 2 * Math.PI)) inside++
    expect(inside / 1000).toBeCloseTo(0.4, 2)
    expect(hiddenBy(orbitPoint(s, trueAnomaly(s, st.centre)), SUN_DIR)).toBe(true)
    expect(inStretch({ centre: 0.1, half: 0.3 }, 2 * Math.PI - 0.1)).toBe(true)
  })
  it('inverts the Kepler solver', () => {
    const e = shapeFor('orbit-elliptical')
    for (const m of [0.2, 1.7, 3.3, 5.9]) expect(meanAnomalyOf(e, trueAnomaly(e, m))).toBeCloseTo(m, 6)
  })
  it('exports unit directions', () => {
    expect(len(SUN_DIR)).toBeCloseTo(1, 9)
    expect(len(EARTH_DIR)).toBeCloseTo(1, 9)
  })
})
