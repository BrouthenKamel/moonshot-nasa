/**
 * Pure timing for the payoff shows: when each caption line appears, which sound plays,
 * how long each show runs, and the key moments the 3D scenes animate around.
 * No three.js or React here, so it is unit tested (payoffTimeline.test.ts).
 */
import type { AudioId } from '../../assets/manifest'
import type { Outcome, PayoffKind } from './types'

export interface Beat {
  /** Seconds from the start of the show */
  at: number
  /** Small label above the caption */
  kicker: string
  /** The one caption sentence */
  text: string
  sfx?: AudioId
}

/** Extra sounds that play at a moment without changing the caption */
export interface Cue {
  at: number
  sfx: AudioId
}

/* ---------------- key moments (seconds) the scenes animate around ---------------- */

export const ICE = {
  craftIn: 0.2,
  craftOut: 8.5,
  sweepStart: 2.4,
  sweepEnd: 9.4,
  /** partial: the sweep stops at about half way */
  partialStop: 5.9,
  /** failed: the orbiter's beacon dies */
  silent: 2.6,
} as const

export const LANDING = {
  start: 0,
  /** Altitude where the plume starts to lift dust (seconds) */
  dustStart: 4.2,
  touchdown: 8.0,
  /** partial: tips over after touchdown */
  tipStart: 8.5,
  tipEnd: 9.7,
  /** failed: hits too fast, earlier */
  impact: 6.6,
} as const

export const BASE = {
  slide: [0.8, 3.0],
  dome: [3.2, 5.8],
  masts: [5.4, 6.8],
  panels: [6.6, 8.8],
  radiator: [8.2, 9.6],
  lights: [9.8, 12.6],
  /** failed: the dome loses pressure */
  sag: [5.0, 7.4],
  /** failed: lights flicker out */
  flickerOut: [10.6, 12.2],
} as const

export const MARS = {
  /** Shot cuts */
  descentShot: 4.6,
  landingShot: 9.2,
  chute: 5.3,
  shieldDrop: 6.9,
  /** failed: the canopy tears */
  tear: 5.7,
  retro: 9.2,
  touchdown: 12.0,
  /** dust clears over this window */
  clear: [12.2, 14.6],
  lights: 13.6,
  /** failed: impact seen in the landing shot */
  impact: 10.6,
} as const

/* ---------------- durations ---------------- */

const DURATION: Record<PayoffKind, Record<Outcome, number>> = {
  'ice-map': { success: 13, partial: 11.5, failed: 9.5 },
  'moon-landing': { success: 12.5, partial: 14, failed: 11 },
  'moon-base': { success: 15.5, partial: 15.5, failed: 15 },
  'mars-base': { success: 16.5, partial: 16.5, failed: 14.5 },
}

export function payoffDuration(kind: PayoffKind, outcome: Outcome): number {
  return DURATION[kind][outcome]
}

/* ---------------- caption beats ---------------- */

const ICE_OPEN: Beat = { at: 0.3, kicker: 'LRO · south pole', text: 'A polar orbit carries the orbiter over the lunar south pole.', sfx: 'sfx.whoosh' }
const ICE_SCAN: Beat = { at: 3.0, kicker: 'Mapping', text: 'Each pass scans the craters the Sun never reaches.', sfx: 'sfx.downlink' }

const LAND_OPEN: Beat = { at: 0.3, kicker: 'Powered descent', text: 'Forty metres up, the engine brakes over the south pole.', sfx: 'sfx.burn' }
const LAND_DUST: Beat = { at: 4.6, kicker: 'Low gate', text: 'The plume hits the regolith and a dust sheet blasts outward.' }

const BASE_OPEN: Beat = { at: 0.3, kicker: 'Cargo down', text: 'The cargo lander opens and the base rolls out.', sfx: 'sfx.snap' }
const BASE_DOME: Beat = { at: 3.4, kicker: 'Inflating', text: 'The habitat inflates, like the BEAM module on the ISS in 2016.', sfx: 'sfx.whoosh' }
const BASE_POWER: Beat = { at: 6.4, kicker: 'Power', text: 'Solar masts rise and the arrays fan open.' }

const MARS_ENTRY: Beat = { at: 0.3, kicker: 'Entry', text: "Twenty thousand km/h into Mars' thin air: the heat shield glows.", sfx: 'sfx.burn' }
const MARS_CHUTE: Beat = { at: 5.4, kicker: 'Parachute', text: 'The supersonic parachute opens with a hard jolt.', sfx: 'sfx.capture' }
const MARS_SHIELD: Beat = { at: 7.0, kicker: 'Heat shield away', text: 'The heat shield falls away and the radar finds the ground.' }
const MARS_RETRO: Beat = { at: 9.4, kicker: 'Retro-rockets', text: 'Engines fire into the dust for the last hundred metres.', sfx: 'sfx.ignition' }

