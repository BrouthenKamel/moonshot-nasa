/**
 * Stylised geometry of the three science orbits for the orbit view.
 * Moon radius = 1, polar axis = y, south pole at −y. Plain number tuples, no three.js.
 * Heights are exaggerated about four times and the halo loop is shortened (see the design doc, "Shapes").
 */

export type Vec3 = [number, number, number]

export interface OrbitShape {
  rp: number // low point radius (over the south pole)
  ra: number // far point radius (over the north pole)
  planeDeg: number // azimuth of the orbit plane
  period: number // seconds per lap on screen
  camDist: number // camera distance that frames this orbit
}

export const CAP_ANGLE_DEG = 30
const TAU = Math.PI * 2
const DEG = Math.PI / 180

export function azimuth(deg: number): Vec3 {
  return [Math.cos(deg * DEG), 0, Math.sin(deg * DEG)]
}

function normalise(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

function raised(azDeg: number, up: number): Vec3 {
  const a = azimuth(azDeg)
  return normalise([a[0], up, a[2]])
}

export const SUN_DIR: Vec3 = raised(160, 0.05)
export const EARTH_DIR: Vec3 = raised(14, 0.42)

const SHAPES: Record<string, OrbitShape> = {
  'orbit-halo': { rp: 1.035, ra: 9, planeDeg: 0, period: 15, camDist: 8.6 },
  'orbit-elliptical': { rp: 1.035, ra: 2.81, planeDeg: 65, period: 9, camDist: 6.4 },
  'orbit-100km': { rp: 1.18, ra: 1.18, planeDeg: 65, period: 6, camDist: 5.2 },
}

/** The drawn shape of an orbit; an unknown id gets the circular shape. */
export function shapeFor(orbitId: string): OrbitShape {
  return SHAPES[orbitId] ?? SHAPES['orbit-100km']
}

const ecc = (s: OrbitShape) => (s.ra - s.rp) / (s.ra + s.rp)

/** Point on the orbit at a true anomaly (0 = low point over the south pole). */
export function orbitPoint(s: OrbitShape, trueAnomaly: number): Vec3 {
  const a = (s.rp + s.ra) / 2
  const e = ecc(s)
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly))
  const u = azimuth(s.planeDeg + 90)
  const up = -Math.cos(trueAnomaly) * r
  const side = Math.sin(trueAnomaly) * r
  return [side * u[0], up, side * u[2]]
}

/** Kepler's equation: true anomaly from mean anomaly (time). */
export function trueAnomaly(s: OrbitShape, meanAnomaly: number): number {
  const e = ecc(s)
  let E = meanAnomaly
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E))
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

/** Inverse of trueAnomaly, in 0..2π. */
export function meanAnomalyOf(s: OrbitShape, trueAnomaly: number): number {
  const e = ecc(s)
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(trueAnomaly / 2), Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2))
  const M = E - e * Math.sin(E)
  return ((M % TAU) + TAU) % TAU
}

/** True when the unit Moon blocks the view from p towards the direction dir. */
export function hiddenBy(p: Vec3, dir: Vec3): boolean {
  const d = p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]
  if (d >= 0) return false
  const x = p[0] - d * dir[0]
  const y = p[1] - d * dir[1]
  const z = p[2] - d * dir[2]
  return Math.hypot(x, y, z) < 1
}

/** Within CAP_ANGLE_DEG of the south pole. */
export function overCap(p: Vec3): boolean {
  const l = Math.hypot(p[0], p[1], p[2])
  return l > 0 && -p[1] / l > Math.cos(CAP_ANGLE_DEG * DEG)
}

/** A stretch of the lap in mean anomaly (time), centred on `centre`, half-width `half`, radians. */
export interface Stretch {
  centre: number
  half: number
}

/**
 * The part of the lap hidden from `dir` (the sun or Earth), sized from the data:
 * it covers `hiddenShare` of the lap in time and is centred where the orbit lies
 * deepest behind the Moon. Null when nothing is hidden.
 */
export function hiddenStretch(s: OrbitShape, dir: Vec3, hiddenShare: number): Stretch | null {
  if (!(hiddenShare > 0)) return null
  const N = 720
  let best = -1
  let bestDot = Infinity
  let bestAny = 0
  let bestAnyDot = Infinity
  for (let i = 0; i < N; i++) {
    const M = (i / N) * TAU
    const p = orbitPoint(s, trueAnomaly(s, M))
    const d = p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]
    if (d < bestAnyDot) {
      bestAnyDot = d
      bestAny = M
    }
    if (hiddenBy(p, dir) && d < bestDot) {
      bestDot = d
      best = M
    }
  }
  return { centre: best >= 0 ? best : bestAny, half: Math.PI * Math.min(1, hiddenShare) }
}

export function inStretch(st: Stretch | null, meanAnomaly: number): boolean {
  if (!st) return false
  let d = (((meanAnomaly - st.centre) % TAU) + TAU) % TAU
  if (d > Math.PI) d = TAU - d
  return d < st.half
}
