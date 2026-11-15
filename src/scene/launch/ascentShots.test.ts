import { describe, expect, it } from 'vitest'
import { isContiguous } from '../../world/camera/rig'
import {
  ASCENT_BEATS,
  ASCENT_DURATION_S,
  ASCENT_SHOTS,
  T_END,
  T_START,
  ascentPose,
  beatsBetween,
  canSkip,
  countdownText,
  craftOffset,
  fairingTime,
  rocketAltitude,
  rocketBase,
  shotAt,
  stageOneOffset,
  thirdOffset,
  type Vec3,
} from './ascentShots'

const H = 52
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const within20 = (actual: number, spec: number) => Math.abs(actual - spec) <= Math.abs(spec) * 0.2

describe('the shot table (vision §3.3 B)', () => {
  it('has the seven shots at the tabled times, back to back', () => {
    expect(ASCENT_SHOTS.map((s) => [s.n, s.from])).toEqual([
      [1, -10],
      [2, -3],
      [3, 2],
      [4, 8],
      [5, 20],
      [6, 26],
      [7, 34],
    ])
    expect(isContiguous(ASCENT_SHOTS)).toBe(true)
    expect(ASCENT_SHOTS[0].from).toBe(T_START)
    expect(ASCENT_SHOTS[6].to).toBe(T_END)
    expect(ASCENT_DURATION_S).toBe(52)
  })

  it('gives every shot a sound accent and a caption', () => {
    for (const s of ASCENT_SHOTS) {
      expect(s.cutSound).toBeTruthy()
      expect(s.caption.length).toBeGreaterThan(5)
    }
  })

  it('finds the shot for a moment', () => {
    expect(shotAt(-10)?.n).toBe(1)
    expect(shotAt(0)?.n).toBe(2)
    expect(shotAt(25.9)?.n).toBe(5)
    expect(shotAt(41.9)?.n).toBe(7)
    expect(shotAt(T_END)).toBeNull()
  })
})

describe('camera rigs, within 20% of the table', () => {
  it('shot 1: static, 600 m away, 1.5 m up, FOV 28°, rocket on the left third', () => {
    const a = ascentPose(-9, H)
    const b = ascentPose(-3.5, H)
    expect(a).toEqual(b)
    expect(within20(Math.hypot(a.pos[0], a.pos[2]), 600)).toBe(true)
    expect(within20(a.pos[1], 1.5)).toBe(true)
    expect(a.fov).toBe(28)
    // Looking to the right of the rocket puts it left of centre, a third of the half-width
    expect(a.look[0]).toBeCloseTo(600 * thirdOffset(28, 16 / 9))
    expect(a.shake).toBe(0)
  })

  it('shot 2: 12 m from the base, looking up 20°, shake ramping', () => {
    const p = ascentPose(-2, H)
    expect(within20(Math.hypot(p.pos[0], p.pos[2]), 12)).toBe(true)
    const horiz = Math.hypot(p.look[0] - p.pos[0], p.look[2] - p.pos[2])
    const pitch = (Math.atan2(p.look[1] - p.pos[1], horiz) * 180) / Math.PI
    expect(within20(pitch, 20)).toBe(true)
    expect(ascentPose(-2.9, H).shake).toBeLessThan(ascentPose(0, H).shake)
    expect(ascentPose(0, H).shake).toBeLessThan(ascentPose(1.9, H).shake)
  })

  it('shot 3: 80 m away, FOV 35°, tilting up to follow the nose', () => {
    const a = ascentPose(2.5, H)
    const b = ascentPose(7.5, H)
    expect(within20(Math.hypot(a.pos[0], a.pos[2]), 80)).toBe(true)
    expect(a.fov).toBe(35)
    expect(b.look[1]).toBeGreaterThan(a.look[1])
    expect(b.look[1]).toBeCloseTo(rocketBase(7.5)[1] + H)
  })

  it('shot 4: 3 km away, FOV 4° closing to 2°, spring follow', () => {
    const a = ascentPose(8, H)
    const b = ascentPose(19.99, H)
    expect(within20(Math.hypot(a.pos[0], a.pos[2]), 3000)).toBe(true)
    expect(a.fov).toBeCloseTo(4)
    expect(b.fov).toBeCloseTo(2, 1)
    expect(a.springLook).toBe(true)
    // The rocket stays in a 2° frame: the look goal is within a few metres of its middle
    const mid: Vec3 = [rocketBase(15)[0], rocketBase(15)[1] + H / 2, 0]
    expect(dist(ascentPose(15, H).look, mid)).toBeLessThan(2)
  })

  it('shot 5 rides stage 2 looking aft; shots 6 and 7 are inside the fairing', () => {
    const s = ascentPose(22, H)
    expect(s.set).toBe('staging')
    expect(s.look[1]).toBeLessThan(s.pos[1])
    expect(ascentPose(28, H).set).toBe('fairing')
    expect(ascentPose(38, H).set).toBe('fairing')
  })

  it('shot 7 circles the craft at a steady distance', () => {
    for (const T of [34, 37, 41]) {
      const p = ascentPose(T, H)
      expect(dist(p.pos, p.look)).toBeGreaterThan(0.7)
      expect(dist(p.pos, p.look)).toBeLessThan(1.1)
      expect(p.look).toEqual(craftOffset(fairingTime(T)))
    }
    expect(ascentPose(34, H).pos).not.toEqual(ascentPose(40, H).pos)
  })

  it('cuts between shots: the camera jumps, it does not drift', () => {
    for (let i = 1; i < ASCENT_SHOTS.length - 1; i++) {
      const t = ASCENT_SHOTS[i].from
      const before = ascentPose(t - 1e-3, H)
      const after = ascentPose(t, H)
      const jumped = before.set !== after.set || dist(before.pos, after.pos) > 1 || Math.abs(before.fov - after.fov) > 3
      expect(jumped, `cut into shot ${ASCENT_SHOTS[i].n}`).toBe(true)
    }
  })

  it('past the end it holds the last shot', () => {
    expect(ascentPose(60, H).set).toBe('fairing')
  })
})

