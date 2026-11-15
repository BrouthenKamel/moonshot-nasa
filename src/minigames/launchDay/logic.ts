import { getRideById } from '../../data/rides'
import type { Design } from '../../sim/types'

/**
 * Launch Day: the ride to orbit, played as seven taps.
 *
 * The rocket flies itself. Seven moments matter, and markers slide along a timeline toward a
 * needle; you tap (or hold, for Max Q) as each one arrives. Everything here is pure and
 * deterministic: no drawing, so every rule can be tested and a bot can play it to check the
 * balance (see logic.test.ts). The screen is LaunchDayGame.tsx.
 *
 * The flight itself is a real 2D ascent: gravity that falls off with height, air that thins with
 * it, drag, a rocket that grows lighter as it burns, and a gravity turn. The numbers are tuned so
 * the events land where they do on a real launch: Max Q near 11 km, staging near 70 km, the
 * fairing above 110 km, orbit at 7.8 km/s.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const EARTH_RADIUS = 6371e3
const G0 = 9.81
/** Earth's gravitational parameter, for working out the orbit at cutoff */
const MU = 3.986e14

export const STAGE1 = { dry: 25e3, fuel: 350e3, isp: 290, thrust: 11e6 }
export const STAGE2 = { dry: 5e3, fuel: 90e3, isp: 340, thrust: 1.6e6 }
const FAIRING_MASS = 1.5e3
/** Drag coefficient times frontal area */
const DRAG_AREA = 0.4 * 10.7

/** Where the fairing may come off: above this the air is too thin to matter */
export const FAIRING_ALT = 110e3
/** Orbital speed to aim for at cutoff */
export const TARGET_V = 7800
/** Air pressure the structure can take before it starts complaining */
const Q_LIMIT = 70e3

/** Within this many seconds of the mark is a perfect tap; within the second, a good one */
const PERFECT_WINDOW = 0.55
const GOOD_WINDOW = 1.4
/** Tapping earlier than this is a false start, not a miss */
const EARLY_WINDOW = 2.2
/** The computer takes over this long after a missed mark */
const MISS_AFTER = 2

export const POINTS = { perfect: 1000, good: 500, off: 100 } as const
/** Each unbroken hit after the first adds this much, up to MAX_COMBO_STEPS */
const COMBO_STEP = 0.25
const MAX_COMBO_STEPS = 4

const lerp = (t: number, a: number, b: number, va: number, vb: number) =>
  va + ((Math.min(Math.max(t, a), b) - a) / (b - a)) * (vb - va)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** The gravity turn the autopilot flies: degrees from straight up, over time */
export function pitchProgram(t: number): number {
  if (t < 8) return 0
  if (t < 50) return lerp(t, 8, 50, 0, 35)
  if (t < 95) return lerp(t, 50, 95, 35, 72)
  if (t < 150) return lerp(t, 95, 150, 72, 92)
  return lerp(t, 150, 230, 92, 100)
}

/* ------------------------------------------------------------------ */
/* The seven moments                                                   */
/* ------------------------------------------------------------------ */

export type EventId = 'ignite' | 'pitch' | 'maxq' | 'stage' | 'fairing' | 'cutoff' | 'deploy'
export type Grade = 'perfect' | 'good' | 'off'

export interface LaunchEvent {
  id: EventId
  /** 'tap' wants one press on the mark; 'hold' wants the button held while a band passes */
  kind: 'tap' | 'hold'
  /** What the button says while this one is live */
  verb: string
  /** The marker's name on the timeline */
  label: string
  /** The flight director's two lines, shown as it comes up */
  call: readonly [string, string]
  /** The title on the result slip, and the one-line fact shown in flight */
  title: string
  short: string
  /** The longer explanation, collected in the logbook afterwards */
  fact: string
}

