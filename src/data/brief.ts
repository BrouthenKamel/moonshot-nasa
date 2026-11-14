import { z } from 'zod'

/** Difficulty presets */
export const DifficultySchema = z.enum(['cadet', 'engineer', 'flight-director'])
export type Difficulty = z.infer<typeof DifficultySchema>

export interface DifficultyPreset {
  id: Difficulty
  name: string
  description: string
  budgetCap: number // $M
  dataTarget: number // MB of science data on the ground
  eventOddsMultiplier: number // 1.0 = normal
  showExplanations: boolean
}

/**
 * Engineer is the brief from the logic map: 25 M, about what Lunar IceCube cost.
 * Cadet gives room for an electric design with margin; Flight Director leaves
 * only the cheapest families (chemical engine to the halo loop).
 */
export const difficultyPresets: Record<Difficulty, DifficultyPreset> = {
  cadet: {
    id: 'cadet',
    name: 'Cadet',
    description: 'Generous budget, half the bad luck, full explanations',
    budgetCap: 28,
    dataTarget: 300,
    eventOddsMultiplier: 0.5,
    showExplanations: true,
  },
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    description: 'The real brief: a Lunar IceCube-sized budget',
    budgetCap: 25,
    dataTarget: 300,
    eventOddsMultiplier: 1.0,
    showExplanations: false,
  },
  'flight-director': {
    id: 'flight-director',
    name: 'Flight Director',
    description: 'Tight budget and more things go wrong',
    budgetCap: 22,
    dataTarget: 300,
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
    "A 6U CubeSat mission to map water ice in permanently shadowed craters at the Moon's south pole.",
  objective:
    'Detect and map the distribution of water ice in shadowed craters near the lunar south pole to support future human exploration.',
  requirements: [
    {
      id: 'capture',
      name: 'Lunar Orbit Insertion',
      description: 'Reach lunar orbit with your own propulsion',
      type: 'capture',
      target: 1, // binary: 1 = success
      unit: '',
    },
    {
      id: 'coverage',
      name: 'Ice Coverage',
      description:
        'Map at least 70% of the south polar region with an instrument that sees into shadow. Coverage only counts once its data is on the ground.',
      type: 'coverage',
      target: 70,
      unit: '%',
    },
    {
      id: 'data',
      name: 'Science Data Return',
      description: 'Get science data home (camera pictures do not count)',
      type: 'data',
      target: 300, // overridden by difficulty
      unit: 'MB',
    },
    {
      id: 'lifetime',
      name: 'Mission Lifetime',
      description: 'Operate for 12 months in the science orbit',
      type: 'lifetime',
      target: 12,
      unit: 'turns',
    },
    {
      id: 'budget',
      name: 'Budget Compliance',
      description: 'Never overdraw the reserve',
      type: 'budget',
      target: 1, // binary: 1 = within budget
      unit: '',
    },
  ],
  constraints: {
    maxVolume: 6, // 6U CubeSat
    maxMass: 14, // kg (Lunar IceCube, Lunar Flashlight, LunaH-Map were all about 14 kg)
    formFactor: '6U CubeSat (10 x 20 x 30 cm)',
  },
  defaultRideTurn: 8,
  missionDurationTurns: 12,
}

/** Turn and timeline constants */
export const turnConstants = {
  monthsPerTurn: 1,
  minTestTurns: 0,
  maxTestTurns: 3,
  recommendedReservePercent: 10, // CubeSat 101
  waitingTeamCostPerTurn: 0.5, // $M per turn while waiting for the next ride
}

/** Score weights (out of 1000 total) */
export const scoreWeights = {
  coverage: 400,
  data: 250,
  lifetime: 150,
  context: 100,
  money: 100,
}

/** Captured with at least this share of the coverage or data target counts as partial success */
export const partialShare = 0.5

/** Turns before the programme is closed whatever happens */
export const programmeHorizonTurns = 45

/** Model constants from the logic map (G = game value, S = sourced, D = derived) */
export const modelConstants = {
  designTurns: 1, // G
  integrationTurns: 1, // G
  effortPerTurn: 10, // G
  teamCostPrelaunch: 0.5, // G, $M per turn
  teamCostFlight: 0.3, // G, $M per turn
  testCost: 0.4, // G, $M per test turn
  testFactor: [2.0, 1.4, 1.0, 0.7] as const, // G, failure-odds factor by test turns 0..3
  usableBatteryShare: 0.8, // G
  thrustPowerShare: 0.75, // G, reproduces Lunar IceCube needing 120 W
  thrustDuty: 0.6, // G, reproduces Lunar IceCube's 9-month plan
  cruiseTurns: 4, // S, CAPSTONE took 12 to 20 weeks
  spiralFreeDeltaV: 100, // G, m/s the low-energy path gives for free
  arrivalExcessSpeedKms: 0.85, // D
  courseCorrectionDirect: 30, // G, m/s
  courseCorrectionLowEnergy: 50, // G, m/s
  longEclipseHours: 3, // G
  greenMargin: 0.15, // G, CubeSat 101: at least 10% reserve
  massGreenMargin: 0.08, // mass only: at 15% nearly every design warned (playtest, 14 Nov)
  electricNavCost: 0.1, // G, $M per turn of electric transfer
  extensionMaxTurns: 12, // G
  progressMinCoverage: 0.5, // percentage points per turn
  progressMinData: 1, // MB per turn
  g0: 9.80665,
  turnSeconds: 30 * 86400,
  moonMu: 4902.8, // km3/s2
  moonRadiusKm: 1737.4,
}
