import { z } from 'zod'

/** Lunar science orbit options */
export const LunarOrbitSchema = z.object({
  id: z.string(),
  name: z.string(),
  altitude: z.number(), // km
  type: z.enum(['circular', 'elliptical', 'frozen']),
  description: z.string(),
  // Performance characteristics
  coveragePerTurn: z.number(), // % of polar region per turn
  resolutionFactor: z.number(), // multiplier on instrument resolution (higher = better)
  stationKeepingDeltaV: z.number(), // m/s per turn to maintain orbit
  eclipseFraction: z.number(), // fraction of orbit in shadow (0-1)
  contactWindowMinutes: z.number(), // minutes of Earth visibility per orbit
  orbitPeriodMinutes: z.number(), // orbital period
})
export type LunarOrbit = z.infer<typeof LunarOrbitSchema>

export const lunarOrbits: LunarOrbit[] = [
  {
    id: 'orbit-50km',
    name: 'Low Polar (50 km)',
    altitude: 50,
    type: 'circular',
    description:
      'Very low orbit like LRO. Best resolution but requires significant fuel to maintain.',
    coveragePerTurn: 8,
    resolutionFactor: 2.0,
    stationKeepingDeltaV: 25,
    eclipseFraction: 0.35,
    contactWindowMinutes: 45,
    orbitPeriodMinutes: 118,
  },
  {
    id: 'orbit-100km',
    name: 'Standard Polar (100 km)',
    altitude: 100,
    type: 'circular',
    description: 'Balanced orbit. Good resolution with moderate fuel needs.',
    coveragePerTurn: 6,
    resolutionFactor: 1.5,
    stationKeepingDeltaV: 10,
    eclipseFraction: 0.30,
    contactWindowMinutes: 50,
    orbitPeriodMinutes: 127,
  },
  {
    id: 'orbit-200km',
    name: 'High Polar (200 km)',
    altitude: 200,
    type: 'circular',
    description: 'Higher orbit with wider coverage swaths. Lower resolution but very stable.',
    coveragePerTurn: 5,
    resolutionFactor: 1.0,
    stationKeepingDeltaV: 3,
    eclipseFraction: 0.25,
    contactWindowMinutes: 55,
    orbitPeriodMinutes: 145,
  },
  {
    id: 'orbit-frozen',
    name: 'Frozen Elliptical (15x200 km)',
    altitude: 107, // average
    type: 'frozen',
    description:
      'Frozen orbit with low periapsis over poles. Excellent polar coverage, minimal station-keeping.',
    coveragePerTurn: 7,
    resolutionFactor: 1.8,
    stationKeepingDeltaV: 1,
    eclipseFraction: 0.28,
    contactWindowMinutes: 48,
    orbitPeriodMinutes: 130,
  },
]

/** Delta-v requirements for lunar orbit insertion (m/s) */
export const lunarOrbitInsertionDeltaV: Record<string, number> = {
  'orbit-50km': 850,
  'orbit-100km': 820,
  'orbit-200km': 780,
  'orbit-frozen': 800,
}

export function getOrbitById(id: string): LunarOrbit | undefined {
  return lunarOrbits.find((o) => o.id === id)
}
