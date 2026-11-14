import { z } from 'zod'

/** Reference mission data for comparison */
export const ReferenceMissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  agency: z.string(),
  launchYear: z.number(),
  status: z.enum(['success', 'partial', 'failed', 'ongoing']),
  description: z.string(),
  // Mission parameters
  size: z.string(),
  mass: z.number(), // kg
  cost: z.number(), // $M (estimated)
  missionDuration: z.string(),
  orbit: z.string(),
  // Performance
  instruments: z.array(z.string()),
  scienceObjective: z.string(),
  dataReturned: z.string(),
  keyAchievements: z.array(z.string()),
  lessonsLearned: z.array(z.string()),
  // Sources
  nasaFactSheet: z.string().optional(),
})
export type ReferenceMission = z.infer<typeof ReferenceMissionSchema>

export const referenceMissions: ReferenceMission[] = [
  {
    id: 'lunar-icecube',
    name: 'Lunar IceCube',
    agency: 'NASA / Morehead State University',
    launchYear: 2022,
    status: 'failed',
    description:
      'A 6U CubeSat designed to search for water ice and other volatiles on the Moon using an IR spectrometer.',
    size: '6U CubeSat',
    mass: 14,
    cost: 9.4, // estimated
    missionDuration: 'Planned 6 months in lunar orbit',
    orbit: '100 km polar lunar orbit (planned)',
    instruments: ['BIRCHES IR Spectrometer'],
    scienceObjective:
      'Map water ice distribution and investigate the lunar water cycle.',
    dataReturned: 'None - communication lost after deployment',
    keyAchievements: [
      'First university-built CubeSat to attempt lunar orbit',
      'Demonstrated compact IR spectrometer technology',
    ],
    lessonsLearned: [
      'CubeSat communication systems need robust autonomous recovery',
      'Secondary payload deployment timing is critical',
    ],
    nasaFactSheet: 'https://www.nasa.gov/mission/lunar-icecube/',
  },
  {
    id: 'lunar-flashlight',
    name: 'Lunar Flashlight',
    agency: 'NASA JPL / Georgia Tech',
    launchYear: 2022,
    status: 'failed',
    description:
      'A 6U CubeSat using laser reflectometers to detect water ice in permanently shadowed craters.',
    size: '6U CubeSat',
    mass: 14,
    cost: 9.8, // estimated
    missionDuration: 'Planned 2 months in lunar orbit',
    orbit: 'Near-rectilinear halo orbit (planned)',
    instruments: ['Four-laser reflectometer'],
    scienceObjective:
      'Locate ice deposits in permanently shadowed craters near the lunar south pole.',
    dataReturned: 'None - thruster issues prevented orbit insertion',
    keyAchievements: [
      'First use of green propellant on a CubeSat',
      'Advanced miniaturized laser technology',
    ],
    lessonsLearned: [
      'Propulsion system qualification is critical for CubeSats',
      'Thruster fuel feed systems need extensive ground testing',
    ],
    nasaFactSheet: 'https://www.jpl.nasa.gov/missions/lunar-flashlight/',
  },
  {
    id: 'lro',
    name: 'Lunar Reconnaissance Orbiter',
    agency: 'NASA GSFC',
    launchYear: 2009,
    status: 'ongoing',
    description:
      'A large robotic spacecraft that has been mapping the Moon in unprecedented detail since 2009.',
    size: 'Large spacecraft',
    mass: 1916,
    cost: 504, // mission cost
    missionDuration: '15+ years (ongoing)',
    orbit: '50 km polar lunar orbit',
    instruments: [
      'LROC (cameras)',
      'LOLA (laser altimeter)',
      'LAMP (UV spectrograph)',
      'CRaTER (radiation)',
      'Diviner (thermal)',
      'LEND (neutron)',
      'Mini-RF (radar)',
    ],
    scienceObjective:
      'Create high-resolution maps of the Moon to support future exploration.',
    dataReturned: '1+ petabyte of data',
    keyAchievements: [
      'Most detailed maps of the lunar surface ever created',
      'Found evidence of water ice in permanently shadowed craters',
      'Photographed Apollo landing sites',
      'Operating for over 15 years beyond initial 1-year mission',
    ],
    lessonsLearned: [
      'Robust engineering enables extended missions',
      'Multiple instruments provide complementary data',
    ],
    nasaFactSheet: 'https://lunar.gsfc.nasa.gov/',
  },
]

/**
 * Compare player mission to reference missions
 */
export interface ComparisonRow {
  metric: string
  playerValue: string
  lunarIcecube: string
  lunarFlashlight: string
  lro: string
}

export function generateComparison(
  playerMass: number,
  playerCost: number,
  playerDataGB: number,
  playerOutcome: 'success' | 'partial' | 'failed'
): ComparisonRow[] {
  return [
    {
      metric: 'Size',
      playerValue: '6U CubeSat',
      lunarIcecube: '6U CubeSat',
      lunarFlashlight: '6U CubeSat',
      lro: 'Large spacecraft',
    },
    {
      metric: 'Mass',
      playerValue: `${playerMass.toFixed(1)} kg`,
      lunarIcecube: '14 kg',
      lunarFlashlight: '14 kg',
      lro: '1916 kg',
    },
    {
      metric: 'Cost',
      playerValue: `$${playerCost.toFixed(1)}M`,
      lunarIcecube: '$9.4M',
      lunarFlashlight: '$9.8M',
      lro: '$504M',
    },
    {
      metric: 'Data Returned',
      playerValue: `${playerDataGB.toFixed(1)} GB`,
      lunarIcecube: '0 GB',
      lunarFlashlight: '0 GB',
      lro: '1+ PB',
    },
    {
      metric: 'Outcome',
      playerValue: playerOutcome,
      lunarIcecube: 'failed',
      lunarFlashlight: 'failed',
      lro: 'ongoing success',
    },
  ]
}

export function getReferenceMissionById(id: string): ReferenceMission | undefined {
  return referenceMissions.find((m) => m.id === id)
}
