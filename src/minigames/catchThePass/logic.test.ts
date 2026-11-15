import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from '../../sim/budgets'
import { groundStations } from '../../data/ground'
import {
  PASS_S, buildResult, clampRing, countHours, dishTraits, linkQuality, maxHours, paintHour, passPosition,
  pointingError, project, reelFill, reelGain, ringWithHours, stepDish,
} from './logic'

const design = { ...createDefaultDesign(), radio: 'radio-xband' }

describe('pass arc', () => {
  it('rises and sets across the sky', () => {
    expect(passPosition(0).x).toBeLessThan(-60)
    expect(passPosition(PASS_S).x).toBeGreaterThan(60)
    expect(passPosition(PASS_S / 2).y).toBeGreaterThan(passPosition(0).y + 30)
  })
})

describe('link quality', () => {
  it('is 1 on target and 0 outside the beam', () => {
    expect(linkQuality(0, 5)).toBe(1)
    expect(linkQuality(5, 5)).toBe(0)
    expect(linkQuality(9, 5)).toBe(0)
    expect(linkQuality(2.5, 5)).toBeCloseTo(0.75)
  })
  it('narrower beam for the bigger dish', () => {
    expect(dishTraits('ground-dsn').beamDeg).toBeLessThan(dishTraits('ground-small').beamDeg)
  })
  it('error is the distance', () => {
    expect(pointingError({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('motor assist', () => {
  it('big dish stays closer to the craft with no hand input', () => {
    const run = (id: string) => {
      let dish = { x: -68, y: 16 }
      let err = 0
      for (let t = 0; t < PASS_S; t += 0.05) {
        const b = passPosition(t)
        dish = stepDish(dish, { aim: null, key: { x: 0, y: 0 } }, b, { x: 6.8, y: 0 }, dishTraits(id), 0.05)
        err += pointingError(dish, b)
      }
      return err
    }
    expect(run('ground-dsn')).toBeLessThan(run('ground-small'))
  })
})

describe('reel', () => {
  it('fills faster for a faster link and better pointing', () => {
    expect(reelGain(128, 1, 1)).toBeGreaterThan(reelGain(2, 1, 1))
    expect(reelGain(64, 1, 1)).toBeGreaterThan(reelGain(64, 0.2, 1))
    expect(reelFill(0)).toBe(0)
    expect(reelFill(1e12)).toBe(1)
  })
})

describe('booking', () => {
  it('stops at the station cap and erases freely', () => {
    const dsn = groundStations.find((g) => g.id === 'ground-dsn')!
    let ring = ringWithHours(0)
    ring = paintHour(ring, 3, true, maxHours(dsn))
    const refused = paintHour(ring, 4, true, maxHours(dsn))
    expect(refused).toBe(ring)
    expect(countHours(paintHour(ring, 3, false, 1))).toBe(0)
  })
  it('clamps a ring on a station switch', () => {
    expect(countHours(clampRing(ringWithHours(6), 2))).toBe(2)
  })
  it('more hours bring home more, and cost more', () => {
    const a = project(design, 'engineer', 'ground-small', 2)
    const b = project(design, 'engineer', 'ground-small', 6)
    expect(b.mbPerDay).toBeGreaterThanOrEqual(a.mbPerDay)
    expect(b.coinsPerTurn).toBeGreaterThan(a.coinsPerTurn)
  })
})

describe('result', () => {
  it('writes groundStation and clamped contactHours with insights', () => {
    const r = buildResult({
      design, difficulty: 'engineer', stationId: 'ground-dsn', ring: ringWithHours(5), score: { onTarget: 15, accuracy: 0.8 }, durationS: 61.2,
    })
    expect(r.patch).toEqual({ groundStation: 'ground-dsn', contactHours: 1 })
    expect(r.insights.map((i) => i.id)).toEqual(['pass-downlink', 'pass-pointing'])
    expect(r.insights[0].metric.unit).toBe('MB/day')
    expect(r.insights[1].metric.value).toBe(80)
  })
})
