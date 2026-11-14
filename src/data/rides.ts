import { z } from 'zod'

/** Rideshare launch opportunities */
export const RideSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  departureTurn: z.number(),
  cost: z.number(), // $M
  massLimit: z.number(), // kg
  dropOffOrbit: z.enum(['trans-lunar', 'gto', 'lunar-vicinity']),
  // What the spacecraft needs to do after deployment
  requiredDeltaV: z.number(), // m/s to reach lunar orbit insertion point
  electricCompatible: z.boolean(), // can use slow electric propulsion
  chemicalCompatible: z.boolean(), // can use fast chemical propulsion
})
export type Ride = z.infer<typeof RideSchema>

export const rides: Ride[] = [
  {
    id: 'ride-gto',
    name: 'GTO Rideshare',
    description:
      'Cheaper rideshare to geostationary transfer orbit. Much farther from the Moon, requires significant delta-v. Electric propulsion only realistically.',
    departureTurn: 6,
    cost: 1.5,
    massLimit: 16,
    dropOffOrbit: 'gto',
    requiredDeltaV: 2800, // GTO to lunar orbit is ~2800 m/s
    electricCompatible: true,
    chemicalCompatible: false, // would need too much fuel
  },
  {
    id: 'ride-lunar',
    name: 'Lunar Rideshare',
    description:
      'Standard ride on a Moon-bound mission. Dropped on trans-lunar trajectory, need to capture into lunar orbit.',
    departureTurn: 8,
    cost: 3.0,
    massLimit: 14,
    dropOffOrbit: 'trans-lunar',
    requiredDeltaV: 900, // Trans-lunar to lunar orbit capture
    electricCompatible: true,
    chemicalCompatible: true,
  },
  {
    id: 'ride-commercial',
    name: 'Commercial Lunar Express',
    description:
      'Premium commercial ride that delivers near the Moon. Minimal capture burn required but more expensive and later departure.',
    departureTurn: 10,
    cost: 5.0,
    massLimit: 12,
    dropOffOrbit: 'lunar-vicinity',
    requiredDeltaV: 200, // Already near the Moon, just need final insertion
    electricCompatible: true,
    chemicalCompatible: true,
  },
]

/** Next ride after missing current one */
export const missedRideWaitTurns = 6
export const missedRideTeamCostPerTurn = 0.2 // $M

export function getRideById(id: string): Ride | undefined {
  return rides.find((r) => r.id === id)
}

export function getNextRide(currentTurn: number): Ride | undefined {
  return rides
    .filter((r) => r.departureTurn > currentTurn)
    .sort((a, b) => a.departureTurn - b.departureTurn)[0]
}