export const EVENTS: readonly LaunchEvent[] = [
  {
    id: 'ignite',
    kind: 'tap',
    verb: 'IGNITE',
    label: 'IGNITION',
    call: ['Stand by for ignition', 'Tap IGNITE when the marker hits the line'],
    title: 'Ignition',
    short: 'Engines light 3 s before liftoff so computers can check them while clamps still hold the rocket.',
    fact: 'If one engine looks wrong in those three seconds, the computer shuts everything down and the rocket never leaves the pad. That is called a pad abort.',
  },
  {
    id: 'pitch',
    kind: 'tap',
    verb: 'PITCH OVER',
    label: 'PITCH',
    call: ['Begin the gravity turn', 'Tap to tip the nose over toward orbit'],
    title: 'Gravity turn',
    short: 'Rockets tip over early: orbit is about going sideways at 28,000 km/h, not about going up.',
    fact: 'To stay in low orbit you must travel about 7.8 km per second sideways. That is why rockets end their flight almost horizontal, and why they launch eastward to borrow the Earth’s spin.',
  },
  {
    id: 'maxq',
    kind: 'hold',
    verb: 'HOLD',
    label: 'MAX Q',
    call: ['Max Q coming up', 'HOLD the button to throttle down while the red band passes'],
    title: 'Max Q',
    short: 'The air pushes hardest here. Engines throttle down for a few seconds so the rocket is not torn apart.',
    fact: 'Max Q is "maximum dynamic pressure": the speed is rising but the air is thinning, and the two together peak around 11 km. You hear "throttle bucket" and "Max Q" on every launch broadcast.',
  },
  {
    id: 'stage',
    kind: 'tap',
    verb: 'STAGE',
    label: 'STAGING',
    call: ['Stage one is almost empty', 'Tap STAGE the moment it burns out'],
    title: 'Stage separation',
    short: 'The empty first stage is dead weight. Drop it and the small second stage accelerates much faster.',
    fact: 'Separation uses springs or small explosive bolts. On reusable rockets the first stage then flips around, re-lights its engines and flies itself back to a landing pad or a ship.',
  },
  {
    id: 'fairing',
    kind: 'tap',
    verb: 'FAIRING',
    label: 'FAIRING',
    call: ['Fairing jettison', 'Tap as we cross the 110 km line'],
    title: 'Fairing jettison',
    short: 'Above 110 km the air is so thin that the nose cone is just extra weight, so the two halves are released.',
    fact: 'Up here the heating from the thin air on the satellite is less than the warmth of sunlight. Some companies catch the fairing halves with ships and reuse them.',
  },
  {
    id: 'cutoff',
    kind: 'tap',
    verb: 'CUTOFF',
    label: 'SECO',
    call: ['Watch the speed', 'Tap CUTOFF right at 7.8 km/s'],
    title: 'Orbit insertion',
    short: 'Shut the engine off at exactly 7.8 km/s. Too early and you fall back; too late and the orbit is too high.',
    fact: 'An object in orbit is falling the whole time. It just moves sideways so fast that the ground curves away beneath it at the same rate it falls. That is why astronauts float.',
  },
  {
    id: 'deploy',
    kind: 'tap',
    verb: 'DEPLOY',
    label: 'DEPLOY',
    call: ['We are in orbit!', 'Tap DEPLOY to release the CubeSat'],
    title: 'Payload deploy',
    short: 'A spring pushes the CubeSat out of its deployer. It is now a spacecraft on its own.',
    fact: 'A 6U CubeSat is about the size of a shoebox. Right after deploy it is usually tumbling; its first jobs are to stop the spin, unfold its solar panels and call home.',
  },
] as const

export const eventById = (id: EventId): LaunchEvent => EVENTS.find((e) => e.id === id)!

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export interface Debris {
  kind: 'stage' | 'fairing' | 'sat'
  /** Which half, for the two fairing pieces */
  side?: number
  x: number
  h: number
  vx: number
  vy: number
  rot: number
  spin: number
}

export interface Orbit {
  perigeeKm: number
  apogeeKm: number
  /** False when the craft is on an escape path, not going round */
  bound: boolean
}

