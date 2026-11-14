/** Snapping maths for the console's test-time knob and reserve fader. */

export const KNOB_VALUES = [0, 1, 2, 3] as const
export const FADER_VALUES = [0, 5, 10, 15, 20] as const

const DEG = Math.PI / 180
const KNOB_START_DEG = 60
const KNOB_STEP_DEG = 40

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Rotation about the knob's up axis, in radians: 0 → +60°, each step −40°. */
export function knobAngle(value: number): number {
  return (KNOB_START_DEG - value * KNOB_STEP_DEG) * DEG
}

/**
 * Knob value under a point given as its offset from the knob centre in the
 * panel's plane (x right, z toward the player). null when too close to the centre to tell.
 */
export function knobValueFromPoint(dx: number, dz: number): number | null {
  if (Math.hypot(dx, dz) < 0.06) return null
  const deg = Math.atan2(-dx, -dz) / DEG
  return clamp(Math.round((KNOB_START_DEG - deg) / KNOB_STEP_DEG), KNOB_VALUES[0], KNOB_VALUES[KNOB_VALUES.length - 1])
}

const FADER_MAX = FADER_VALUES[FADER_VALUES.length - 1]
const FADER_STEPS = FADER_VALUES.length - 1

export function faderX(value: number, x0: number, x1: number): number {
  return x0 + (clamp(value, 0, FADER_MAX) / FADER_MAX) * (x1 - x0)
}

export function faderValueFromX(x: number, x0: number, x1: number): number {
  const i = Math.round(((x - x0) / (x1 - x0)) * FADER_STEPS)
  return FADER_VALUES[clamp(i, 0, FADER_STEPS)]
}

/** The next value in a list of positions, clamped at the ends. */
export function stepValue(values: readonly number[], current: number, dir: 1 | -1): number {
  let i = values.indexOf(current)
  if (i < 0) i = values.reduce((best, v, j) => (Math.abs(v - current) < Math.abs(values[best] - current) ? j : best), 0)
  return values[clamp(i + dir, 0, values.length - 1)]
}
