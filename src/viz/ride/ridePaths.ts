/**
 * The shapes of the Ride & Transfer picture, as plain point lists (no three.js) so they can be
 * tested. Earth at (-6, 0), Moon at (6, 0) in the picture plane (x, z); distances are not to scale.
 * Each path is two legs: what the rocket does (the ride) and what the craft's own engine does
 * (climb out, transfer), ending at the capture burn at the Moon.
 */
export type P = [number, number]

export const EARTH: P = [-6, 0]
export const MOON: P = [6, 0]
export const EARTH_R = 1.15
export const MOON_R = 0.42
/** Where the capture burn happens: just before the Moon, on the side the craft arrives from */
export const CAPTURE_GAP = 0.75

const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function bezier(p0: P, p1: P, p2: P, p3: P, n = 48): P[] {
  const out: P[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = lerp(lerp(p0, p1, t), lerp(p1, p2, t), t)
    const b = lerp(lerp(p1, p2, t), lerp(p2, p3, t), t)
    out.push(lerp(a, b, t))
  }
  return out
}

/** The rocket's leg: launch from Earth to where the craft is let go */
export function rideLeg(rideId: string): P[] {
  const start: P = [EARTH[0] + EARTH_R * 0.7, EARTH[1] - EARTH_R * 0.7]
  if (rideId === 'ride-gto') {
    // Geostationary transfer orbit: a long ellipse around Earth, perigee low, apogee out at 3 Earth radii
    const out: P[] = []
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2 - Math.PI / 4
      out.push([EARTH[0] + Math.cos(a) * 2.1 - 0.8, EARTH[1] + Math.sin(a) * 1.55])
    }
    return out
  }
  if (rideId === 'ride-commercial') {
    // The lander flies almost all the way and releases the craft near the Moon
    return bezier(start, [-2, -3.5], [3, -2.6], [MOON[0] - 1.6, MOON[1] - 1.1])
  }
  // Lunar rideshare: a short climb onto the trans-lunar path, then release
  return bezier(start, [-4.2, -2.4], [-2.8, -2.5], [-1.8, -2.1], 24)
}

/** Where the craft is let go: the end of the ride leg (for GTO, the ellipse's far point) */
export function releasePoint(rideId: string): P {
  const leg = rideLeg(rideId)
  if (rideId === 'ride-gto') return leg[Math.round(leg.length * 0.625)]
  return leg[leg.length - 1]
}

/** The craft's own leg, from release to the capture burn */
export function craftLeg(rideId: string, transferId: string): P[] {
  const from = releasePoint(rideId)
  const pre: P[] = []
  let start = from
  if (rideId === 'ride-gto') {
    // An ion engine climbs out of GTO in a widening spiral before it can head for the Moon
    const turns = 3
    const dx = from[0] - EARTH[0]
    const dz = (from[1] - EARTH[1]) / 0.8
    const a0 = Math.atan2(dz, dx)
    const r0 = Math.hypot(dx, dz)
    for (let i = 0; i <= 90; i++) {
      const t = i / 90
      const a = a0 + t * turns * Math.PI * 2
      const r = r0 + t * 2.3
      pre.push([EARTH[0] + Math.cos(a) * r, EARTH[1] + Math.sin(a) * r * 0.8])
    }
    start = pre[pre.length - 1]
  }
  const capture: P = [MOON[0] - CAPTURE_GAP * 0.7, MOON[1] - CAPTURE_GAP * 0.7]
  let leg: P[]
  if (rideId === 'ride-commercial') {
    leg = bezier(start, lerp(start, capture, 0.3), lerp(start, capture, 0.7), capture, 16)
  } else if (transferId === 'transfer-direct') {
    // Straight across in about five days
    leg = bezier(start, [start[0] + 3, start[1] - 1.2], [MOON[0] - 3, MOON[1] - 1.8], capture)
  } else {
    // Low-energy: a long loop out past the Moon, where the Sun's pull does the braking, back in from beyond
    const far: P = [MOON[0] + 5.5, MOON[1] - 4.2]
    leg = [
      ...bezier(start, [start[0] + 4, start[1] - 3.2], [MOON[0] + 1, MOON[1] - 6.5], far, 40),
      ...bezier(far, [MOON[0] + 8.2, MOON[1] - 1.5], [MOON[0] + 3.2, MOON[1] + 1.8], [MOON[0] + CAPTURE_GAP * 0.96, MOON[1] + CAPTURE_GAP * 0.2], 40).slice(1),
    ]
  }
  return [...pre, ...leg.slice(pre.length ? 1 : 0)]
}
