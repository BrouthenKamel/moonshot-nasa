import type { AudioId } from '../../assets/manifest'
import type { RocketConfig } from '../../data/rocket'
import type { RocketClass } from './types'

/**
 * The campaign liftoff show as a broadcast director would cut it: fixed shots on one clock,
 * cuts rather than drifts, a sound accent on every cut. Pure (no React, no three.js objects),
 * so timings, beats and camera poses are unit tested.
 *
 * `t` is show time in seconds from the first frame. Mission time is `T = t - plan.liftoffAt`.
 * World units are metres; the pad is at the origin and the rocket's engine bells sit on the
 * launch mount at MOUNT_Y.
 */

export type Vec3 = [number, number, number]

/** Which set a shot is filmed on: the pad at dusk, or high in the sky / in space (rocket at the origin) */
export type LiftoffSet = 'pad' | 'high'

export type LiftoffShotId = 'pad' | 'ignition' | 'liftoff' | 'tracking' | 'lost' | 'boosters' | 'staging' | 'space'

export interface LiftoffShot {
  id: LiftoffShotId
  set: LiftoffSet
  from: number
  to: number
  /** The one sentence under the picture */
  caption: string
  /** Played on the cut into this shot */
  cutSound: AudioId
}

/** Everything that differs between the four rocket sizes */
export interface RocketProfile {
  rocket: RocketClass
  config: RocketConfig
  /** Whole-stack scale on top of the kit's body radius */
  scale: number
  /** Engine flames lit at liftoff (core) */
  engines: number
  boosters: number
  /** Camera shake strength, 0..1 */
  shake: number
  /** Ground cloud: sprites and how far it spreads (m) */
  smokePuffs: number
  smokeRadius: number
  /** Liftoff acceleration (m/s²): the bigger the rocket, the slower it clears the tower */
  accel: number
  /** How many times the engine roar is layered */
  roarLayers: number
  /** One-line description for the pad shot */
  noun: string
}

export const PROFILES: Record<RocketClass, RocketProfile> = {
  small: {
    rocket: 'small',
    config: { engine: 'engine_single', stage1: 'stage1_short', stage2: 'none', nose: 'nose_fairing', fins: 'none', boosters: 'none' },
    scale: 0.9,
    engines: 1,
    boosters: 0,
    shake: 0.22,
    smokePuffs: 55,
    smokeRadius: 45,
    accel: 12,
    roarLayers: 1,
    noun: 'A small launcher',
  },
  medium: {
    rocket: 'medium',
    config: { engine: 'engine_cluster9', stage1: 'stage1_long', stage2: 'stage2_short', nose: 'nose_fairing', fins: 'none', boosters: 'none' },
    scale: 1,
    engines: 9,
    boosters: 0,
    shake: 0.45,
    smokePuffs: 85,
    smokeRadius: 75,
    accel: 8,
    roarLayers: 2,
    noun: 'A nine-engine, two-stage rocket',
  },
  heavy: {
    rocket: 'heavy',
    config: { engine: 'engine_cluster9', stage1: 'stage1_long', stage2: 'stage2_long', nose: 'nose_fairing', fins: 'none', boosters: 'boosters_2_heavy' },
    scale: 1.08,
    engines: 9,
    boosters: 2,
    shake: 0.7,
    smokePuffs: 120,
    smokeRadius: 110,
    accel: 6.2,
    roarLayers: 2,
    noun: 'A heavy-lift rocket with two boosters',
  },
  super: {
    rocket: 'super',
    config: { engine: 'engine_cluster9', stage1: 'stage1_long', stage2: 'stage2_long', nose: 'nose_capsule', fins: 'none', boosters: 'boosters_4' },
    scale: 1.35,
    engines: 9,
    boosters: 4,
    shake: 1,
    smokePuffs: 160,
    smokeRadius: 150,
    accel: 4.6,
    roarLayers: 3,
    noun: 'A super-heavy rocket with four boosters',
  },
}

