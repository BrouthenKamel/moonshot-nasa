import type { Difficulty } from '../../data/brief'
import { getOrbitById, type LunarOrbit } from '../../data/orbits'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { getTransferById } from '../../data/transfers'
import { computeBudgets } from '../../sim/budgets'
import type { Design } from '../../sim/types'
import type { Insight, MinigameResult } from '../contract'
import type { OrbitShape } from '../../viz/orbit/orbitGeometry'

/**
 * Orbit Sling, pure rules: handle position -> orbit family (magnetic snap), the drawn
 * shape, coverage time-lapse, the numbers per family (all from orbits.ts + computeBudgets),
 * the transfer trail, and the result. No React, no three.js.
 */

export type OrbitFamilyId = 'orbit-halo' | 'orbit-elliptical' | 'orbit-100km'
export type TransferId = 'transfer-direct' | 'transfer-low-energy'

/* ------------------------------------------------------------------ */
/* Handles -> shape                                                     */
/* ------------------------------------------------------------------ */

/** Drawn radii (Moon radius = 1, heights exaggerated). */
export const RP_LOW = 1.08
export const RP_HIGH = 1.55
export const RA_MAX = 3.4
const ELLIPSE_RA = 2.0

/** Handle space: p = periapsis handle 0..1 (low -> high), q = apoapsis handle 0..1 (round -> far). */
export interface Handles {
  p: number
  q: number
}

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const smooth = (t: number) => t * t * (3 - 2 * t)

export const rpOf = (p: number) => RP_LOW + (RP_HIGH - RP_LOW) * clamp(p)
export const raOf = (p: number, q: number) => {
  const rp = rpOf(p)
  return rp * Math.pow(RA_MAX / rp, clamp(q))
}

/** Inverse of rpOf/raOf: where the handles sit for a pair of drawn radii. */
export function handlesFromRadii(rp: number, ra: number): Handles {
  const p = clamp((rp - RP_LOW) / (RP_HIGH - RP_LOW))
  const rpe = rpOf(p)
  const q = clamp(Math.log(Math.max(ra, rpe) / rpe) / Math.log(RA_MAX / rpe))
  return { p, q }
}

export interface Family {
  id: OrbitFamilyId
  /** Where the family sits in handle space */
  at: Handles
  color: string
  short: string
}

const qEllipse = handlesFromRadii(RP_LOW, ELLIPSE_RA).q

export const FAMILIES: Family[] = [
  {
    id: 'orbit-halo',
    at: { p: 0, q: 1 },
    color: '#a78bfa',
    short: 'Halo loop',
  },
  {
    id: 'orbit-elliptical',
    at: { p: 0, q: qEllipse },
    color: '#a3e635',
    short: 'Elliptical polar',
  },
  {
    id: 'orbit-100km',
    at: { p: 1, q: 0 },
    color: '#38bdf8',
    short: '100 km circular',
  },
]

export const familyById = (id: string): Family => FAMILIES.find((f) => f.id === id) ?? FAMILIES[2]

const dist = (a: Handles, b: Handles) => Math.hypot(a.p - b.p, a.q - b.q)

export function nearestFamily(h: Handles): {
  family: Family
  distance: number
} {
  let best = FAMILIES[0]
  let bd = Infinity
  for (const f of FAMILIES) {
    const d = dist(h, f.at)
    if (d < bd) {
      bd = d
      best = f
    }
  }
  return { family: best, distance: bd }
}

/** Inside this distance a family pulls the handles toward it */
export const CAPTURE_RADIUS = 0.3
/** Inside this distance the handles are seated (the click) */
export const SEAT_RADIUS = 0.07

export interface Magnet {
  /** Where the handles are drawn: the raw spot pulled toward the family */
  shown: Handles
  family: Family
  /** 0..1 how strongly it is held */
  pull: number
  /** True when the shape sits exactly on a real family */
  seated: boolean
}

/** The magnetic snap: continuous morph far away, pulled in and seated close to a real orbit. */
export function magnet(raw: Handles): Magnet {
  const h = { p: clamp(raw.p), q: clamp(raw.q) }
  const { family, distance } = nearestFamily(h)
  const pull = distance >= CAPTURE_RADIUS ? 0 : smooth(1 - distance / CAPTURE_RADIUS)
  const seated = distance <= SEAT_RADIUS
  const k = seated ? 1 : pull * 0.85
  return {
    shown: {
      p: h.p + (family.at.p - h.p) * k,
      q: h.q + (family.at.q - h.q) * k,
    },
    family,
    pull,
    seated,
  }
}

/** On release the player always lands on a real family */
export function commitFamily(raw: Handles): Family {
  return nearestFamily(raw).family
}

/** The drawn orbit shape for a handle position (fits viz/orbit/orbitGeometry helpers). */
export function shapeAt(h: Handles): OrbitShape {
  const rp = rpOf(h.p)
  const ra = raOf(h.p, h.q)
  const a = (rp + ra) / 2
  return { rp, ra, planeDeg: 65, period: 4 * Math.pow(a, 1.5), camDist: 9.5 }
}

