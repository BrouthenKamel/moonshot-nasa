import { describe, it, expect } from 'vitest'
import { KNOB_VALUES, FADER_VALUES, knobAngle, knobValueFromPoint, faderX, faderValueFromX, stepValue } from './controlMath'

describe('knob', () => {
  it('maps each position to its angle and back', () => {
    for (const v of KNOB_VALUES) {
      const a = knobAngle(v)
      expect(knobValueFromPoint(-Math.sin(a) * 0.3, -Math.cos(a) * 0.3)).toBe(v)
    }
  })
  it('starts at +60 degrees and turns 40 degrees a step', () => {
    expect(knobAngle(0)).toBeCloseTo((60 * Math.PI) / 180)
    expect(knobAngle(3)).toBeCloseTo((-60 * Math.PI) / 180)
  })
  it('clamps beyond the arc and ignores the centre', () => {
    const far = (deg: number) => {
      const a = (deg * Math.PI) / 180
      return knobValueFromPoint(-Math.sin(a) * 0.3, -Math.cos(a) * 0.3)
    }
    expect(far(120)).toBe(0)
    expect(far(-120)).toBe(3)
    expect(knobValueFromPoint(0.01, 0.01)).toBeNull()
  })
})

describe('fader', () => {
  const x0 = 1, x1 = 2
  it('snaps to the nearest position and clamps', () => {
    expect(faderValueFromX(x0 - 1, x0, x1)).toBe(0)
    expect(faderValueFromX(x1 + 1, x0, x1)).toBe(20)
    expect(faderValueFromX(1.5, x0, x1)).toBe(10)
    const step = (x1 - x0) / 4
    expect(faderValueFromX(x0 + step * 0.49, x0, x1)).toBe(0)
    expect(faderValueFromX(x0 + step * 0.51, x0, x1)).toBe(5)
  })
  it('round-trips every position', () => {
    for (const v of FADER_VALUES) expect(faderValueFromX(faderX(v, x0, x1), x0, x1)).toBe(v)
  })
})

describe('stepValue', () => {
  it('steps and clamps at both ends', () => {
    expect(stepValue(KNOB_VALUES, 1, 1)).toBe(2)
    expect(stepValue(KNOB_VALUES, 3, 1)).toBe(3)
    expect(stepValue(FADER_VALUES, 0, -1)).toBe(0)
    expect(stepValue(FADER_VALUES, 10, -1)).toBe(5)
  })
})