/** Shot lengths in seconds, per size, before reduced motion trims them */
const LENGTHS: Record<RocketClass, Partial<Record<LiftoffShotId, number>>> = {
  small: { pad: 3.5, ignition: 2.5, liftoff: 3.5, tracking: 3.5, space: 3 },
  medium: { pad: 3.5, ignition: 2.5, liftoff: 4, tracking: 3.5, staging: 3, space: 3 },
  heavy: { pad: 3.5, ignition: 2.5, liftoff: 4.5, tracking: 3.5, boosters: 3, staging: 2.5, space: 2.5 },
  super: { pad: 4, ignition: 3, liftoff: 5.5, tracking: 3.5, boosters: 3, staging: 2.5, space: 2.5 },
}

const ORDER: LiftoffShotId[] = ['pad', 'ignition', 'liftoff', 'tracking', 'boosters', 'staging', 'space']

const SET: Record<LiftoffShotId, LiftoffSet> = {
  pad: 'pad',
  ignition: 'pad',
  liftoff: 'pad',
  tracking: 'pad',
  lost: 'pad',
  boosters: 'high',
  staging: 'high',
  space: 'high',
}

const CUT_SOUND: Record<LiftoffShotId, AudioId> = {
  pad: 'sfx.static',
  ignition: 'sfx.snap',
  liftoff: 'sfx.whoosh',
  tracking: 'sfx.snap',
  lost: 'sfx.alarm',
  boosters: 'sfx.whoosh',
  staging: 'sfx.snap',
  space: 'sfx.whoosh',
}

function captionFor(id: LiftoffShotId, p: RocketProfile): string {
  switch (id) {
    case 'pad':
      return `${p.noun} on the pad at dusk, venting cold vapour.`
    case 'ignition':
      return p.engines === 1 ? 'Engine start.' : `All ${p.engines} engines light.`
    case 'liftoff':
      return p.boosters ? 'Liftoff. The boosters roar as it clears the tower.' : 'Liftoff. Clearing the tower.'
    case 'tracking':
      return 'Tracking camera, three kilometres downrange.'
    case 'lost':
      return 'Vehicle lost during ascent.'
    case 'boosters':
      return p.boosters === 4 ? 'Four boosters burn out and fall away.' : 'Both boosters burn out and fall away.'
    case 'staging':
      return 'Main engines off. Stage separation; the upper stage lights.'
    case 'space':
      return p.config.stage2 === 'none' ? 'Above the atmosphere and still climbing.' : 'The upper stage burns on, above the atmosphere.'
  }
}

export interface LiftoffPlan {
  profile: RocketProfile
  shots: LiftoffShot[]
  /** Show time of T-0 */
  liftoffAt: number
  /** Show time the engines light */
  ignitionAt: number
  /** Show time the vehicle is lost, or null */
  explodeAt: number | null
  /** Show time of booster separation / stage separation (if those shots exist) */
  boosterSepAt: number | null
  stageSepAt: number | null
  duration: number
  reduced: boolean
}

/** After the failure the show holds this long before it ends */
export const LOST_HOLD_S = 3
/** How far into the tracking shot the vehicle fails */
export const FAIL_INTO_TRACKING_S = 1.8
/** Shots after liftoff are trimmed to this share under reduced motion */
export const REDUCED_SHARE = 0.65

export function liftoffPlan(rocket: RocketClass, opts: { fails?: boolean; reduced?: boolean } = {}): LiftoffPlan {
  const profile = PROFILES[rocket]
  const lengths = LENGTHS[rocket]
  const reduced = !!opts.reduced
  const shots: LiftoffShot[] = []
  let t = 0
  let explodeAt: number | null = null
  for (const id of ORDER) {
    const base = lengths[id]
    if (base === undefined) continue
    // The countdown before liftoff keeps its length so the countdown voice lands; the rest is trimmed
    const len = reduced && id !== 'pad' && id !== 'ignition' ? base * REDUCED_SHARE : base
    if (opts.fails && id === 'tracking') {
      const into = Math.min(len, reduced ? FAIL_INTO_TRACKING_S * REDUCED_SHARE : FAIL_INTO_TRACKING_S)
      shots.push({ id, set: SET[id], from: t, to: t + into, caption: captionFor(id, profile), cutSound: CUT_SOUND[id] })
      explodeAt = t + into
      shots.push({ id: 'lost', set: SET.lost, from: explodeAt, to: explodeAt + LOST_HOLD_S, caption: captionFor('lost', profile), cutSound: CUT_SOUND.lost })
      t = explodeAt + LOST_HOLD_S
      break
    }
    shots.push({ id, set: SET[id], from: t, to: t + len, caption: captionFor(id, profile), cutSound: CUT_SOUND[id] })
    t += len
  }
  const ign = shots.find((s) => s.id === 'ignition')!
  const boosters = shots.find((s) => s.id === 'boosters')
  const staging = shots.find((s) => s.id === 'staging')
  return {
    profile,
    shots,
    ignitionAt: ign.from + 0.35,
    liftoffAt: ign.to,
    explodeAt,
    boosterSepAt: boosters ? boosters.from + (boosters.to - boosters.from) * 0.3 : null,
    stageSepAt: staging ? staging.from + (staging.to - staging.from) * 0.25 : null,
    duration: t,
    reduced,
  }
}