export interface LaunchState {
  /** Seconds from liftoff; starts negative, on the countdown */
  t: number
  /** Index into EVENTS: the one waiting for you now */
  idx: number
  running: boolean

  /** Downrange distance and height, metres */
  x: number
  h: number
  /** Sideways and upward speed, m/s */
  vx: number
  vy: number
  /** Degrees from straight up */
  pitch: number
  throttle: number
  f1: number
  f2: number
  /** Air pressure on the rocket now, and the worst it has seen (Pa) */
  q: number
  maxQ: number
  rho: number

  engineOn: boolean
  pitchStarted: boolean
  staged: boolean
  stagedAt: number | null
  stage2Lit: boolean
  fairing: boolean
  fairingAt: number | null
  cutoff: boolean
  cutoffAt: number | null
  deployed: boolean
  deployedAt: number | null
  /** When stage 1 ran dry; the stage marker locks to this once it is known */
  burnoutAt: number | null
  /**
   * When the craft first crossed the fairing line and first hit orbital speed. The marks are
   * predicted until then and locked afterwards: a mark that kept saying "now" could never be
   * late, so a slow player would never be handed the event and the flight would never end.
   */
  fairingMark: number | null
  cutoffMark: number | null
  orbit: Orbit | null

  holding: boolean
  /** Seconds held inside and outside the Max Q band */
  holdIn: number
  holdOut: number

  grades: Partial<Record<EventId, Grade>>
  notes: Partial<Record<EventId, string>>
  score: number
  combo: number
  bestCombo: number
  /** How hard the ride has been on the airframe, 0..1 */
  stress: number

  /** Presentation only, but part of the state so the view stays a pure drawing of it */
  shake: number
  flame: number
  debris: Debris[]
  /** The ride's name, for the briefing */
  rideName: string
  payloadMass: number
}

export interface LaunchSetup {
  rideName: string
  payloadMass: number
}

/** What the player's chosen ride means for the launch */
export function setupFromDesign(design: Pick<Design, 'ride'> | null | undefined): LaunchSetup {
  const ride = design ? getRideById(design.ride) : undefined
  return {
    rideName: ride?.name ?? 'Lunar Rideshare',
    // The CubeSat rides with the rest of the rideshare stack; its own mass barely moves the rocket
    payloadMass: 4e3 + (ride?.massLimit ?? 14) * 10,
  }
}

export function newLaunch(setup: LaunchSetup = setupFromDesign(null)): LaunchState {
  return {
    t: -12,
    idx: 0,
    running: true,
    x: 0,
    h: 0,
    vx: 0,
    vy: 0,
    pitch: 0,
    throttle: 1,
    f1: STAGE1.fuel,
    f2: STAGE2.fuel,
    q: 0,
    maxQ: 0,
    rho: 1.225,
    engineOn: false,
    pitchStarted: false,
    staged: false,
    stagedAt: null,
    stage2Lit: false,
    fairing: true,
    fairingAt: null,
    cutoff: false,
    cutoffAt: null,
    deployed: false,
    deployedAt: null,
    burnoutAt: null,
    fairingMark: null,
    cutoffMark: null,
    orbit: null,
    holding: false,
    holdIn: 0,
    holdOut: 0,
    grades: {},
    notes: {},
    score: 0,
    combo: 0,
    bestCombo: 0,
    stress: 0,
    shake: 0,
    flame: 0,
    debris: [],
    rideName: setup.rideName,
    payloadMass: setup.payloadMass,
  }
}

export const currentEvent = (s: LaunchState): LaunchEvent | undefined => EVENTS[s.idx]

export function mass(s: LaunchState): number {
  return (
    s.payloadMass +
    (s.fairing ? FAIRING_MASS : 0) +
    STAGE2.dry +
    s.f2 +
    (s.staged ? 0 : STAGE1.dry + s.f1)
  )
}

