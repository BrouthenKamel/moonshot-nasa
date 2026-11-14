import { z } from 'zod'

/**
 * Rideshare launches. The lunar ride is the brief's (turn 8, dropped on a
 * trans-lunar path, as Artemis I dropped Lunar IceCube and LunaH-Map).
 * The other two are game values that trade cost against delta-v and time.
 */
export const RideSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  departureTurn: z.number(),
  cost: z.number(), // $M ride fee
  massLimit: z.number(), // kg
  dropOffOrbit: z.enum(['trans-lunar', 'gto', 'lunar-vicinity']),
  extraDeltaV: z.number(), // m/s to climb from the drop-off to a trans-lunar path
  insertionFactor: z.number(), // multiplies the capture delta-v (1 = from a trans-lunar path)
  cruiseTurns: z.number(), // turns of coasting on a low-energy transfer before the capture
  requiredDeltaV: z.number(), // shown: extra delta-v before the capture burn
  electricCompatible: z.boolean(),
  chemicalCompatible: z.boolean(),
})
export type Ride = z.infer<typeof RideSchema>

export const rides: Ride[] = [
  {
    id: 'ride-gto',
    name: 'GTO Rideshare',
    description:
      'The lowest fee, but it drops you in geostationary transfer orbit, far from the Moon, and leaves early (turn 6). Only an ion engine can climb out, which adds about 1,500 m/s and many months of transfer, and every month costs team and ground time.',
    departureTurn: 6,
    cost: 0.8,
    massLimit: 16,
    dropOffOrbit: 'gto',
    extraDeltaV: 1500,
    insertionFactor: 1,
    cruiseTurns: 4,
    requiredDeltaV: 1500,
    electricCompatible: true,
    chemicalCompatible: false,
  },
  {
    id: 'ride-lunar',
    name: 'Lunar Rideshare',
    description:
      'The brief\'s ride: a Moon launch that drops CubeSats on a trans-lunar path, as Artemis I did. From there your own engine has to capture into orbit.',
    departureTurn: 8,
    cost: 1.5,
    massLimit: 14,
    dropOffOrbit: 'trans-lunar',
    extraDeltaV: 0,
    insertionFactor: 1,
    cruiseTurns: 4,
    requiredDeltaV: 0,
    electricCompatible: true,
    chemicalCompatible: true,
  },
  {
    id: 'ride-commercial',
    name: 'Commercial Lunar Express',
    description:
      'A commercial lander that releases you close to the Moon: the capture burn is less than half, but it costs more, leaves later and takes less mass.',
    departureTurn: 10,
    cost: 3.5,
    massLimit: 12,
    dropOffOrbit: 'lunar-vicinity',
    extraDeltaV: 0,
    insertionFactor: 0.4,
    cruiseTurns: 1,
    requiredDeltaV: 0,
    electricCompatible: true,
    chemicalCompatible: true,
  },
]

/** Next ride after missing the current one */
export const missedRideWaitTurns = 6

export function getRideById(id: string): Ride | undefined {
  return rides.find((r) => r.id === id)
}