const BEATS: Record<PayoffKind, Record<Outcome, Beat[]>> = {
  'ice-map': {
    success: [ICE_OPEN, ICE_SCAN, { at: 9.6, kicker: 'Map complete', text: 'Water ice mapped in the permanently shadowed craters.', sfx: 'sfx.reveal' }],
    partial: [ICE_OPEN, ICE_SCAN, { at: 6.2, kicker: 'Instrument fault', text: 'The scan stopped halfway: half the pole is mapped.', sfx: 'sfx.error' }],
    failed: [ICE_OPEN, { at: 2.9, kicker: 'Signal lost', text: 'The orbiter went silent before its first scan.', sfx: 'sfx.static' }],
  },
  'moon-landing': {
    success: [LAND_OPEN, LAND_DUST, { at: 8.2, kicker: 'Contact', text: 'Touchdown.', sfx: 'sfx.go' }],
    partial: [
      LAND_OPEN,
      LAND_DUST,
      { at: 8.2, kicker: 'Contact', text: 'Touchdown, on the edge of a slope.', sfx: 'sfx.snap' },
      { at: 10.0, kicker: 'Tipped over', text: 'On its side but alive, like IM-1 in 2024 and IM-2 in 2025.', sfx: 'sfx.alarm' },
    ],
    failed: [
      LAND_OPEN,
      { at: 3.8, kicker: 'Too fast', text: 'Descent rate too high: the engine cannot brake in time.', sfx: 'sfx.alarm' },
      { at: 6.9, kicker: 'Impact', text: 'Contact lost at touchdown.', sfx: 'sfx.static' },
    ],
  },
  'moon-base': {
    success: [BASE_OPEN, BASE_DOME, BASE_POWER, { at: 10.2, kicker: 'Base online', text: 'Lights on: the first lunar base is open.', sfx: 'sfx.reveal' }],
    partial: [
      BASE_OPEN,
      BASE_DOME,
      BASE_POWER,
      { at: 8.0, kicker: 'Array jammed', text: 'One solar array stuck half open.', sfx: 'sfx.error' },
      { at: 10.4, kicker: 'Half power', text: 'Half the base is lit: enough to hold on.' },
    ],
    failed: [
      BASE_OPEN,
      BASE_DOME,
      { at: 5.4, kicker: 'Pressure loss', text: 'The habitat will not hold pressure and sags.', sfx: 'sfx.alarm' },
      { at: 10.6, kicker: 'Power lost', text: 'The lights flicker out. The base is down.', sfx: 'sfx.static' },
    ],
  },
  'mars-base': {
    success: [MARS_ENTRY, MARS_CHUTE, MARS_SHIELD, MARS_RETRO, { at: 13.4, kicker: 'Mars base', text: 'Down on target, and the habitat lights up.', sfx: 'sfx.reveal' }],
    partial: [MARS_ENTRY, MARS_CHUTE, MARS_SHIELD, MARS_RETRO, { at: 13.4, kicker: 'Off target', text: 'Down safely, but six kilometres from the target site.', sfx: 'sfx.event' }],
    failed: [
      MARS_ENTRY,
      MARS_CHUTE,
      { at: 5.9, kicker: 'Parachute torn', text: 'The canopy tore and streams uselessly behind the capsule.', sfx: 'sfx.alarm' },
      { at: 10.8, kicker: 'Impact', text: 'Contact lost on the surface.', sfx: 'sfx.static' },
    ],
  },
}

const CUES: Record<PayoffKind, Record<Outcome, Cue[]>> = {
  'ice-map': { success: [], partial: [], failed: [] },
  'moon-landing': {
    success: [{ at: LANDING.touchdown, sfx: 'sfx.capture' }],
    partial: [{ at: LANDING.touchdown, sfx: 'sfx.capture' }],
    failed: [{ at: LANDING.impact, sfx: 'sfx.fit-error' }],
  },
  'moon-base': { success: [{ at: 9.8, sfx: 'sfx.go' }], partial: [], failed: [] },
  'mars-base': {
    success: [{ at: MARS.touchdown, sfx: 'sfx.capture' }],
    partial: [{ at: MARS.touchdown, sfx: 'sfx.capture' }],
    failed: [{ at: MARS.impact, sfx: 'sfx.fit-error' }],
  },
}

export function payoffBeats(kind: PayoffKind, outcome: Outcome): Beat[] {
  return BEATS[kind][outcome]
}

export function payoffCues(kind: PayoffKind, outcome: Outcome): Cue[] {
  return CUES[kind][outcome]
}

/** The caption showing at time t: the last beat that has started, or null before the first */
export function beatAt(beats: readonly Beat[], t: number): Beat | null {
  let cur: Beat | null = null
  for (const b of beats) if (b.at <= t) cur = b
  return cur
}

/** Time the reduced-motion version holds still on: just after the last beat, when everything has settled */
export function restTime(kind: PayoffKind, outcome: Outcome): number {
  const beats = payoffBeats(kind, outcome)
  return Math.min(payoffDuration(kind, outcome) - 0.2, beats[beats.length - 1].at + 1.6)
}

/* ---------------- easing (pure, shared by the scenes) ---------------- */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Progress 0..1 of t through [a, b] */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))
export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3
export const easeInCubic = (x: number) => x * x * x
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
export const easeOutBack = (x: number, s = 1.70158) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2
/** Overshoots and rings like a balloon settling; 0 → 0 and 1 → 1 */
export const easeOutElastic = (x: number) => {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return 2 ** (-9 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3.2)) + 1
}
/** Damped bounce after an impact at `at`: 0 at impact, rings, decays to 0 */
export const ring = (t: number, at: number, freq = 9, decay = 5) => (t < at ? 0 : Math.sin((t - at) * freq) * Math.exp(-(t - at) * decay))
