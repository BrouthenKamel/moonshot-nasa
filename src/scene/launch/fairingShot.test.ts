import { describe, expect, it } from 'vitest'
import { poseAt } from '../interaction/InsideCam'
import { FAIRING_RADIUS, fairingHalfPose, fairingKeys, SEP_START, separation } from './fairingShot'

// Integration review, 15 Nov: the fairing ride's first shots, Max-Q and separation were near-white frames
describe('fairing ride camera', () => {
  const keys = fairingKeys(1)
  const radius = (t: number) => {
    const { pos } = poseAt(keys, t)
    return Math.hypot(pos.x, pos.z)
  }

  it('stays inside the fairing shell until the halves let go, so no wall fills the frame', () => {
    for (let t = 0; t <= SEP_START; t += 0.05) expect(radius(t)).toBeLessThan(FAIRING_RADIUS)
  })

  it('only leaves the shell radius once the halves have swung clear of it', () => {
    for (let t = SEP_START; t <= 11; t += 0.05) {
      if (radius(t) < FAIRING_RADIUS) continue
      const half = fairingHalfPose(separation(t), 1).position
      // The half's near edge (its own radius in from its centre) is beyond the camera
      expect(Math.hypot(half[0], half[2]) - FAIRING_RADIUS).toBeGreaterThan(radius(t))
    }
  })

  it('separates the halves well beyond the shell, one to each side', () => {
    const l = fairingHalfPose(1, -1).position
    const r = fairingHalfPose(1, 1).position
    expect(l[0]).toBeLessThan(-2)
    expect(r[0]).toBeGreaterThan(2)
    expect(separation(SEP_START - 1)).toBe(0)
    expect(separation(20)).toBe(1)
  })
})
