import type { AudioId } from '../../assets/manifest'
import { activeShot, type TimedShot } from '../../world/camera/rig'

/**
 * The ascent as a broadcast director would cut it (vision §3.3 B): seven fixed shots on one clock,
 * cuts rather than drifts, a sound accent on every cut. Pure: no React, no three.js objects, so the
 * timing, the beats and every camera pose are unit tested.
 *
 * Time `T` is mission time in seconds: T-0 is liftoff. The sequence clock (seconds since the
 * sequence started) is `T - T_START`.
 */

export type Vec3 = [number, number, number]

/** Which scene a shot is filmed on: the pad (metres, pad at the origin), on stage 2, inside the fairing */
export type AscentSet = 'pad' | 'staging' | 'fairing'

export type AscentShotId = 'establish' | 'ignition' | 'tower' | 'tracking' | 'staging' | 'fairing' | 'deploy'

export interface AscentShot extends TimedShot<AscentShotId> {
  n: number
  set: AscentSet
  /** The one line under the picture */
  caption: string
  /** The sound accent played on the cut into this shot */
  cutSound: AudioId
}

export const T_START = -10
export const T_END = 42
/** Seconds from the first frame to the cut to the flight view */
export const ASCENT_DURATION_S = T_END - T_START

/** The seven shots of §3.3 B, in order; each runs from `from` to the next shot's `from` */
export const ASCENT_SHOTS: readonly AscentShot[] = [
  { n: 1, id: 'establish', from: -10, to: -3, set: 'pad', cutSound: 'sfx.static', caption: 'T-minus 10. Your ride stands on the pad at dusk.' },
  { n: 2, id: 'ignition', from: -3, to: 2, set: 'pad', cutSound: 'sfx.snap', caption: 'Engine start.' },
  { n: 3, id: 'tower', from: 2, to: 8, set: 'pad', cutSound: 'sfx.whoosh', caption: 'Liftoff. Clearing the tower.' },
  { n: 4, id: 'tracking', from: 8, to: 20, set: 'pad', cutSound: 'sfx.snap', caption: 'Tracking camera, three kilometres downrange.' },
  { n: 5, id: 'staging', from: 20, to: 26, set: 'staging', cutSound: 'sfx.whoosh', caption: 'Stage separation. The first stage falls away.' },
  { n: 6, id: 'fairing', from: 26, to: 34, set: 'fairing', cutSound: 'sfx.reveal', caption: 'Fairing open. Your CubeSat is free.' },
  { n: 7, id: 'deploy', from: 34, to: T_END, set: 'fairing', cutSound: 'sfx.whoosh', caption: 'Solar wings unfolding.' },
]

export function shotAt(T: number): AscentShot | null {
  return activeShot(ASCENT_SHOTS, T)
}

/* ---------------- beats: the moments that make a sound or a change in the scene ---------------- */

export type AscentBeatKind =
  | 'countdown' // "Five, four, three, two, one, ignition."
  | 'engine-start' // engines light, shake starts
  | 'liftoff' // T-0: the only place liftoff text and sound fire
  | 'staging'
  | 'fairing-open'
  | 'spring-out'
  | 'wings'
  | 'hello'

export interface AscentBeat {
  at: number
  kind: AscentBeatKind
  sound?: AudioId
  voice?: AudioId
}

/** Time the countdown voice starts so its last word ("Ignition") lands on T-0 */
const COUNTDOWN_VOICE_S = 5.2

export const ASCENT_BEATS: readonly AscentBeat[] = [
  { at: -COUNTDOWN_VOICE_S, kind: 'countdown', voice: 'voice.countdown' },
  { at: -3, kind: 'engine-start' },
  { at: 0, kind: 'liftoff', sound: 'sfx.ignition', voice: 'voice.liftoff' },
  { at: 21, kind: 'staging', sound: 'sfx.snap' },
  { at: 27, kind: 'fairing-open' },
  { at: 28.5, kind: 'spring-out', sound: 'sfx.go', voice: 'ih.launch.deploy' },
  { at: 35, kind: 'wings', sound: 'sfx.ih-part-click' },
  { at: 37, kind: 'hello', sound: 'sfx.downlink', voice: 'ih.launch.hello' },
]

/** Beats with prev < at <= T: what fires on a frame that moved the clock from prev to T */
export function beatsBetween(prev: number, T: number): AscentBeat[] {
  return ASCENT_BEATS.filter((b) => b.at > prev && b.at <= T)
}

/** The big centre word: the countdown numbers from T-5, LIFTOFF from T-0 for 2.5 s, else nothing */
export function countdownText(T: number): string {
  if (T < -5 || T >= 2.5) return ''
  if (T < 0) return String(Math.ceil(-T))
  return 'LIFTOFF'
}

/* ---------------- the rocket's flight on the pad set (metres) ---------------- */

/** The launch mount the rocket stands on; the engine bell hangs just above it */
export const MOUNT_M = 4
/** Tower beside the rocket */
export const TOWER = { x: 18, heightM: 95 }
/** Upward acceleration off the pad (a thrust-to-weight of about 2.1) */
const ACCEL = 11

/** Height of the rocket's base above the ground at time T */
export function rocketAltitude(T: number): number {
  return T <= 0 ? MOUNT_M : MOUNT_M + 0.5 * ACCEL * T * T
}

/** Base of the rocket at T: straight up, then pitching gently downrange (+x) */
export function rocketBase(T: number): Vec3 {
  const alt = rocketAltitude(T)
  const downrange = T <= 4 ? 0 : 0.012 * (alt - rocketAltitude(4)) * Math.min(1, (T - 4) / 12)
  return [downrange, alt, 0]
}

/* ---------------- camera poses ---------------- */

