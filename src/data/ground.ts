import { z } from 'zod'

/**
 * Ground stations. Rates are with the patch antenna from lunar distance
 * (Lunar IceCube: 64 kbps with Morehead's 21 m dish, 128 kbps with a DSN 34 m dish).
 */
export const GroundStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rateKbps: z.number(), // with a patch antenna at lunar distance
  contactHoursPerDay: z.number(), // most hours a day you can book
  defaultHours: z.number(), // hours booked in a new design
  pricePerHour: z.number(), // $M per turn for each booked hour a day
  outageChance: z.number(), // chance per turn of losing half the contact time
  setupCost: z.number(), // $M one-time
})
export type GroundStation = z.infer<typeof GroundStationSchema>

export const groundStations: GroundStation[] = [
  {
    id: 'ground-small',
    name: "Team's Own Dish (about 4 m)",
    description:
      'A small university dish. Cheap and yours all day, but at lunar distance it hears only 2 kbps.',
    rateKbps: 2,
    contactHoursPerDay: 6,
    defaultHours: 6,
    pricePerHour: 0.01,
    outageChance: 0.1,
    setupCost: 0,
  },
  {
    id: 'ground-medium',
    name: 'Partner 21 m Dish',
    description:
      "A partner's large dish, like Morehead State's 21 m antenna that tracked Lunar IceCube. 64 kbps, up to 2 hours a day.",
    rateKbps: 64,
    contactHoursPerDay: 2,
    defaultHours: 1,
    pricePerHour: 0.03,
    outageChance: 0.06,
    setupCost: 0,
  },
  {
    id: 'ground-dsn',
    name: 'Deep Space Network, 34 m',
    description:
      "NASA's Deep Space Network: 128 kbps and very reliable, but expensive and oversubscribed, so an hour a day at most.",
    rateKbps: 128,
    contactHoursPerDay: 1,
    defaultHours: 1,
    pricePerHour: 0.1, // G (0.15 before the balance redesign: it was never worth its price)
    outageChance: 0.02,
    setupCost: 0,
  },
]

export function getGroundStationById(id: string): GroundStation | undefined {
  return groundStations.find((g) => g.id === id)
}
