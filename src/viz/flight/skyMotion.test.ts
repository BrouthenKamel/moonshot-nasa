import { describe, expect, it } from 'vitest'
import {
  EARTH,
  LUNAR_MONTH_DAYS,
  MOON_DISTANCE,
  PARKING_RADIUS,
  YEAR_DAYS,
  distance,
  earthSpin,
  moonPosition,
  planTransfer,
  sunAngle,
  transferPosition,
  transferProgress,
} from './skyMotion'

describe('the Earth-Moon system moves with the days', () => {
  it('the Moon goes round Earth once a month at a fixed distance', () => {
    for (const day of [0, 5, 13.7, 20, 100]) expect(distance(moonPosition(day), EARTH)).toBeCloseTo(MOON_DISTANCE, 6)
    const a = moonPosition(10)
    const b = moonPosition(10 + LUNAR_MONTH_DAYS)
    expect(distance(a, b)).toBeLessThan(1e-6)
    expect(distance(moonPosition(0), moonPosition(LUNAR_MONTH_DAYS / 2))).toBeCloseTo(2 * MOON_DISTANCE, 6)
  })

  it('Earth spins about once a day and the Sun turns once a year', () => {
    expect(earthSpin(1) / (2 * Math.PI)).toBeCloseTo(1.0027, 3)
    expect(Math.abs(sunAngle(YEAR_DAYS))).toBeCloseTo(2 * Math.PI, 6)
  })
})

describe('transfer orbit', () => {
  for (const [name, days] of [
    ['direct (5 days)', 5],
    ['low-energy (4 months)', 120],
    ['long low-energy (10 months)', 300],
  ] as const) {
    it(`${name}: leaves from the parking orbit and meets the Moon on the arrival day`, () => {
      const plan = planTransfer(200, 200 + days)
      expect(distance(transferPosition(plan, 0), EARTH)).toBeCloseTo(PARKING_RADIUS, 4)
      expect(distance(transferPosition(plan, 1), moonPosition(200 + days))).toBeLessThan(1e-6)
    })
  }

  it('moves continuously and faster near Earth than far out (Kepler)', () => {
    const plan = planTransfer(0, 120)
    let prev = transferPosition(plan, 0)
    let maxStep = 0
    const steps: number[] = []
    for (let i = 1; i <= 200; i++) {
      const p = transferPosition(plan, i / 200)
      const step = distance(prev, p)
      steps.push(step)
      maxStep = Math.max(maxStep, step)
      prev = p
    }
    // No jumps anywhere along the way
    expect(maxStep).toBeLessThan(plan.apogee * 0.2)
    // The first part (near Earth) covers more ground per day than the middle (far out)
    expect(steps[1]).toBeGreaterThan(steps[100])
  })

  it('a long transfer swings out beyond the Moon before falling back in', () => {
    const plan = planTransfer(0, 300)
    const furthest = Math.max(...Array.from({ length: 101 }, (_, i) => distance(transferPosition(plan, i / 100), EARTH)))
    expect(furthest).toBeGreaterThan(MOON_DISTANCE * 1.3)
  })

  it('progress follows the days and stays within 0..1', () => {
    const plan = planTransfer(100, 160)
    expect(transferProgress(plan, 90)).toBe(0)
    expect(transferProgress(plan, 130)).toBeCloseTo(0.5, 6)
    expect(transferProgress(plan, 999)).toBe(1)
  })
})