export interface AscentPose {
  set: AscentSet
  pos: Vec3
  look: Vec3
  fov: number
  /** Camera shake, 0..1 (scaled per set by the scene) */
  shake: number
  /** Look goal trails on a spring (shot 4's long-lens follow) */
  springLook: boolean
  near: number
  far: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const smooth = (x: number) => x * x * (3 - 2 * x)
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** Horizontal offset (as a share of the distance) that puts the subject on the left third of the frame */
export function thirdOffset(fovDeg: number, aspect: number): number {
  const halfH = Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect
  return halfH / 3
}

/** Deterministic heat-shimmer wobble for the long lens, in metres at the subject */
export function shimmer(T: number): Vec3 {
  return [0.5 * Math.sin(T * 23.1) + 0.3 * Math.sin(T * 37.7), 0.4 * Math.sin(T * 29.3 + 1.1), 0]
}

/**
 * Inside the fairing (FairingBay coordinates, about 1 unit = 1 m): fairing-local time for mission
 * time T. FairingBay's own sequence opens the halves at 7.5 and the deployer at 9.1.
 */
export const FAIRING_OFFSET_S = 26 - 6.5
export function fairingTime(T: number): number {
  return T - FAIRING_OFFSET_S
}

/** Where the CubeSat is after it springs out (FairingBay coordinates); `f` is fairing-local time */
export function craftOffset(f: number): Vec3 {
  const s = Math.max(0, f - 9.2)
  return [0, 0.14 + s * 0.18, 0.16 + s * 0.28]
}

/** The camera for mission time T. `rocketHeightM` is the stacked rocket's height; aspect is the canvas's */
export function ascentPose(T: number, rocketHeightM: number, aspect = 16 / 9): AscentPose {
  const shot = shotAt(T) ?? ASCENT_SHOTS[ASCENT_SHOTS.length - 1]
  const H = rocketHeightM
  const base = rocketBase(T)
  const pad = { near: 0.5, far: 20000, springLook: false }
  switch (shot.id) {
    case 'establish': {
      // 600 m away, 1.5 m up, FOV 28°, the rocket on the left third
      const dist = 600
      const fov = 28
      const side = dist * thirdOffset(fov, aspect)
      return { set: 'pad', ...pad, pos: [0, 1.5, dist], look: [side, MOUNT_M + H * 0.5, 0], fov, shake: 0 }
    }
    case 'ignition': {
      // Low, 12 m from the base, looking up 20°; shake ramps from engine start to clear of the mount
      const dist = 12
      const eye = 1.2
      const k = clamp01((T - shot.from) / (shot.to - shot.from))
      return {
        set: 'pad',
        ...pad,
        near: 0.1,
        pos: [-dist * 0.5, eye, dist * 0.866],
        look: [0, eye + dist * Math.tan((20 * Math.PI) / 180), 0],
        fov: 50,
        shake: smooth(k),
      }
    }
    case 'tower': {
      // 80 m out, tilting up with the nose
      const nose = add(base, [0, H, 0])
      return { set: 'pad', ...pad, pos: [-40, 2, 69.3], look: nose, fov: 35, shake: 0.25 }
    }
    case 'tracking': {
      // 3 km long lens, 4° closing to 2°, lagged spring follow with heat shimmer
      const k = smooth(clamp01((T - shot.from) / (shot.to - shot.from)))
      const mid = add(base, [0, H * 0.5, 0])
      return { ...pad, springLook: true, set: 'pad', pos: [-1500, 2, 2598], look: add(mid, shimmer(T)), fov: lerp(4, 2, k), shake: 0 }
    }
    case 'staging': {
      // Down-cam on stage 2 looking aft (stage 2 base at the origin, flying +y)
      return { set: 'staging', near: 0.05, far: 5000, springLook: false, pos: [7, 2.5, 1.2], look: [2.4, -30, 0], fov: 62, shake: 0.12 }
    }
    case 'fairing': {
      // Above the bay on the sun side, Earth filling the frame below; pulls back as the craft springs out
      const k = smooth(clamp01((T - shot.from) / (shot.to - shot.from)))
      const craft = craftOffset(fairingTime(T))
      return {
        set: 'fairing',
        near: 0.02,
        far: 120,
        springLook: false,
        pos: [lerp(1.1, 1.0, k), lerp(1.4, 1.9, k), lerp(1.0, 1.8, k)],
        look: [0, lerp(0.25, craft[1], k), lerp(0.1, craft[2], k)],
        fov: lerp(50, 44, k),
        shake: 0.04 * (1 - k),
      }
    }
    case 'deploy': {
      // Slow orbit around the craft, staying on its sunlit side, a little above it
      const craft = craftOffset(fairingTime(T))
      const a = 0.4 + (T - shot.from) * 0.15
      const r = 0.85
      return {
        set: 'fairing',
        near: 0.02,
        far: 120,
        springLook: false,
        pos: [craft[0] + r * Math.sin(a), craft[1] + 0.45, craft[2] + r * Math.cos(a)],
        look: craft,
        fov: 38,
        shake: 0,
      }
    }
  }
}

/* ---------------- stage separation (staging set, metres) ---------------- */

/** Stage 1 relative to stage 2 during shot 5: attached until separation, then falling back and tumbling */
export function stageOneOffset(T: number): { y: number; tumble: number } {
  const sep = ASCENT_BEATS.find((b) => b.kind === 'staging')!.at
  const s = Math.max(0, T - sep)
  return { y: s === 0 ? 0 : -(0.6 * s + 1.6 * s * s), tumble: 0.18 * s }
}

/* ---------------- first viewing ---------------- */

/** Skip is offered once the player has watched the ascent to the end once (or under reduced motion) */
export function canSkip(timesWatched: number, reducedMotion: boolean): boolean {
  return reducedMotion || timesWatched > 0
}
