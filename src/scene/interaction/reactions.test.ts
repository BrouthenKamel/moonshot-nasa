import { describe, expect, it } from 'vitest'
import { brownout, holdProgress, ledBrightness, scaleNeedleAngle, scaleState, SCALE_SWEEP, springStep, storageFlow, sweptAngle, volumeRefusal } from './reactions'

describe('scale', () => {
  it('sweeps from the left stop with no mass to the red line at the limit', () => {
    expect(scaleNeedleAngle(0, 14)).toBeCloseTo(-SCALE_SWEEP / 2)
    expect(scaleNeedleAngle(14, 14)).toBeCloseTo(scaleState(14, 14).redLine)
  })
  it('moves right as mass goes in', () => {
    expect(scaleNeedleAngle(10, 14)).toBeGreaterThan(scaleNeedleAngle(8, 14))
  })
  it('pins past the end stop and shakes only over the limit', () => {
    expect(scaleNeedleAngle(100, 14)).toBeLessThanOrEqual(-SCALE_SWEEP / 2 + 1.04 * SCALE_SWEEP + 1e-9)
    expect(scaleState(13.9, 14)).toMatchObject({ over: false, shake: 0 })
    const over = scaleState(15, 14)
    expect(over.over).toBe(true)
    expect(over.shake).toBeGreaterThan(0)
  })
  it('spring settles on the target', () => {
    let v = 0
    let x = 0
    for (let i = 0; i < 300; i++) [x, v] = springStep(x, v, 1, 1 / 60)
    expect(x).toBeCloseTo(1, 2)
  })
})

describe('brownout', () => {
  it('is steady with a positive margin', () => {
    const s = brownout(5, 40)
    expect(s.steady).toBe(true)
    expect(ledBrightness(s, 1.23)).toBe(1)
  })
  it('flickers harder the deeper the deficit', () => {
    const a = brownout(-2, 30)
    const b = brownout(-15, 30)
    expect(a.steady).toBe(false)
    expect(b.flicker).toBeGreaterThan(a.flicker)
  })
})

describe('storage flow', () => {
  it('loses nothing when the downlink keeps up', () => {
    expect(storageFlow(100, 150, 500).spill).toBe(0)
  })
  it('once storage is full, spills everything the link cannot carry, every month', () => {
    const f = storageFlow(1000, 200, 300)
    expect(f.fill).toBe(1)
    expect(f.spill).toBeCloseTo(0.8)
    expect(f.lostPerMonth).toBeCloseTo(800)
  })
})

describe('volume, hold, key', () => {
  it('refuses a part bigger than the room left once the old part comes out', () => {
    expect(volumeRefusal(0.5, 1, 1.4)).toBeNull()
    expect(volumeRefusal(0.2, 1, 1.5)).toMatch(/0\.3 U short/)
  })
  it('fills the hold ring in 1.5 s', () => {
    expect(holdProgress(750)).toBeCloseTo(0.5)
    expect(holdProgress(4000)).toBe(1)
  })
  it('measures the swept angle across the -π/π seam', () => {
    expect(sweptAngle(0, 0, -1, 0.01, -1, -0.01)).toBeCloseTo(0.02, 2)
    expect(sweptAngle(0, 0, 1, 0, 0, 1)).toBeCloseTo(Math.PI / 2)
  })
})
