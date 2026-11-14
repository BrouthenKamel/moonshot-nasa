import type { DropKind } from './rideView'

/**
 * Geometry of the launch pad's sky, in a fixed 1600 × 900 space (the approved
 * mockup's canvas). The curves are diagrams, not physics: they show where the
 * ride drops the craft and which way it goes to the Moon.
 */

export interface Pt {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const SKY_W = 1600
export const SKY_H = 900
export const GROUND_Y = 735
export const MOON = { x: 1290, y: 175, r: 60 }
/** Where the capture burn happens: the Moon's lower left, Earth-facing side (agreed with the Orbit step) */
export const CAPTURE: Pt = { x: 1232, y: 226 }
export const ROCKET_X = 440

/** The CubeSat's place in each rocket's nose: the start of the ride leg */
export const NOSE: Record<DropKind, Pt> = {
  gto: { x: ROCKET_X, y: 470 },
  'trans-lunar': { x: ROCKET_X, y: 395 },
  'lunar-vicinity': { x: ROCKET_X, y: 440 },
}

/** Where each ride lets the craft go */
export const DROP: Record<DropKind, Pt> = {
  gto: { x: 730, y: 470 },
  'trans-lunar': { x: 760, y: 340 },
  'lunar-vicinity': { x: 1100, y: 275 },
}

export const SIGN_RECT: Record<'low_energy' | 'direct', Rect> = {
  low_energy: { x: 720, y: 22, w: 320, h: 62 },
  direct: { x: 720, y: 92, w: 320, h: 62 },
}

/** Cubic Bézier from p0 to p3, sampled at n + 1 points */
function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 40): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const v = 1 - u
    out.push({
      x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x,
      y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y,
    })
  }
  return out
}

/** From the rocket's nose to the drop-off: the part the rocket flies */
export function rideLeg(drop: DropKind): Pt[] {
  const a = NOSE[drop]
  const d = DROP[drop]
  return bez(a, { x: a.x + 10, y: a.y - 160 }, { x: d.x - 170, y: d.y - 40 }, d)
}

/** The ion engine's slow spiral out of Earth orbit, from the GTO drop-off */
function spiral(d: Pt): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= 150; i++) {
    const a = (i / 150) * Math.PI * 6.5 + Math.PI
    const rad = 26 + i * 0.45
    pts.push({ x: d.x + 40 + Math.cos(a) * rad * 1.5 + i * 0.3, y: d.y - 10 + Math.sin(a) * rad * 0.62 - i * 0.45 })
  }
  return pts
}

/** From the drop-off to the capture burn: the part the craft's own engine flies */
export function craftLeg(drop: DropKind, transfer: 'direct' | 'low_energy'): Pt[] {
  const d = DROP[drop]
  const pre = drop === 'gto' ? spiral(d) : []
  const s = pre.length ? pre[pre.length - 1] : d
  if (transfer === 'direct')
    return pre.concat(bez(s, { x: s.x + (CAPTURE.x - s.x) * 0.4, y: s.y - 60 }, { x: CAPTURE.x - 70, y: CAPTURE.y + 120 }, CAPTURE))
  // Low energy: a long loop out past the Moon, back in from below
  const far = drop === 'lunar-vicinity' ? { x: 1470, y: 95 } : { x: 1540, y: 70 }
  const back = { x: 1400, y: 330 }
  return pre.concat(
    bez(s, { x: s.x + 230, y: s.y - 150 }, { x: far.x - 230, y: far.y - 60 }, far),
    bez(far, { x: far.x + 70, y: far.y + 20 }, { x: far.x + 40, y: far.y + 230 }, back),
    bez(back, { x: 1330, y: 350 }, { x: 1260, y: 290 }, CAPTURE, 20)
  )
}

function cumulative(pts: Pt[]): number[] {
  const acc = [0]
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return acc
}

export function pathLength(pts: Pt[]): number {
  const acc = cumulative(pts)
  return acc[acc.length - 1] ?? 0
}

/** The point a fraction t of the way along the path, by arc length; t is clamped to 0..1 */
export function pointAlong(pts: Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 }
  if (t <= 0 || pts.length === 1) return { ...pts[0] }
  if (t >= 1) return { ...pts[pts.length - 1] }
  const acc = cumulative(pts)
  const target = t * acc[acc.length - 1]
  let i = 1
  while (i < acc.length - 1 && acc[i] < target) i++
  const seg = acc[i] - acc[i - 1] || 1
  const k = (target - acc[i - 1]) / seg
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }
}

/** The part of the path between two arc-length fractions */
export function slice(pts: Pt[], from: number, to: number): Pt[] {
  if (pts.length < 2 || to <= from) return []
  const acc = cumulative(pts)
  const total = acc[acc.length - 1]
  const out = [pointAlong(pts, from)]
  for (let i = 1; i < pts.length - 1; i++) {
    const f = acc[i] / (total || 1)
    if (f > from && f < to) out.push({ ...pts[i] })
  }
  out.push(pointAlong(pts, to))
  return out
}

/** One marker per turn of coasting, spread along the path */
export function turnDots(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = []
  for (let i = 1; i <= n; i++) out.push(pointAlong(pts, (i / (n + 0.3)) * 0.97))
  return out
}

/** A straight continuation past the path's end, along its last direction */
export function overshoot(pts: Pt[], length: number): Pt[] {
  const end = pts[pts.length - 1]
  let j = pts.length - 2
  while (j > 0 && Math.hypot(end.x - pts[j].x, end.y - pts[j].y) < 1e-6) j--
  const prev = pts[Math.max(0, j)]
  const dx = end.x - prev.x
  const dy = end.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  return [{ ...end }, { x: end.x + (dx / len) * length, y: end.y + (dy / len) * length }]
}
