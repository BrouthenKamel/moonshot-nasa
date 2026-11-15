import { z } from 'zod'
import { modelConstants } from './brief'

/**
 * Lunar science orbits, all polar. Values from the logic map: the halo loop is
 * Lunar Flashlight's plan, the elliptical orbit LunaH-Map's, the 100 km circular
 * orbit Lunar Prospector's and KPLO's. "Low" is kept for the 15 km passes over the pole.
 */
export const LunarOrbitSchema = z.object({
  id: z.string(),
  name: z.string(),
  altitude: z.number(), // km over the south pole
  farPointKm: z.number().nullable(), // far point of the orbit; equal to altitude when circular
  type: z.enum(['circular', 'elliptical', 'halo']),
  description: z.string(),
  flownBy: z.string(),
  passesPerTurn: z.number(), // passes over the polar region per turn
  sunlitShare: z.number(), // share of each orbit in sunlight
  eclipseHours: z.number(), // longest shadow per orbit
  earthVisible: z.number(), // share of the time Earth is in view
  stationKeepingDeltaV: z.number(), // m/s per turn to hold the orbit
  observingShare: z.number(), // share of each orbit spent observing the pole
  /** Fixed insertion delta-v (m/s) by engine and transfer; missing keys are computed from vis-viva */
  insertionDeltaV: z.record(z.string(), z.number()),
})
export type LunarOrbit = z.infer<typeof LunarOrbitSchema>

export const lunarOrbits: LunarOrbit[] = [
  {
    id: 'orbit-halo',
    name: 'Halo Loop (15 km over the pole)',
    altitude: 15,
    farPointKm: null,
    type: 'halo',
    description:
      "Lunar Flashlight's plan: a long loop that dips to 15 km over the south pole once a week. Cheap to reach and hold, but few passes.",
    flownBy: 'Lunar Flashlight (planned)',
    passesPerTurn: 4.5,
    sunlitShare: 1.0,
    eclipseHours: 0,
    earthVisible: 0.95,
    stationKeepingDeltaV: 1,
    observingShare: 0.01,
    insertionDeltaV: { chemical_direct: 430, chemical_low_energy: 60, electric_low_energy: 250 },
  },
  {
    id: 'orbit-100km',
    name: 'Circular Polar (100 km)',
    altitude: 100,
    farPointKm: 100,
    type: 'circular',
    description:
      "Lunar Prospector's and KPLO's orbit. Passes the pole every two hours, but 100 km is too high for the ice instruments, and getting there takes a lot of delta-v.",
    flownBy: 'Lunar Prospector, KPLO',
    passesPerTurn: 366,
    sunlitShare: 0.6,
    eclipseHours: 0.8,
    earthVisible: 0.6,
    stationKeepingDeltaV: 6.25,
    observingShare: 0.1,
    insertionDeltaV: { electric_low_energy: 1700 },
  },
]

/* ------------------------------------------------------------------ */
/* Polar orbits at any height over the pole (the Orbit step's drag)    */
/* ------------------------------------------------------------------ */

/** Below this the craft hits crater rims, and lumpy gravity drags it down within days */
export const ORBIT_MIN_KM = 10
/** Above this Earth's pull bends the orbit until it is lost */
export const ORBIT_MAX_KM = 5000
/**
 * Far side of the orbit, as LunaH-Map planned (15 x 3,150 km): a lopsided orbit is far cheaper to
 * brake into and to hold than a circle at the same low height. Above it the orbit is a circle.
 */
export const ORBIT_FAR_KM = 3150
/** The ice instruments work only this low (laser 20 km, neutron 25 km) */
const ICE_LIMIT_KM = 25

const POLAR = /^orbit-polar-(\d+)$/

/** Id of the polar orbit whose low point over the south pole is `km`; clamped to the safe range */
export function polarOrbitId(km: number): string {
  return `orbit-polar-${Math.round(Math.min(ORBIT_MAX_KM, Math.max(ORBIT_MIN_KM, km)))}`
}

/** Low point of a polar orbit id, or null for any other orbit */
export function polarOrbitKm(id: string): number | null {
  const m = POLAR.exec(id)
  return m ? Number(m[1]) : null
}

/** Time once round, in hours (Kepler's third law); a halo loop takes about a week */
export function orbitPeriodHours(orbit: LunarOrbit): number {
  if (orbit.type === 'halo') return 6.5 * 24
  const { moonMu, moonRadiusKm } = modelConstants
  const far = orbit.farPointKm ?? orbit.altitude
  const a = moonRadiusKm + (orbit.altitude + far) / 2
  return (2 * Math.PI * Math.sqrt(a ** 3 / moonMu)) / 3600
}

/** Mean anomaly reached at true anomaly nu (time along an ellipse from the low point) */
function meanAt(nu: number, e: number): number {
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2))
  return E - e * Math.sin(E)
}

