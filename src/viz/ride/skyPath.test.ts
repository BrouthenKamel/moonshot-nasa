import { describe, it, expect } from 'vitest'
import {
  CAPTURE,
  DROP,
  GROUND_Y,
  MOON,
  NOSE,
  SIGN_RECT,
  SKY_W,
  craftLeg,
  overshoot,
  pathLength,
  pointAlong,
  rideLeg,
  turnDots,
} from './skyPath'
import type { DropKind } from './rideView'

const DROPS: DropKind[] = ['gto', 'trans-lunar', 'lunar-vicinity']
const TRANSFERS = ['direct', 'low_energy'] as const

describe('skyPath', () => {
  it('every path stays in the sky', () => {
    for (const d of DROPS)
      for (const t of TRANSFERS)
        for (const p of [...rideLeg(d), ...craftLeg(d, t)]) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
          expect(p.x).toBeGreaterThanOrEqual(0)
          expect(p.x).toBeLessThanOrEqual(SKY_W)
          expect(p.y).toBeGreaterThanOrEqual(0)
          expect(p.y).toBeLessThanOrEqual(GROUND_Y)
        }
  })

  it('legs join', () => {
    for (const d of DROPS) {
      const ride = rideLeg(d)
      expect(ride[0]).toEqual(NOSE[d])
      expect(ride[ride.length - 1]).toEqual(DROP[d])
      for (const t of TRANSFERS) {
        const craft = craftLeg(d, t)
        const end = craft[craft.length - 1]
        expect(Math.hypot(end.x - CAPTURE.x, end.y - CAPTURE.y)).toBeLessThan(0.5)
        if (d !== 'gto') expect(craft[0]).toEqual(DROP[d])
      }
    }
  })

  it('the GTO path is the longest', () => {
    const gto = pathLength(craftLeg('gto', 'low_energy'))
    const lunar = pathLength(craftLeg('trans-lunar', 'low_energy'))
    const direct = pathLength(craftLeg('trans-lunar', 'direct'))
    expect(gto).toBeGreaterThan(lunar)
    expect(lunar).toBeGreaterThan(direct)
  })

  it('pointAlong clamps to the ends', () => {
    const p = craftLeg('trans-lunar', 'low_energy')
    expect(pointAlong(p, 0)).toEqual(p[0])
    expect(pointAlong(p, 1)).toEqual(p[p.length - 1])
    expect(pointAlong(p, 2)).toEqual(p[p.length - 1])
    expect(pointAlong(p, -1)).toEqual(p[0])
  })

  it('turnDots', () => {
    const p = craftLeg('trans-lunar', 'low_energy')
    expect(turnDots(p, 0)).toEqual([])
    const dots = turnDots(p, 11)
    expect(dots).toHaveLength(11)
    const xs = p.map((q) => q.x)
    const ys = p.map((q) => q.y)
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6)
      expect(d.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6)
      expect(d.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6)
      expect(d.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6)
    }
  })

  it('overshoot continues straight past the end', () => {
    const p = craftLeg('trans-lunar', 'direct')
    const o = overshoot(p, 160)
    expect(o).toHaveLength(2)
    expect(o[0]).toEqual(p[p.length - 1])
    expect(pathLength(o)).toBeCloseTo(160, 3)
  })

  it('signs do not cover the Moon', () => {
    const half = MOON.r + 40
    for (const r of Object.values(SIGN_RECT)) {
      const overlapX = r.x < MOON.x + half && r.x + r.w > MOON.x - half
      const overlapY = r.y < MOON.y + half && r.y + r.h > MOON.y - half
      expect(overlapX && overlapY).toBe(false)
    }
  })
})
