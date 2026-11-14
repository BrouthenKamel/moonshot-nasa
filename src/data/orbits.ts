import { z } from 'zod'

/**
 * Lunar science orbits, all polar. Values from the logic map: the halo loop is
 * Lunar Flashlight's plan, the elliptical orbit LunaH-Map's, the low circular
 * orbit Lunar Prospector's and KPLO's.
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
    id: 'orbit-elliptical',
    name: 'Elliptical Polar (15 x 3,150 km)',
    altitude: 15,
    farPointKm: 3150,
    type: 'elliptical',
    description:
      "LunaH-Map's plan: swoops to 15 km over the pole about 141 times a month. Many low passes, but costly to reach.",
    flownBy: 'LunaH-Map (planned)',
    passesPerTurn: 141,
    sunlitShare: 0.85,
    eclipseHours: 0.6,
    earthVisible: 0.8,
    stationKeepingDeltaV: 5,
    observingShare: 0.08,
    insertionDeltaV: { electric_low_energy: 1000 },
  },
  {
    id: 'orbit-100km',
    name: 'Low Circular Polar (100 km)',
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

export function getOrbitById(id: string): LunarOrbit | undefined {
  return lunarOrbits.find((o) => o.id === id)
}