export function thrust(s: LaunchState): number {
  if (!s.engineOn || s.cutoff) return 0
  if (!s.staged) return s.f1 > 0 ? STAGE1.thrust * s.throttle : 0
  return s.stage2Lit && s.f2 > 0 ? STAGE2.thrust : 0
}

export const speed = (s: LaunchState): number => Math.hypot(s.vx, s.vy)

/**
 * When an event wants its tap, in flight seconds. The first few are fixed; the later ones are
 * worked out from the flight as it is now, so the marker drifts while the event is far off and
 * firms up as it comes near. A hold returns the band it covers.
 */
export function eventTime(s: LaunchState, ev: LaunchEvent): number | [number, number] {
  switch (ev.id) {
    case 'ignite':
      return -3
    case 'pitch':
      return 10
    case 'maxq':
      return [24, 42]
    case 'stage':
      return s.burnoutAt ?? s.t + s.f1 / ((STAGE1.thrust * s.throttle) / (STAGE1.isp * G0))
    case 'fairing':
      return s.fairingMark ?? s.t + (FAIRING_ALT - s.h) / Math.max(s.vy, 200)
    case 'cutoff': {
      if (s.cutoffMark !== null) return s.cutoffMark
      const v = speed(s)
      const a = Math.max(thrust(s) / mass(s), 3)
      return s.t + (TARGET_V - v) / a
    }
    case 'deploy':
      return (s.cutoffAt ?? tapTime(s, eventById('cutoff'))) + 6
  }
}

/** The moment a tap is counted against; a hold answers with the start of its band */
export function tapTime(s: LaunchState, ev: LaunchEvent): number {
  const t = eventTime(s, ev)
  return Array.isArray(t) ? t[0] : t
}

/** The stretch a hold has to cover */
export function holdBand(s: LaunchState, ev: LaunchEvent): [number, number] {
  const t = eventTime(s, ev)
  return Array.isArray(t) ? t : [t, t]
}

/**
 * Flight seconds per real second. Twice real time while something is happening, up to six times
 * while the next mark is still far off, so the quiet coast does not become a wait.
 */
