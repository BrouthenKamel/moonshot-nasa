/**
 * The Orbit step: one draggable height, everything else worked out by the logic core.
 * Pure: the dashboard and the 3D view both read this.
 */
import type { Difficulty } from '../../data/brief'
import { ORBIT_FAR_KM, ORBIT_MAX_KM, ORBIT_MIN_KM, getOrbitById, orbitPeriodHours, polarOrbitId } from '../../data/orbits'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import type { Design } from '../../sim/types'

const LOG_MIN = Math.log(ORBIT_MIN_KM)
const LOG_MAX = Math.log(ORBIT_MAX_KM)

/** Drag position 0..1 to height in km: logarithmic, so the low heights that matter get most of the travel */
export function kmAt(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  const km = Math.exp(LOG_MIN + x * (LOG_MAX - LOG_MIN))
  // Round to steps that read well: 1 km low down, 10 km in the hundreds, 50 km above
  return km < 100 ? Math.round(km) : km < 1000 ? Math.round(km / 10) * 10 : Math.round(km / 50) * 50
}

/** Height in km to drag position 0..1 */
export function positionOf(km: number): number {
  return (Math.log(Math.min(ORBIT_MAX_KM, Math.max(ORBIT_MIN_KM, km))) - LOG_MIN) / (LOG_MAX - LOG_MIN)
}

/** Height on screen (in Moon radii above the surface): compressed, so 10 km and 5,000 km both fit */
export function displayHeight(km: number): number {
  return 0.06 + 1.6 * (Math.log10(Math.max(ORBIT_MIN_KM, km) / ORBIT_MIN_KM) / Math.log10(ORBIT_MAX_KM / ORBIT_MIN_KM))
}

export interface OrbitPlan {
  /** Low point over the south pole, km */
  km: number
  farKm: number
  circular: boolean
  periodHours: number
  passesPerMonth: number
  eclipseHours: number
  /** m/s a month to hold the orbit */
  holdPerMonth: number
  /** m/s to brake into the orbit; null = this engine cannot */
  capture: number | null
  /** m/s the tank gives */
  tank: number
  /** Months the propellant left after capture holds the orbit */
  monthsHeld: number
  /** Ice mapped after 12 months, % */
  iceMapped: number
  /** The lowest height limit among the ice instruments (km), or null without one */
  iceLimitKm: number | null
  atFloor: boolean
  atCeiling: boolean
  /** Orbit-related Go / No-Go rows: delta-v, power, science */
  checks: { label: string; status: 'green' | 'yellow' | 'red'; reason: string }[]
}

const ROWS: Record<string, string> = { 'Delta-v': 'Fuel', Power: 'Power', Science: 'Science' }

export function orbitPlan(design: Design, difficulty: Difficulty): OrbitPlan {
  const orbit = getOrbitById(design.orbit) ?? getOrbitById(polarOrbitId(15))!
  const b = computeBudgets(design, difficulty)
  const g = goNoGo(design, b)
  const iceLimits = design.instruments
    .map((id) => getPartById(id) as InstrumentPart | undefined)
    .filter((p): p is InstrumentPart => !!p && p.seesShadow && p.maxAltitudeKm !== null)
    .map((p) => p.maxAltitudeKm as number)
  return {
    km: orbit.altitude,
    farKm: orbit.farPointKm ?? orbit.altitude,
    circular: (orbit.farPointKm ?? orbit.altitude) <= orbit.altitude,
    periodHours: orbitPeriodHours(orbit),
    passesPerMonth: orbit.passesPerTurn,
    eclipseHours: orbit.eclipseHours,
    holdPerMonth: b.deltaVStationKeeping,
    capture: b.captureDeltaV,
    tank: b.deltaVAvailable,
    monthsHeld: b.upkeepTurns,
    iceMapped: b.projectedCoverage,
    iceLimitKm: iceLimits.length ? Math.max(...iceLimits) : null,
    atFloor: orbit.altitude <= ORBIT_MIN_KM,
    atCeiling: orbit.altitude >= ORBIT_MAX_KM,
    checks: g.checks
      .filter((c) => ROWS[c.resource])
      .map((c) => ({ label: ROWS[c.resource], status: c.status, reason: c.reason })),
  }
}

export { ORBIT_FAR_KM, ORBIT_MAX_KM, ORBIT_MIN_KM }
