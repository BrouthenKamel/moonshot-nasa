/**
 * How the Earth, the Moon, the Sun and the craft move in the space view, by mission day.
 *
 * Scene units: the Moon's radius is 1. Earth (radius 3.67, the real ratio) sits at EARTH and
 * spins once a day about its tilted axis. The Moon goes round Earth once every 27.3 days at
 * MOON_DISTANCE (compressed: really about 220 Moon radii) and keeps one face toward it. Seen
 * from Earth, the Sun goes round once a year, so the lighting and the Moon's phases change.
 *
 * The craft leaves a low parking orbit on an ellipse around Earth and meets the Moon where the
 * Moon will be on the arrival day. Along the ellipse it obeys Kepler's second law: fast near
 * Earth, slow far out. A short transfer is a direct, Hohmann-like half ellipse; a months-long
 * low-energy transfer swings out beyond the Moon's orbit and falls back to meet it.
 *
 * Pure numbers, no three.js, so it can be tested.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const EARTH: Vec3 = { x: -34, y: 0, z: 0 }
export const EARTH_RADIUS = 3.67
export const MOON_DISTANCE = 34
/** Sidereal month: one turn of the Moon round Earth */
export const LUNAR_MONTH_DAYS = 27.32
export const YEAR_DAYS = 365.25
/** Low parking orbit the transfer starts from */
export const PARKING_RADIUS = EARTH_RADIUS * 1.35

const TAU = Math.PI * 2

/** The Moon's angle round Earth on a day (0 puts it at the scene origin) */
export function moonAngle(day: number): number {
  return (TAU * day) / LUNAR_MONTH_DAYS
}

export function moonPosition(day: number): Vec3 {
  const a = moonAngle(day)
  return { x: EARTH.x + MOON_DISTANCE * Math.cos(a), y: 0, z: EARTH.z + MOON_DISTANCE * Math.sin(a) }
}

/** How far the Sun's direction has turned round the scene's up axis: Earth's year, seen from Earth */
export function sunAngle(day: number): number {
  return (-TAU * day) / YEAR_DAYS
}

/** Earth's spin: one turn per sidereal day */
export function earthSpin(day: number): number {
  return TAU * day * (366.25 / 365.25)
}

/* ------------------------------------------------------------------ */
/* Transfer orbit                                                      */
/* ------------------------------------------------------------------ */

export interface TransferPlan {
  launchDay: number
  arrivalDay: number
  /** Ellipse round Earth: semi-latus rectum and eccentricity */
  p: number
  e: number
  /** Direction of perigee (where the craft leaves the parking orbit) */
  perigeeAngle: number
  /** True anomaly at arrival, where the ellipse meets the Moon */
  arrivalAnomaly: number
  /** Mean anomaly at arrival: time along the ellipse runs from 0 to this */
  arrivalMean: number
  /** Furthest point from Earth */
  apogee: number
}

/** Days for a direct transfer; longer ones are low-energy and loop out beyond the Moon */
const DIRECT_DAYS = 8

function eccentricFromTrue(nu: number, e: number): number {
  // E in (0, 2π) for ν in (0, 2π)
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
}

function trueFromEccentric(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

function eccentricFromMean(M: number, e: number): number {
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return E
}

export function planTransfer(launchDay: number, arrivalDay: number): TransferPlan {
  const days = Math.max(1, arrivalDay - launchDay)
  const r0 = PARKING_RADIUS
  const R = MOON_DISTANCE
  const direct = days <= DIRECT_DAYS
  // A direct transfer just reaches the Moon's orbit; a low-energy one swings further out
  const apogee = direct ? R * 1.02 : R * Math.min(1.9, 1.15 + days / 400)
  const e = (apogee - r0) / (apogee + r0)
  const p = ((r0 + apogee) / 2) * (1 - e * e)
  // Where on the ellipse the distance equals the Moon's: outbound for a direct transfer, falling back in for a long one
  const cosNu = Math.min(1, Math.max(-1, (p / R - 1) / e))
  const outbound = Math.acos(cosNu)
  const arrivalAnomaly = direct ? outbound : TAU - outbound
  const E1 = eccentricFromTrue(arrivalAnomaly, e)
  const arrivalMean = E1 - e * Math.sin(E1)
  const perigeeAngle = moonAngle(arrivalDay) - arrivalAnomaly
  return { launchDay, arrivalDay, p, e, perigeeAngle, arrivalAnomaly, arrivalMean, apogee }
}

/** 0..1 along the transfer on a day */
export function transferProgress(plan: TransferPlan, day: number): number {
  const span = Math.max(1e-6, plan.arrivalDay - plan.launchDay)
  return Math.min(1, Math.max(0, (day - plan.launchDay) / span))
}

/** Where the craft is at progress s (0 leaving the parking orbit, 1 at the Moon) */
export function transferPosition(plan: TransferPlan, s: number): Vec3 {
  const t = Math.min(1, Math.max(0, s))
  const E = eccentricFromMean(t * plan.arrivalMean, plan.e)
  const nu = trueFromEccentric(E, plan.e)
  const r = plan.p / (1 + plan.e * Math.cos(nu))
  const ang = plan.perigeeAngle + nu
  // A gentle rise out of the Moon's orbital plane on the way, back in at both ends
  const lift = Math.sin(Math.PI * t) * 1.6
  return { x: EARTH.x + r * Math.cos(ang), y: lift, z: EARTH.z + r * Math.sin(ang) }
}

export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
