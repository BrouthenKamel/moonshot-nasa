import { z } from 'zod'

/** Difficulty presets */
export const DifficultySchema = z.enum(['cadet', 'engineer', 'flight-director'])
export type Difficulty = z.infer<typeof DifficultySchema>

export interface DifficultyPreset {
  id: Difficulty
  name: string
  description: string
  budgetCap: number // $M
  dataTarget: number // GB
  eventOddsMultiplier: number // 1.0 = normal
  showExplanations: boolean
}

export const difficultyPresets: Record<Difficulty, DifficultyPreset> = {
  cadet: {
    id: 'cadet',
    name: 'Cadet',
    description: 'Generous budget, fewer events, full explanations',
    budgetCap: 20,
    dataTarget: 8,
    eventOddsMultiplier: 0.5,
    showExplanations: true,
  },
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    description: 'Balanced challenge for experienced players',
    budgetCap: 16,
    dataTarget: 10,
    eventOddsMultiplier: 1.0,
    showExplanations: false,
  },
  'flight-director': {
    id: 'flight-director',
    name: 'Flight Director',
    description: 'Tight budget, frequent events, no hand-holding',
    budgetCap: 13,
    dataTarget: 12,
    eventOddsMultiplier: 1.5,
    showExplanations: false,
  },
}

/** Mission brief for Lunar Ice Mapper */
export interface MissionBrief {
  id: string
  name: string
  description: string
  objective: string
  requirements: MissionRequirement[]
  constraints: MissionConstraints
  defaultRideTurn: number
  missionDurationTurns: number
}

export interface MissionRequirement {
  id: string
  name: string
  description: string
  type: 'coverage' | 'data' | 'lifetime' | 'capture' | 'budget'
  target: number
  unit: string
}

export interface MissionConstraints {
  maxVolume: number // U (CubeSat units)
  maxMass: number // kg
  formFactor: string
}

export const lunarIceMapperBrief: MissionBrief = {
  id: 'lunar-ice-mapper',
  name: 'Lunar Ice Mapper',
  description:
    'A 6U CubeSat mission to map water ice in permanently shadowed craters at the Moon\'s south pole.',
  objective:
    'Detect and map the distribution of water ice in shadowed craters near the lunar south pole to support future human exploration.',
  requirements: [
    {
      id: 'capture',
      name: 'Lunar Orbit Insertion',
      description: 'Successfully capture into lunar polar orbit',
      type: 'capture',
      target: 1, // binary: 1 = success
      unit: '',
    },
    {
      id: 'coverage',
      name: 'Polar Coverage',
      description: 'Map at least 70% of the south polar region',
      type: 'coverage',
      target: 70,
      unit: '%',
    },
    {
      id: 'data',
      name: 'Science Data Return',
      description: 'Return science data to Earth (target varies by difficulty)',
      type: 'data',
      target: 10, // overridden by difficulty
      unit: 'GB',
    },
    {
      id: 'lifetime',
      name: 'Mission Lifetime',
      description: 'Operate for 12 months in lunar orbit',
      type: 'lifetime',
      target: 12,
      unit: 'turns',
    },
    {
      id: 'budget',
      name: 'Budget Compliance',
      description: 'Complete mission within budget cap',
      type: 'budget',
      target: 1, // binary: 1 = within budget
      unit: '',
    },
  ],
  constraints: {
    maxVolume: 6, // 6U CubeSat
    maxMass: 14, // kg
    formFactor: '6U CubeSat (10 x 20 x 30 cm)',
  },
  defaultRideTurn: 8,
  missionDurationTurns: 12,
}

/** Turn and timeline constants */
export const turnConstants = {
  monthsPerTurn: 1,
  minBuildTurns: 3,
  minTestTurns: 1,
  recommendedReservePercent: 10,
  waitingTeamCostPerTurn: 0.2, // $M per turn if you miss the ride
}

/** Score weights (out of 1000 total) */
export const scoreWeights = {
  requirements: 600,
  science: 200,
  efficiency: 100,
  riskHandling: 100,
}
