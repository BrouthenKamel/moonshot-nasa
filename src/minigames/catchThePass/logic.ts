import { difficultyPresets, type Difficulty } from '../../data/brief'
import { getGroundStationById, groundStations, type GroundStation } from '../../data/ground'
import { computeBudgets } from '../../sim/budgets'
import type { Design } from '../../sim/types'
import type { Insight, MinigameResult } from '../contract'

/** Seconds one pass of the craft takes to cross the sky */
export const PASS_S = 20
/** The sky is a flat chart: x = azimuth -90..90 degrees, y = elevation 0..90 degrees */
export interface Sky {
  x: number
  y: number
}

/** Where the craft is at time t (0..PASS_S): a rising, curved arc with a small wobble */
export function passPosition(t: number): Sky {
  const u = Math.min(1, Math.max(0, t / PASS_S))
  return { x: -68 + 136 * u + 5 * Math.sin(u * Math.PI * 4), y: 16 + 50 * Math.sin(u * Math.PI) + 3 * Math.sin(u * Math.PI * 6) }
}

export function passVelocity(t: number): Sky {
  const e = 0.05
  const a = passPosition(t - e)
  const b = passPosition(t + e)
  return { x: (b.x - a.x) / (2 * e), y: (b.y - a.y) / (2 * e) }
}

export interface DishTraits {
  /** Radius of the crosshair on the sky, in degrees. Bigger dish = narrower beam */
  beamDeg: number
  /** 0..1: how much the motors follow the craft on their own */
  assist: number
  /** Fastest the dish turns by hand, degrees a second */
  slewDegS: number
}

/** A big dish has a narrow beam and heavy motors, so it comes with a tracking motor. */
export const DISH_TRAITS: Record<string, DishTraits> = {
  'ground-small': { beamDeg: 13, assist: 0, slewDegS: 70 },
  'ground-medium': { beamDeg: 8, assist: 0.5, slewDegS: 50 },
  'ground-dsn': { beamDeg: 5, assist: 0.85, slewDegS: 36 },
}

