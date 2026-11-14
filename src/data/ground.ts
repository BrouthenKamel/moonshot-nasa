import { z } from 'zod'

/** Ground station options */
export const GroundStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  setupCost: z.number(), // $M one-time
  costPerTurn: z.number(), // $M recurring
  contactHoursPerDay: z.number(),
  dataRateMultiplier: z.number(), // multiplier on spacecraft radio data rate
  reliability: z.number(), // 0-1, chance of successful contact each pass
})
export type GroundStation = z.infer<typeof GroundStationSchema>

export const groundStations: GroundStation[] = [
  {
    id: 'ground-small',
    name: 'University Partner Dish',
    description:
      'Partnership with university ground station. Low cost but limited contact time and lower data rates.',
    setupCost: 0.1,
    costPerTurn: 0.05,
    contactHoursPerDay: 2,
    dataRateMultiplier: 0.5,
    reliability: 0.90,
  },
  {
    id: 'ground-medium',
    name: 'Commercial Ground Network',
    description:
      'Commercial ground station network. Good coverage and data rates at moderate cost.',
    setupCost: 0.3,
    costPerTurn: 0.15,
    contactHoursPerDay: 6,
    dataRateMultiplier: 1.0,
    reliability: 0.95,
  },
  {
    id: 'ground-dsn',
    name: 'Deep Space Network Time',
    description:
      'Rented time on NASA\'s Deep Space Network. Excellent performance but expensive and limited availability.',
    setupCost: 0.5,
    costPerTurn: 0.4,
    contactHoursPerDay: 4,
    dataRateMultiplier: 2.0,
    reliability: 0.99,
  },
]

/**
 * Calculate data downlinked per turn
 * @param radioDataRate - kbps from spacecraft radio
 * @param groundStation - selected ground station
 * @param orbitContactMinutes - contact window per orbit from orbit selection
 * @param orbitsPerDay - roughly 12 for a 2-hour lunar orbit
 * @returns GB per turn (30 days)
 */
export function calculateDownlinkPerTurn(
  radioDataRate: number,
  groundStation: GroundStation,
  orbitContactMinutes: number
): number {
  // Assume ~12 orbits per day where Earth is visible, but ground station only available for contactHoursPerDay
  const effectiveContactHours = Math.min(
    groundStation.contactHoursPerDay,
    (orbitContactMinutes / 60) * 12 // max possible based on orbit
  )

  // Effective data rate
  const effectiveRateKbps = radioDataRate * groundStation.dataRateMultiplier

  // Data per day in GB
  const dataPerDayGB = (effectiveRateKbps * effectiveContactHours * 3600) / (8 * 1024 * 1024)

  // Data per turn (30 days), accounting for reliability
  return dataPerDayGB * 30 * groundStation.reliability
}

export function getGroundStationById(id: string): GroundStation | undefined {
  return groundStations.find((g) => g.id === id)
}