/* ------------------------------------------------------------------ */
/* Numbers per family                                                   */
/* ------------------------------------------------------------------ */

/** Ice-seeing payload used when the player's own instruments cannot see into shadow at all */
const REFERENCE_INSTRUMENT = 'inst-laser'

function seesIce(id: string): boolean {
  const p = getPartById(id) as InstrumentPart | undefined
  return !!p && p.category === 'instrument' && p.seesShadow
}

export function trialDesign(design: Design, orbitId: string, transferId: string): Design {
  const usesReference = !design.instruments.some(seesIce)
  return {
    ...design,
    orbit: orbitId,
    transfer: transferId,
    instruments: usesReference ? [...design.instruments, REFERENCE_INSTRUMENT] : design.instruments,
  }
}

export interface Candidate {
  orbitId: string
  orbitName: string
  transferId: string
  /** % of the south polar cap mapped by month 12 (computeBudgets.projectedCoverage) */
  coveragePct: number
  /** True when no instrument of the player's payload sees ice, so a reference laser was assumed */
  referenceSensor: boolean
  /** Longest shadow per orbit, minutes (orbits.ts) */
  eclipseMin: number
  /** % of the time the Moon blocks Earth (1 - earthVisible) */
  blackoutPct: number
  /** m/s the craft needs: capture + station keeping (computeBudgets.deltaVTotal) */
  dvNeeded: number
  /** m/s the craft has (computeBudgets.deltaVAvailable) */
  dvAvailable: number
  dvMargin: number
  captureDv: number | null
  /** Months from drop-off to capture; null = cannot get there; 0 = days (direct) */
  transferMonths: number | null
  reachable: boolean
  /** Shares used to draw eclipse and blackout arcs */
  sunlitShare: number
  earthVisible: number
}

export function evaluate(design: Design, difficulty: Difficulty, orbitId: string, transferId: string): Candidate {
  const orbit = getOrbitById(orbitId) as LunarOrbit
  const trial = trialDesign(design, orbitId, transferId)
  const b = computeBudgets(trial, difficulty)
  return {
    orbitId,
    orbitName: orbit.name,
    transferId,
    coveragePct: Math.round(b.projectedCoverage),
    referenceSensor: !design.instruments.some(seesIce),
    eclipseMin: Math.round(orbit.eclipseHours * 60),
    blackoutPct: Math.round((1 - orbit.earthVisible) * 100),
    dvNeeded: Math.round(b.deltaVTotal),
    dvAvailable: Math.round(b.deltaVAvailable),
    dvMargin: Math.round(b.deltaVAvailable - b.deltaVTotal),
    captureDv: b.captureDeltaV === null ? null : Math.round(b.captureDeltaV),
    transferMonths: b.transferTurns,
    reachable: b.captureDeltaV !== null && b.deltaVAvailable >= b.deltaVTotal,
    sunlitShare: orbit.sunlitShare,
    earthVisible: orbit.earthVisible,
  }
}

/* ------------------------------------------------------------------ */
/* Coverage time-lapse and the gauge                                    */
/* ------------------------------------------------------------------ */

export const LAPSE_MONTHS = 12

/**
 * Coverage (%) after `progress` (0..1) of the time-lapse: passes fill the cap with
 * diminishing returns, ending exactly at the sim's number.
 */
export function lapseCoverage(finalPct: number, progress: number, k = 3): number {
  const t = clamp(progress)
  if (finalPct <= 0) return 0
  return (finalPct * (1 - Math.exp(-k * t))) / (1 - Math.exp(-k))
}

/** Coverage at evenly spaced months 0..12 */
export function coverageSamples(finalPct: number, months = LAPSE_MONTHS): number[] {
  return Array.from({ length: months + 1 }, (_, m) => lapseCoverage(finalPct, m / months))
}

/** Fuel gauge fill: need/have; 0..1 normal, >1 overdrawn (capped at 1.2); no fuel at all reads as overdrawn */
export function gaugeFill(needed: number, available: number): number {
  if (needed <= 0) return 0
  if (available <= 0) return 1.2
  return Math.min(1.2, needed / available)
}

export type GaugeTone = 'good' | 'warn' | 'bad'
export function gaugeTone(fill: number): GaugeTone {
  return fill > 1 ? 'bad' : fill > 0.8 ? 'warn' : 'good'
}

/* ------------------------------------------------------------------ */
/* Transfer trail                                                       */
/* ------------------------------------------------------------------ */

type P2 = [number, number]

/** Control points in a frame where Earth = (0,0) and Moon = (1,0) */
const DIRECT_CTRL: P2[] = [
  [0, 0],
  [0.33, 0.035],
  [0.66, 0.06],
  [1, 0],
]
const LOW_ENERGY_CTRL: P2[] = [
  [0, 0],
  [0.3, 0.38],
  [0.85, 0.86],
  [1.4, 0.8],
  [1.55, 0.4],
  [1.3, 0.0],
  [1, 0],
]

