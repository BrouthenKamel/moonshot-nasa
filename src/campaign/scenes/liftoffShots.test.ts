import { describe, expect, it } from 'vitest'
import { getRocketPart, rocketSlots } from '../../data/rocket'
import { beatsBetween, climb, liftoffBeats, liftoffPlan, liftoffPose, missionClock, PROFILES, shotAt, LOST_HOLD_S } from './liftoffShots'
import type { RocketClass } from './types'

const SIZES: RocketClass[] = ['small', 'medium', 'heavy', 'super']

describe('liftoff shot table', () => {
  it('every profile uses valid kit parts', () => {
    for (const size of SIZES) for (const s of rocketSlots) expect(getRocketPart(s.id, PROFILES[size].config[s.id]), `${size} ${s.id}`).toBeDefined()
  })

  it('each size runs longer than the one below it, within 14–24 s', () => {
    const d = SIZES.map((s) => liftoffPlan(s).duration)
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1])
    expect(d[0]).toBeGreaterThanOrEqual(14)
    expect(d[3]).toBeLessThanOrEqual(24)
  })

  it('shot lists are contiguous, start at 0 and end at the duration', () => {
    for (const size of SIZES)
      for (const fails of [false, true])
        for (const reduced of [false, true]) {
          const p = liftoffPlan(size, { fails, reduced })
          expect(p.shots[0].from).toBe(0)
          for (let i = 1; i < p.shots.length; i++) expect(p.shots[i].from).toBeCloseTo(p.shots[i - 1].to, 9)
          expect(p.shots[p.shots.length - 1].to).toBeCloseTo(p.duration, 9)
        }
  })

  it('bigger rockets get more shots: small skips staging, heavy and super show their boosters', () => {
    const ids = (s: RocketClass) => liftoffPlan(s).shots.map((x) => x.id)
    expect(ids('small')).not.toContain('staging')
    expect(ids('small')).not.toContain('boosters')
    expect(ids('medium')).toContain('staging')
    expect(ids('medium')).not.toContain('boosters')
    expect(ids('heavy')).toContain('boosters')
    expect(ids('super')).toContain('boosters')
    expect(ids('small').length).toBeLessThan(ids('medium').length)
    expect(ids('medium').length).toBeLessThan(ids('heavy').length)
  })

  it('a failure ends during tracking: lost shot, no staging, ends about 3 s after the explosion', () => {
    for (const size of SIZES) {
      const p = liftoffPlan(size, { fails: true })
      const ids = p.shots.map((s) => s.id)
      expect(ids.slice(-2)).toEqual(['tracking', 'lost'])
      expect(ids).not.toContain('staging')
      expect(ids).not.toContain('space')
      expect(p.explodeAt).not.toBeNull()
      expect(p.duration - p.explodeAt!).toBeCloseTo(LOST_HOLD_S)
      expect(p.duration).toBeLessThan(liftoffPlan(size).duration)
      expect(p.shots.at(-1)!.caption).toBe('Vehicle lost during ascent.')
    }
  })

  it('reduced motion is shorter but keeps the countdown', () => {
    for (const size of SIZES) {
      const a = liftoffPlan(size)
      const b = liftoffPlan(size, { reduced: true })
      expect(b.duration).toBeLessThan(a.duration)
      expect(b.liftoffAt).toBe(a.liftoffAt)
    }
  })

  it('bigger rockets shake harder, smoke more and climb slower', () => {
    for (let i = 1; i < SIZES.length; i++) {
      const lo = PROFILES[SIZES[i - 1]]
      const hi = PROFILES[SIZES[i]]
      expect(hi.shake).toBeGreaterThan(lo.shake)
      expect(hi.smokeRadius).toBeGreaterThan(lo.smokeRadius)
      expect(hi.accel).toBeLessThan(lo.accel)
    }
  })

  it('the rocket stays on the mount until T-0, then climbs faster and faster', () => {
    const p = liftoffPlan('heavy')
    expect(climb(p, p.liftoffAt - 0.5)).toBe(0)
    const a = climb(p, p.liftoffAt + 1) - climb(p, p.liftoffAt)
    const b = climb(p, p.liftoffAt + 3) - climb(p, p.liftoffAt + 2)
    expect(b).toBeGreaterThan(a)
  })

  it('mission clock counts down to T-0 then up', () => {
    const p = liftoffPlan('medium')
    expect(missionClock(p, 0)).toBe('T-00:06')
    expect(missionClock(p, p.liftoffAt + 12.2)).toBe('T+00:12')
  })

  it('countdown voice fires once, near the start; every beat lies in the show', () => {
    for (const size of SIZES) {
      const p = liftoffPlan(size, { fails: size === 'heavy' })
      const beats = liftoffBeats(p)
      expect(beats.filter((b) => b.voice === 'voice.countdown')).toHaveLength(1)
      for (const b of beats) expect(b.at).toBeLessThanOrEqual(p.duration)
      expect(beatsBetween(beats, -1, p.duration)).toHaveLength(beats.length)
    }
  })

  it('poses are finite and on the right set for every frame', () => {
    for (const size of SIZES) {
      const p = liftoffPlan(size)
      for (let t = 0; t < p.duration; t += 0.25) {
        const pose = liftoffPose(p, t, { H: 40, r: 1.85, upperH: 15 })
        expect(pose.set).toBe(shotAt(p, t).set)
        for (const v of [...pose.pos, ...pose.look, pose.fov]) expect(Number.isFinite(v)).toBe(true)
      }
    }
  })
})

describe('failure camera', () => {
  it('holds on the point of loss after the explosion', () => {
    const p = liftoffPlan('medium', { fails: true })
    const dims = { H: 40, r: 1.85, upperH: 15 }
    const a = liftoffPose(p, p.explodeAt! + 0.1, dims)
    const b = liftoffPose(p, p.duration - 0.1, dims)
    expect(b.look).toEqual(a.look)
  })
})
