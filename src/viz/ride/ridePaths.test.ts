import { describe, expect, it } from 'vitest'
import { rides } from '../../data/rides'
import { transfers } from '../../data/transfers'
import { CAPTURE_GAP, MOON, MOON_R, craftLeg, releasePoint, rideLeg } from './ridePaths'

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('ride and transfer paths', () => {
  for (const r of rides)
    for (const t of transfers)
      it(`${r.id} + ${t.id}: starts where the ride lets go and ends at the capture point, outside the Moon`, () => {
        const leg = craftLeg(r.id, t.id)
        expect(dist(leg[0], releasePoint(r.id))).toBeLessThan(0.05)
        const end = leg[leg.length - 1]
        expect(dist(end, MOON)).toBeGreaterThan(MOON_R)
        expect(dist(end, MOON)).toBeLessThanOrEqual(CAPTURE_GAP + 1e-9)
        for (const p of leg) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
      })

  it('the GTO ride stays near Earth; the commercial lander flies close to the Moon', () => {
    const gto = rideLeg('ride-gto')
    expect(Math.max(...gto.map((p) => p[0]))).toBeLessThan(0)
    expect(dist(releasePoint('ride-commercial'), MOON)).toBeLessThan(dist(releasePoint('ride-lunar'), MOON))
  })
})