export function simSpeed(s: LaunchState): number {
  const ev = currentEvent(s)
  if (!ev || s.t < 0) return 2
  const away = tapTime(s, ev) - s.t
  return 2 * (1 + 2 * clamp((away - 9) / 10, 0, 1))
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

/** What a press produced, so the screen knows what to show and play */
export interface Feedback {
  grade: Grade | 'early'
  id: EventId | null
  big: string
  small: string
  points: number
  combo: number
}

/** Press the button. Returns what it did, or null when there was nothing to press. */
export function press(s: LaunchState): Feedback | null {
  const ev = currentEvent(s)
  if (!ev || !s.running) return null
  if (ev.kind === 'hold') {
    s.holding = true
    return null
  }
  const dt = s.t - tapTime(s, ev)
  if (dt < -EARLY_WINDOW) {
    s.combo = 0
    return { grade: 'early', id: null, big: 'TOO EARLY', small: 'wait for the line', points: 0, combo: 0 }
  }
  const off = Math.abs(dt)
  const grade: Grade = off < PERFECT_WINDOW ? 'perfect' : off < GOOD_WINDOW ? 'good' : 'off'
  const when =
    dt < -PERFECT_WINDOW ? `${(-dt).toFixed(1)} s early` : dt > PERFECT_WINDOW ? `${dt.toFixed(1)} s late` : 'right on time'
  return resolve(s, ev.id, grade, when)
}

export function release(s: LaunchState): void {
  s.holding = false
}

/** Grade the Max Q hold on how much of the band it covered */
function finishHold(s: LaunchState): Feedback {
  const [a, b] = holdBand(s, eventById('maxq'))
  const covered = s.holdIn / (b - a)
  const grade: Grade = covered > 0.8 && s.holdOut < 2 ? 'perfect' : covered > 0.5 ? 'good' : 'off'
  s.holding = false
  const note = `Throttled down for ${Math.round(covered * 100)}% of Max Q${s.holdOut > 2 ? ', but held too long' : ''}`
  return resolve(s, 'maxq', grade, note)
}

/** Record an event, score it, and make it happen in the flight */
function resolve(s: LaunchState, id: EventId, grade: Grade, note: string): Feedback {
  s.grades[id] = grade
  s.notes[id] = note
  if (grade === 'off') s.combo = 0
  else {
    s.combo += 1
    s.bestCombo = Math.max(s.bestCombo, s.combo)
  }
  const multiplier = 1 + Math.min(Math.max(s.combo - 1, 0), MAX_COMBO_STEPS) * COMBO_STEP
  const points = Math.round(POINTS[grade] * (grade === 'off' ? 1 : multiplier))
  s.score += points

  switch (id) {
    case 'ignite':
      s.engineOn = true
      s.flame = 1
      break
    case 'pitch':
      s.pitchStarted = true
      break
    case 'maxq':
      break
    case 'stage': {
      const left = s.f1 / STAGE1.fuel
      if (left > 0.03) s.notes.stage += ` — dropped ${Math.round(left * 100)}% unburned fuel`
      s.staged = true
      s.stagedAt = s.t
      s.shake = 0.6
      s.debris.push({ kind: 'stage', x: s.x, h: s.h, vx: s.vx - 6, vy: s.vy - 14, rot: (s.pitch * Math.PI) / 180, spin: 0.3 })
      break
    }
    case 'fairing': {
      if (s.h < FAIRING_ALT - 8e3) {
        s.notes.fairing += ' — too low, the spacecraft got hot'
        s.stress = Math.min(1, s.stress + 0.3)
      }
      s.fairing = false
      s.fairingAt = s.t
      for (const side of [-1, 1]) {
        s.debris.push({ kind: 'fairing', side, x: s.x, h: s.h, vx: s.vx + side * 5, vy: s.vy + 4, rot: (s.pitch * Math.PI) / 180, spin: side * 0.9 })
      }
      break
    }
    case 'cutoff': {
      s.cutoff = true
      s.cutoffAt = s.t
      s.orbit = orbitAt(s)
      s.notes.cutoff += ` at ${(speed(s) / 1e3).toFixed(2)} km/s`
      break
    }
    case 'deploy':
      s.deployed = true
      s.deployedAt = s.t
      s.debris.push({ kind: 'sat', x: s.x, h: s.h, vx: s.vx + 1.5, vy: s.vy + 1, rot: 0, spin: 0.8 })
      break
  }

  s.idx += 1
  return { grade, id, big: grade.toUpperCase(), small: `+${points}${s.combo > 1 ? `  ×${s.combo} combo` : ''}`, points, combo: s.combo }
}

/** The orbit the craft is on right now, from its height and speed */
function orbitAt(s: LaunchState): Orbit {
  const r = EARTH_RADIUS + s.h
  const v2 = s.vx ** 2 + s.vy ** 2
  const energy = v2 / 2 - MU / r
  const a = -MU / (2 * energy)
  const angular = r * s.vx
  const ecc = Math.sqrt(Math.max(0, 1 - (angular * angular) / (MU * a)))
  return {
    perigeeKm: (a * (1 - ecc) - EARTH_RADIUS) / 1e3,
    apogeeKm: (a * (1 + ecc) - EARTH_RADIUS) / 1e3,
    bound: energy < 0,
  }
}

/* ------------------------------------------------------------------ */
/* The flight                                                          */
/* ------------------------------------------------------------------ */

/** One tick. Returns feedback when the flight itself resolved an event (a miss, or the hold ending). */
export function step(s: LaunchState, dt: number): Feedback | null {
  if (!s.running) return null

  if (s.t < 0) {
    s.t += dt
    if (s.t < 0) return null
    // The computer lights the engines if nobody did; the rocket leaves either way
    const missed = !s.engineOn ? resolve(s, 'ignite', 'off', 'Missed. The computer did it for you') : null
    if (missed) s.combo = 0
    s.t = 0
    s.shake = 1
    return missed
  }

  s.t += dt
  const m = mass(s)

  // Pitch: straight up until the turn is started, then along the program
  const target = s.pitchStarted ? pitchProgram(Math.max(s.t, 10)) : 0
  s.pitch += clamp(target - s.pitch, -3 * dt, 3 * dt)

  // Holding throttles down, but only while Max Q is the live event
  const ev = currentEvent(s)
  s.throttle = ev?.id === 'maxq' && s.holding ? 0.7 : 1
  if (ev?.id === 'maxq') {
    const [a, b] = holdBand(s, ev)
    if (s.t >= a && s.t <= b) {
      if (s.holding) s.holdIn += dt
    } else if (s.holding && s.t > 14) s.holdOut += dt
  }

  const T = thrust(s)
  if (T > 0) {
    if (!s.staged) s.f1 = Math.max(0, s.f1 - (T / (STAGE1.isp * G0)) * dt)
    else s.f2 = Math.max(0, s.f2 - (T / (STAGE2.isp * G0)) * dt)
  }
  if (!s.staged && s.f1 <= 0 && s.burnoutAt === null) {
    s.burnoutAt = s.t
    s.flame = 0
  }

  const p = (s.pitch * Math.PI) / 180
  s.rho = 1.225 * Math.exp(-s.h / 8500)
  const v = speed(s)
  s.q = 0.5 * s.rho * v * v
  s.maxQ = Math.max(s.maxQ, s.q)
  const drag = s.q * DRAG_AREA
  // Gravity, less the bit the sideways speed already cancels: this is what makes orbit possible
  const g = G0 * (EARTH_RADIUS / (EARTH_RADIUS + s.h)) ** 2 - (s.vx * s.vx) / (EARTH_RADIUS + s.h)
  s.vx += ((T / m) * Math.sin(p) - (v ? (drag / m) * (s.vx / v) : 0)) * dt
  s.vy += ((T / m) * Math.cos(p) - g - (v ? (drag / m) * (s.vy / v) : 0)) * dt
  if (s.h <= 0 && s.vy < 0) s.vy = 0
  s.h = Math.max(0, s.h + s.vy * dt)
  s.x += s.vx * dt

  // Shoving through the thickest air at full throttle is what hurts the airframe
  if (s.q > Q_LIMIT * 0.8 && s.throttle > 0.82) s.stress = Math.min(1, s.stress + dt * 0.06 * (s.q / Q_LIMIT))
  const buffet = clamp((s.q - 30e3) / 40e3, 0, 1) * (s.throttle > 0.82 ? 1 : 0.3)
  s.shake = Math.max(s.shake * (1 - 2.5 * dt), buffet, s.t < 5 ? 0.7 : 0)

  // How big the plume looks, eased so it swells and dies rather than snapping
  const flameTarget = T > 0 ? (s.staged ? 0.6 : 1) * s.throttle : 0
  s.flame += (flameTarget - s.flame) * Math.min(1, 12 * dt)

  for (const d of s.debris) {
    d.vy -= G0 * dt * 0.9
    d.x += d.vx * dt
    d.h += d.vy * dt
    d.rot += d.spin * dt
    d.vx *= 1 - 0.3 * s.rho * dt
  }

  if (s.staged && !s.stage2Lit && s.stagedAt !== null && s.t - s.stagedAt > 2.5) s.stage2Lit = true

  // Lock the two marks the flight itself decides, the moment it reaches them
  if (s.fairingMark === null && s.h >= FAIRING_ALT) s.fairingMark = s.t
  if (s.cutoffMark === null && speed(s) >= TARGET_V) s.cutoffMark = s.t

  // A mark gone by: the computer does it late, and the combo is lost
  if (ev) {
    const tt = eventTime(s, ev)
    if (ev.kind === 'tap' && !Array.isArray(tt) && s.t > tt + MISS_AFTER) {
      s.combo = 0
      return resolve(s, ev.id, 'off', 'Missed. The computer did it for you')
    }
    if (ev.kind === 'hold' && Array.isArray(tt) && s.t > tt[1] + 0.5) return finishHold(s)
  }

  // A few seconds to watch the CubeSat drift away, then the flight is over
  if (!ev && s.deployed && s.deployedAt !== null && s.t - s.deployedAt > 4) s.running = false
  return null
}

/* ------------------------------------------------------------------ */
/* The result                                                          */
/* ------------------------------------------------------------------ */

export interface LaunchResult {
  score: number
  bestCombo: number
  stars: 1 | 2 | 3
  /** True when the craft is going round on a sensible orbit */
  stable: boolean
  orbit: Orbit
  verdict: string
  grades: Partial<Record<EventId, Grade>>
  notes: Partial<Record<EventId, string>>
  /** How much of stage 2 is left: the margin for the trip to the Moon */
  fuelLeftPct: number
  maxQkPa: number
  stress: number
}

export function summarize(s: LaunchState): LaunchResult {
  const orbit = s.orbit ?? { perigeeKm: 0, apogeeKm: 0, bound: false }
  const stable = orbit.bound && orbit.perigeeKm > 120 && orbit.apogeeKm < 600
  const perfects = Object.values(s.grades).filter((g) => g === 'perfect').length
  const stars: 1 | 2 | 3 = !stable ? 1 : perfects >= 6 && s.stress < 0.5 ? 3 : perfects >= 3 ? 2 : 1
  const verdict = !orbit.bound || orbit.perigeeKm < 0
    ? 'The orbit dips into the atmosphere, so the CubeSat would re-enter within a day. Tap CUTOFF a touch later next time.'
    : !stable
      ? 'In orbit, but not the one we planned. The mission can adapt.'
      : stars === 3
        ? 'A textbook flight. The flight director is grinning.'
        : 'A good flight. The CubeSat is where it needs to be.'
  return {
    score: s.score,
    bestCombo: s.bestCombo,
    stars,
    stable,
    orbit,
    verdict,
    grades: { ...s.grades },
    notes: { ...s.notes },
    fuelLeftPct: (100 * s.f2) / STAGE2.fuel,
    maxQkPa: s.maxQ / 1e3,
    stress: s.stress,
  }
}

/* ------------------------------------------------------------------ */
/* A bot, so the balance can be checked without hands                  */
/* ------------------------------------------------------------------ */

export type BotSkill = 'perfect' | 'sloppy' | 'asleep'

/** Plays one tick the way `skill` would. Used by the tests and by the autopilot in the demo route. */
export function botPlay(s: LaunchState, skill: BotSkill = 'perfect'): Feedback | null {
  if (skill === 'asleep') return null
  const ev = currentEvent(s)
  if (!ev) return null
  const tt = eventTime(s, ev)
  if (ev.kind === 'hold' && Array.isArray(tt)) {
    const inBand = s.t >= tt[0] && s.t <= tt[1]
    if (skill === 'sloppy') return null
    if (inBand && !s.holding) return press(s)
    if (!inBand && s.holding) release(s)
    return null
  }
  // A sloppy player is consistently a beat behind
  const late = skill === 'sloppy' ? 1 : 0
  if (!Array.isArray(tt) && s.t >= tt + late) return press(s)
  return null
}

/** Runs a whole flight at `skill`, for tests. Returns the result. */
export function botFlight(skill: BotSkill = 'perfect', setup?: LaunchSetup): { state: LaunchState; result: LaunchResult } {
  const s = newLaunch(setup ?? setupFromDesign(null))
  const dt = 1 / 120
  let guard = 0
  while (s.running && guard++ < 200_000) {
    botPlay(s, skill)
    step(s, dt)
  }
  return { state: s, result: summarize(s) }
}