function catmull(ctrl: P2[], n: number): P2[] {
  const out: P2[] = []
  const segs = ctrl.length - 1
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * segs
    const s = Math.min(segs - 1, Math.floor(t))
    const f = t - s
    const p0 = ctrl[Math.max(0, s - 1)]
    const p1 = ctrl[s]
    const p2 = ctrl[s + 1]
    const p3 = ctrl[Math.min(ctrl.length - 1, s + 2)]
    const pt = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f)
    out.push([pt(p0[0], p1[0], p2[0], p3[0]), pt(p0[1], p1[1], p2[1], p3[1])])
  }
  return out
}

export const TRAIL_POINTS = 96
const DIRECT_PATH = catmull(DIRECT_CTRL, TRAIL_POINTS)
const LOW_PATH = catmull(LOW_ENERGY_CTRL, TRAIL_POINTS)

/** Trail in the Earth(0,0) -> Moon(1,0) frame, morphing from Direct (u=0) to Low-energy (u=1) */
export function trailPath(u: number): P2[] {
  const k = clamp(u)
  return DIRECT_PATH.map((a, i) => [a[0] + (LOW_PATH[i][0] - a[0]) * k, a[1] + (LOW_PATH[i][1] - a[1]) * k] as P2)
}

/** How far the player pulled the trail sideways (peak y' in the Earth->Moon frame) -> morph u: straight = Direct, pulled out = Low-energy */
export function pullToMorph(peakY: number): number {
  return clamp((peakY - 0.1) / 0.45)
}

/** Index of the trail point closest to (x, y) in the Earth -> Moon frame */
export function nearestIndex(path: P2[], x: number, y: number): number {
  let best = 0
  let bd = Infinity
  for (let i = 0; i < path.length; i++) {
    const d = (path[i][0] - x) ** 2 + (path[i][1] - y) ** 2
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return best
}

export const TRAIL_CAPTURE = 0.3

/** Magnetic snap of the trail morph to Direct (0) or Low-energy (1) */
export function trailMagnet(u: number): {
  shown: number
  pick: TransferId
  seated: boolean
} {
  const k = clamp(u)
  const pick: TransferId = k >= 0.5 ? 'transfer-low-energy' : 'transfer-direct'
  const target = pick === 'transfer-low-energy' ? 1 : 0
  const d = Math.abs(k - target)
  const pull = d >= TRAIL_CAPTURE ? 0 : smooth(1 - d / TRAIL_CAPTURE)
  const seated = d <= 0.06
  return {
    shown: seated ? target : k + (target - k) * pull * 0.85,
    pick,
    seated,
  }
}

/** Plain-English trip time: direct is days, low-energy is months */
export function tripText(months: number | null, transferId: string): string {
  if (months === null) return 'cannot brake'
  if (transferId === 'transfer-direct' && months === 0) return '5 days'
  if (months === 0) return 'days'
  return `${months} month${months === 1 ? '' : 's'}`
}

export function transferName(id: string): string {
  return getTransferById(id)?.type === 'direct' ? 'Direct' : 'Low-energy'
}

/* ------------------------------------------------------------------ */
/* Result                                                               */
/* ------------------------------------------------------------------ */

export interface ResultArgs {
  orbit: Candidate
  transfer: Candidate
  durationS: number
}

export function buildResult({ orbit, transfer, durationS }: ResultArgs): MinigameResult {
  const room = 'flight-dynamics' as const
  const fam = familyById(orbit.orbitId)
  const shadow = orbit.eclipseMin > 0 ? `${orbit.eclipseMin}-min eclipses` : 'no eclipses'
  const insights: Insight[] = [
    {
      id: 'orbit-coverage',
      room,
      text: `${fam.short}: ${orbit.coveragePct}% polar coverage, ${shadow} and ${orbit.blackoutPct}% comm blackout.`,
      metric: { label: 'coverage', value: orbit.coveragePct, unit: '%' },
    },
    {
      id: 'orbit-dv-margin',
      room,
      text:
        transfer.captureDv === null
          ? `This engine has no way to brake into ${fam.short.toLowerCase()} on a ${transferName(transfer.transferId).toLowerCase()} transfer.`
          : transfer.dvMargin >= 0
            ? `The ${transferName(transfer.transferId).toLowerCase()} transfer into ${fam.short.toLowerCase()} leaves ${transfer.dvMargin} m/s of fuel to spare.`
            : `The ${transferName(transfer.transferId).toLowerCase()} transfer into ${fam.short.toLowerCase()} is ${-transfer.dvMargin} m/s short of fuel.`,
      metric: {
        label: 'delta-v margin',
        value: transfer.captureDv === null ? 0 : transfer.dvMargin,
        unit: 'm/s',
      },
    },
    {
      id: 'transfer-time',
      room,
      text:
        transfer.transferMonths === null
          ? 'This engine cannot brake into the Moon on that route.'
          : `${transferName(transfer.transferId)} transfer: ${tripText(transfer.transferMonths, transfer.transferId)} to reach the Moon.`,
      metric: {
        label: 'transfer time',
        value: transfer.transferMonths ?? 0,
        unit: 'months',
      },
    },
  ]
  return {
    patch: { orbit: orbit.orbitId, transfer: transfer.transferId },
    insights,
    durationS,
  }
}