/**
 * A polar orbit with its low point `km` over the south pole and its far point at ORBIT_FAR_KM
 * (a circle once the low point is that high), worked out from physics:
 * - one pass over the south pole per revolution; the period follows Kepler's third law;
 * - the share of each orbit spent within 18° of the pole, moving fastest there (Kepler's second law);
 * - with the Sun in the orbit plane, the Moon's shadow is crossed at the mean distance (for a circle
 *   this gives the 100 km orbit's 60% sunlight and 0.8 h eclipse); Earth is hidden as long;
 * - holding a low orbit against the Moon's lumpy gravity (mascons) costs 6.25 m/s a month at
 *   100 km (Lunar Prospector) and much more lower down; a lopsided orbit spends little time
 *   low, so it costs far less (LunaH-Map's 15 x 3,150 km: about 5 m/s).
 */
export function polarOrbit(km: number): LunarOrbit {
  const { moonMu, moonRadiusKm: R } = modelConstants
  const low = Math.min(ORBIT_MAX_KM, Math.max(ORBIT_MIN_KM, Math.round(km)))
  const far = Math.max(low, ORBIT_FAR_KM)
  const rp = R + low
  const ra = R + far
  const a = (rp + ra) / 2
  const e = (ra - rp) / (ra + rp)
  const periodH = (2 * Math.PI * Math.sqrt(a ** 3 / moonMu)) / 3600
  // Shadow crossed at the mean distance, at the mean speed (exact for a circle)
  const shadowH = Math.min(periodH * 0.5, (2 * Math.asin(R / a) * a) / Math.sqrt(moonMu / a) / 3600)
  const lit = Math.round((1 - shadowH / periodH) * 1000) / 1000
  const nearPole = (2 * meanAt((18 * Math.PI) / 180, e)) / (2 * Math.PI)
  const circular = low >= far
  const holding = 6.25 * (100 / low) ** 1.2 * (1 - e) ** 4
  return {
    id: polarOrbitId(low),
    name: circular ? `Circular Polar (${low.toLocaleString('en-US')} km)` : `Polar ${low} × ${far.toLocaleString('en-US')} km`,
    altitude: low,
    farPointKm: far,
    type: circular ? 'circular' : 'elliptical',
    description:
      low <= ICE_LIMIT_KM
        ? 'Low enough over the pole for the ice instruments.'
        : low <= 150
          ? 'Too high over the pole for the ice instruments.'
          : 'Far too high to see any ice.',
    flownBy: low <= ICE_LIMIT_KM ? 'LunaH-Map (planned 15 × 3,150 km)' : circular ? 'Lunar relay orbits' : 'Lunar Prospector, KPLO (low phase)',
    passesPerTurn: Math.round((30 * 24) / periodH),
    sunlitShare: lit,
    eclipseHours: Math.round(shadowH * 100) / 100,
    earthVisible: lit,
    stationKeepingDeltaV: Math.round(Math.min(80, Math.max(0.5, holding)) * 100) / 100,
    observingShare: Math.round(nearPole * 1000) / 1000,
    insertionDeltaV: {},
  }
}

/**
 * LunaH-Map's planned 15 x 3,150 km orbit, by name. It is the polar orbit the Orbit step's slider
 * makes at 15 km, worked out the same way, so a craft has the same numbers whichever way it was
 * chosen (before 15 Nov it had its own hand-entered figures: 141 passes, 1,000 m/s for an ion engine).
 */
export const ellipticalOrbit: LunarOrbit = {
  ...polarOrbit(15),
  id: 'orbit-elliptical',
  name: 'Elliptical Polar (15 x 3,150 km)',
  description: "LunaH-Map's plan: swoops to 15 km over the pole about 150 times a month. Many low passes, but costly to reach.",
  flownBy: 'LunaH-Map (planned)',
}
lunarOrbits.splice(1, 0, ellipticalOrbit)

/**
 * An orbit in words by its height, not its family: "15 km over the pole, far side 3,150 km".
 * Used wherever a player-facing line names the orbit they chose.
 */
export function orbitHeightText(orbit: LunarOrbit): string {
  const km = (n: number) => `${n.toLocaleString('en-US')} km`
  const far = orbit.farPointKm
  if (orbit.type === 'halo') return `a loop dipping to ${km(orbit.altitude)} over the pole`
  if (far === null || far <= orbit.altitude) return `${km(orbit.altitude)} over the pole (a circle)`
  return `${km(orbit.altitude)} over the pole (far side ${km(far)})`
}

export function getOrbitById(id: string): LunarOrbit | undefined {
  const fixed = lunarOrbits.find((o) => o.id === id)
  if (fixed) return fixed
  const km = polarOrbitKm(id)
  return km === null ? undefined : polarOrbit(km)
}