describe('beats', () => {
  it('fires liftoff text and sound only at T-0', () => {
    const lift = ASCENT_BEATS.filter((b) => b.voice === 'voice.liftoff' || b.sound === 'sfx.ignition')
    expect(lift.map((b) => b.at)).toEqual([0])
    expect(beatsBetween(-0.1, -0.01).some((b) => b.kind === 'liftoff')).toBe(false)
    expect(beatsBetween(-0.01, 0).map((b) => b.kind)).toEqual(['liftoff'])
    expect(countdownText(-6)).toBe('')
    expect(countdownText(-4.5)).toBe('5')
    expect(countdownText(-0.2)).toBe('1')
    expect(countdownText(-0.0001)).toBe('1')
    expect(countdownText(0)).toBe('LIFTOFF')
    expect(countdownText(3)).toBe('')
  })

  it('fires each beat once across any frame split', () => {
    const frames = [-11, -5, -1, 0.5, 21, 30, 36, 45]
    const fired = frames.slice(1).flatMap((t, i) => beatsBetween(frames[i], t))
    expect(fired.map((b) => b.kind)).toEqual(ASCENT_BEATS.map((b) => b.kind))
  })

  it('springs the craft out, unfolds the wings and says hello in shots 6 and 7', () => {
    const at = (k: string) => ASCENT_BEATS.find((b) => b.kind === k)!.at
    expect(shotAt(at('spring-out'))?.n).toBe(6)
    expect(shotAt(at('wings'))?.n).toBe(7)
    expect(shotAt(at('hello'))?.n).toBe(7)
    expect(shotAt(at('staging'))?.n).toBe(5)
  })
})

describe('the flight', () => {
  it('stands on the mount until T-0, then climbs faster and faster', () => {
    expect(rocketAltitude(-5)).toBe(rocketAltitude(0))
    expect(rocketAltitude(2)).toBeGreaterThan(rocketAltitude(0))
    expect(rocketAltitude(20) - rocketAltitude(19)).toBeGreaterThan(rocketAltitude(2) - rocketAltitude(1))
    expect(rocketBase(3)[0]).toBe(0)
    expect(rocketBase(18)[0]).toBeGreaterThan(0)
  })

  it('stage 1 stays attached until separation, then falls away', () => {
    expect(stageOneOffset(20.5).y).toBe(0)
    expect(stageOneOffset(23).y).toBeLessThan(-3)
    expect(stageOneOffset(25).y).toBeLessThan(stageOneOffset(23).y)
  })

  it('the craft stays in its deployer until it springs out', () => {
    expect(craftOffset(fairingTime(27))).toEqual(craftOffset(fairingTime(28)))
    expect(craftOffset(fairingTime(33))[2]).toBeGreaterThan(craftOffset(fairingTime(29))[2])
  })
})

describe('skip', () => {
  it('is offered only after the first full viewing, or under reduced motion', () => {
    expect(canSkip(0, false)).toBe(false)
    expect(canSkip(1, false)).toBe(true)
    expect(canSkip(0, true)).toBe(true)
  })
})