export function shotAt(plan: LiftoffPlan, t: number): LiftoffShot {
  for (const s of plan.shots) if (t < s.to) return s
  return plan.shots[plan.shots.length - 1]
}

/** Mission clock for the caption kicker: "T-00:05", "T+00:12" */
export function missionClock(plan: LiftoffPlan, t: number): string {
  const T = t - plan.liftoffAt
  const s = T < 0 ? Math.ceil(-T) : Math.floor(T)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${T < 0 ? 'T-' : 'T+'}${mm}:${ss}`
}

/* ---------------- beats: sounds that are not cuts ---------------- */

export interface LiftoffBeat {
  at: number
  sound?: AudioId
  voice?: AudioId
}

/** The countdown voice ("Five ... Ignition") runs about 6.3 s; it should end at liftoff */
const COUNTDOWN_VOICE_S = 6

export function liftoffBeats(plan: LiftoffPlan): LiftoffBeat[] {
  const beats: LiftoffBeat[] = [{ at: Math.max(0.1, plan.liftoffAt - COUNTDOWN_VOICE_S), voice: 'voice.countdown' }]
  beats.push({ at: plan.ignitionAt, sound: 'sfx.ignition' })
  // The roar: a bigger rocket layers more burn loops
  for (let i = 0; i < plan.profile.roarLayers; i++) beats.push({ at: plan.liftoffAt + i * 0.45, sound: i === 0 ? 'sfx.burn' : i === 1 ? 'sfx.ignition' : 'sfx.burn' })
  if (plan.explodeAt !== null) beats.push({ at: plan.explodeAt + 0.05, sound: 'sfx.burn' }, { at: plan.explodeAt + 0.4, sound: 'sfx.static' })
  if (plan.boosterSepAt !== null) beats.push({ at: plan.boosterSepAt, sound: 'sfx.snap' })
  if (plan.stageSepAt !== null) beats.push({ at: plan.stageSepAt, sound: 'sfx.snap' }, { at: plan.stageSepAt + 0.7, sound: 'sfx.go' })
  return beats.sort((a, b) => a.at - b.at)
}

/** Beats with prev < at <= t */
export function beatsBetween(beats: LiftoffBeat[], prev: number, t: number): LiftoffBeat[] {
  return beats.filter((b) => b.at > prev && b.at <= t)
}

/* ---------------- the flight on the pad set ---------------- */

/** Top of the launch mount: the engine bells sit here */
export const MOUNT_Y = 7
/** The launch tower stands beside the rocket on +x */
export const TOWER = { x: 21, z: -3, heightM: 72 }

/** Height of the rocket's engine bells above the mount, at show time t */
export function climb(plan: LiftoffPlan, t: number): number {
  const s = t - plan.liftoffAt
  if (s <= 0) return 0
  const a = plan.profile.accel
  // slow off the pad, then faster and faster
  return 0.5 * a * s * s + 0.03 * a * s * s * s
}

/** World position of the engine bells (pitching gently downrange, -x, away from the tower) */
export function rocketBase(plan: LiftoffPlan, t: number): Vec3 {
  const h = climb(plan, t)
  const drift = h > 60 ? -0.06 * (h - 60) : 0
  return [drift, MOUNT_Y + h, 0]
}

/** Pitch of the rocket (radians, about z): leans downrange after it clears the tower */
export function rocketPitch(plan: LiftoffPlan, t: number): number {
  const h = climb(plan, t)
  return h > 60 ? Math.min(0.09, (h - 60) * 0.0004) : 0
}

/** Sky darkness for the pad set: 0 = orange dusk, 1 = deep blue, rising through the tracking shot */
export function skyDark(plan: LiftoffPlan, t: number): number {
  const tr = plan.shots.find((s) => s.id === 'tracking')
  if (!tr) return 0
  const k = (t - tr.from) / Math.max(0.1, tr.to - tr.from)
  return Math.min(1, Math.max(0, k))
}

/** Engine power 0..1: a flicker at ignition, full at liftoff, off for the core at staging */
export function enginePower(plan: LiftoffPlan, t: number): number {
  if (t < plan.ignitionAt) return 0
  if (plan.explodeAt !== null && t >= plan.explodeAt) return 0
  if (t < plan.liftoffAt) return 0.35 + 0.65 * ((t - plan.ignitionAt) / Math.max(0.1, plan.liftoffAt - plan.ignitionAt))
  return 1
}

/* ---------------- camera ---------------- */

export interface LiftoffPose {
  set: LiftoffSet
  pos: Vec3
  look: Vec3
  fov: number
  /** Shake 0..1 before the size's strength is applied */
  shake: number
  /** The look target trails on a spring (long-lens follow) */
  springLook: boolean
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => x * x * (3 - 2 * x)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/**
 * The camera for show time t. `H` is the stacked rocket's height and `r` its body radius
 * (both metres); `upperH` is the height of the upper stage + nose.
 */
export function liftoffPose(plan: LiftoffPlan, t: number, dims: { H: number; r: number; upperH: number }): LiftoffPose {
  const shot = shotAt(plan, t)
  const k = clamp01((t - shot.from) / Math.max(0.01, shot.to - shot.from))
  const { H, r, upperH } = dims
  // after a failure the camera holds on where the vehicle was lost
  const base = rocketBase(plan, plan.explodeAt === null ? t : Math.min(t, plan.explodeAt))
  switch (shot.id) {
    case 'pad':
      // The same wide frame for every size, so the tower shows how big the rocket is
      return { set: 'pad', pos: [lerp(-74, -70, k), 9, lerp(168, 160, k)], look: [6, 34, 0], fov: 34, shake: 0, springLook: false }
    case 'ignition': {
      // Low beside the engines, looking up the side of the stack
      const d = Math.max(9, r * 7)
      return {
        set: 'pad',
        pos: [-d * 0.18, MOUNT_Y + 2.6, d],
        look: [0, MOUNT_Y + r * 0.6, 0],
        fov: 48,
        shake: smooth(k),
        springLook: false,
      }
    }
    case 'liftoff': {
      // From the ground beyond the tower, tilting up with the rocket
      // the frame keeps the pad and the cloud in view until the nose nears the top edge
      const pos: Vec3 = [-80, 2.5, 150]
      const fov = 38
      const dist = Math.hypot(pos[0], pos[2])
      const halfH = dist * Math.tan(((fov / 2) * Math.PI) / 180)
      const nose = base[1] + H
      const lookY = Math.max(halfH * 0.5, nose - halfH * 0.72)
      return { set: 'pad', pos, look: [base[0] * 0.5 + 6, lookY, 0], fov, shake: 1 - 0.5 * k, springLook: false }
    }
    case 'tracking':
    case 'lost': {
      const mid: Vec3 = [base[0], base[1] + H * 0.5, base[2]]
      return { set: 'pad', pos: [-1500, 6, 2600], look: mid, fov: lerp(7.5, 6, k), shake: 0, springLook: true }
    }
    case 'boosters':
      // beside and a little above, the whole stack in frame, the boosters tipping out toward us
      return { set: 'high', pos: [H * 1.1, H * 0.6, H * 1.6], look: [0, H * 0.46, 0], fov: 42, shake: 0.12, springLook: false }
    case 'staging': {
      // from below the separation plane, looking up past the falling core at the upper stage
      const sep = H - upperH
      return { set: 'high', pos: [-H * 0.55, sep - H * 0.3, H * 0.8], look: [0, sep + upperH * 0.15 - k * H * 0.12, 0], fov: 40, shake: 0.08, springLook: false }
    }
    case 'space': {
      const u = Math.max(upperH, H * 0.4)
      const whole = upperH >= H
      return { set: 'high', pos: [u * 1.9, u * 1.25, u * 2.4], look: [0, u * (whole ? 0.5 : 0.35), 0], fov: 40, shake: 0, springLook: false }
    }
  }
}