export function dishTraits(stationId: string): DishTraits {
  return DISH_TRAITS[stationId] ?? DISH_TRAITS['ground-medium']
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function pointingError(dish: Sky, blip: Sky): number {
  return Math.hypot(dish.x - blip.x, dish.y - blip.y)
}

/** 1 right on target, 0 at the edge of the beam */
export function linkQuality(errDeg: number, beamDeg: number): number {
  const r = errDeg / beamDeg
  return r >= 1 ? 0 : 1 - r * r
}

export interface DishInput {
  /** Where the hand wants the dish (mouse), or null */
  aim: Sky | null
  /** Arrow keys, -1..1 */
  key: Sky
}

/** One tick of the dish: the hand steers at the slew limit, the motor adds its own tracking */
export function stepDish(dish: Sky, input: DishInput, blip: Sky, blipVel: Sky, traits: DishTraits, dt: number): Sky {
  let { x, y } = dish
  const maxStep = traits.slewDegS * dt
  if (input.aim) {
    const dx = input.aim.x - x
    const dy = input.aim.y - y
    const d = Math.hypot(dx, dy)
    const s = d > maxStep ? maxStep / d : 1
    x += dx * s
    y += dy * s
  }
  x += input.key.x * maxStep
  y += input.key.y * maxStep
  // motor: feed-forward on the craft's speed plus a gentle pull to it
  x += traits.assist * (blipVel.x * dt + (blip.x - x) * Math.min(1, dt * 1.2))
  y += traits.assist * (blipVel.y * dt + (blip.y - y) * Math.min(1, dt * 1.2))
  return { x: clamp(x, -90, 90), y: clamp(y, 0, 90) }
}

/** Radio rate (kbps) for a station and the design's radio, from the same rule as computeBudgets */
export function linkKbpsFor(design: Design, difficulty: Difficulty, stationId: string): number {
  return computeBudgets({ ...design, groundStation: stationId }, difficulty).linkKbps
}

/** The fastest link in the game (DSN with a deployable dish), used to scale the reel */
export const REEL_REF_KBPS = 128 * 8

/** Kilobit-seconds taken in during a tick: rate x link quality x dt */
export function reelGain(kbps: number, quality: number, dt: number): number {
  return kbps * quality * dt
}

/** The reel shows the square root of what was recorded so a slow link still visibly turns (0..1) */
export function reelFill(acc: number): number {
  return clamp(Math.sqrt(acc / (REEL_REF_KBPS * PASS_S)), 0, 1)
}

// ---------- Phase 2: booking ----------

export const HOURS = 24
export const COIN_M = 0.01 // $M one coin stands for (per turn)

/** Most hours a day this station can be booked */
export function maxHours(station: GroundStation): number {
  return Math.max(1, station.contactHoursPerDay)
}

/** Coins one painted hour costs a turn */
export function coinsPerHour(station: GroundStation): number {
  return Math.max(1, Math.round(station.pricePerHour / COIN_M))
}

export function countHours(ring: boolean[]): number {
  return ring.filter(Boolean).length
}

/** Paint (or erase) one hour; painting stops at the station's cap. Returns the same ring when refused */
export function paintHour(ring: boolean[], hour: number, on: boolean, cap: number): boolean[] {
  const h = ((Math.round(hour) % HOURS) + HOURS) % HOURS
  if (ring[h] === on) return ring
  if (on && countHours(ring) >= cap) return ring
  const next = ring.slice()
  next[h] = on
  return next
}

/** A ring with n hours painted in a row from a start hour (for the default booking) */
export function ringWithHours(n: number, start = 8): boolean[] {
  const ring = new Array<boolean>(HOURS).fill(false)
  for (let i = 0; i < n; i++) ring[(start + i) % HOURS] = true
  return ring
}

/** Clamp a ring to the station's cap (a station switch keeps the earliest painted hours) */
export function clampRing(ring: boolean[], cap: number): boolean[] {
  let seen = 0
  return ring.map((on) => on && ++seen <= cap)
}

export interface Projection {
  mbPerDay: number
  /** MB over the 12 turns of the mission */
  missionMb: number
  /** 0..1 of the mission data target */
  jar: number
  coinsPerTurn: number
}

export function project(design: Design, difficulty: Difficulty, stationId: string, hours: number): Projection {
  const station = getGroundStationById(stationId)
  const b = computeBudgets({ ...design, groundStation: stationId, contactHours: hours }, difficulty)
  const target = (difficultyPresets[difficulty] ?? difficultyPresets.engineer).dataTarget
  const mbPerDay = b.downlinkPerTurn / 30
  const missionMb = b.downlinkPerTurn * 12
  return {
    mbPerDay,
    missionMb,
    jar: clamp(missionMb / target, 0, 1),
    coinsPerTurn: station ? coinsPerHour(station) * b.contactHours : 0,
  }
}

export function stationName(stationId: string): string {
  return stationId === 'ground-small' ? 'a 4 m dish' : stationId === 'ground-medium' ? 'a 21 m dish' : stationId === 'ground-dsn' ? 'a 34 m dish' : 'a dish'
}

export function radioBand(radioId: string): string {
  return radioId === 'radio-xband' ? 'X-band' : radioId === 'radio-sband' ? 'S-band' : 'UHF'
}

export interface PassScore {
  /** Seconds the crosshair held the craft (quality > 0) */
  onTarget: number
  /** Mean link quality across the pass, 0..1 */
  accuracy: number
}

export function buildResult(args: {
  design: Design
  difficulty: Difficulty
  stationId: string
  ring: boolean[]
  score: PassScore | null
  durationS: number
}): MinigameResult {
  const { design, difficulty, stationId, ring, score, durationS } = args
  const station = groundStations.find((g) => g.id === stationId) ?? groundStations[1]
  const hours = clamp(countHours(ring), 1, maxHours(station))
  const p = project(design, difficulty, station.id, hours)
  const mb = Math.round(p.mbPerDay)
  const text =
    p.mbPerDay > 0
      ? `${radioBand(design.radio)} into ${stationName(station.id)} brings home ${mb} MB a day.`
      : `This radio cannot reach ${stationName(station.id)} from the Moon: nothing comes home.`
  const insights: Insight[] = [
    { id: 'pass-downlink', room: 'ground-station', text, metric: { label: 'downlink', value: mb, unit: 'MB/day' } },
  ]
  if (score) {
    const pct = Math.round(score.accuracy * 100)
    insights.push({
      id: 'pass-pointing',
      room: 'ground-station',
      text: `You held the craft in the beam for ${Math.round((score.onTarget / PASS_S) * 100)}% of the pass, at ${pct}% pointing accuracy.`,
      metric: { label: 'pointing accuracy', value: pct, unit: '%' },
    })
  }
  return { patch: { groundStation: station.id, contactHours: hours }, insights, durationS: Math.round(durationS) }
}
