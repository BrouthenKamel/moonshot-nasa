/**
 * Data source citations for all game values.
 * Each value is tagged as 'sourced' (from NASA/real mission data) or 'gameplay-tuned'.
 */

export type SourceTag = 'sourced' | 'gameplay-tuned'

export interface DataSource {
  tag: SourceTag
  reference: string
  notes?: string
}

export const sources = {
  // Parts catalog
  cubesat6uMass: {
    tag: 'sourced',
    reference: 'CubeSat 101: Basic Concepts and Processes for First-Time CubeSat Developers',
    notes: '6U bus typically 8-14 kg total mass',
  },
  solarPanelPower: {
    tag: 'sourced',
    reference: 'CubeSat 101, Section 5.2 Power Systems',
    notes: 'Deployable panels ~30W per wing for 6U',
  },
  ionThrusterIsp: {
    tag: 'sourced',
    reference: 'Busek BIT-3 iodine ion thruster, as flown on Lunar IceCube',
    notes: 'Isp ~2200s for iodine propulsion (Lunar Flashlight flew green-propellant thrusters, not BIT-3)',
  },
  chemicalThrusterIsp: {
    tag: 'sourced',
    reference: 'CubeSat 101, Section 5.4 Propulsion',
    notes: 'Hydrazine or green propellant ~220-230s Isp',
  },
  irSpectrometerSpecs: {
    tag: 'sourced',
    reference: 'Lunar IceCube BIRCHES instrument specifications',
    notes: 'Broadband IR Compact High-resolution Exploration Spectrometer',
  },
  laserReflectometerSpecs: {
    tag: 'sourced',
    reference: 'Lunar Flashlight mission specifications',
    notes: 'Four-laser reflectometer for ice detection in shadowed craters',
  },

  // Orbits and trajectories
  lunarPolarOrbit: {
    tag: 'sourced',
    reference: 'LRO mission parameters, NASA GSFC',
    notes: 'LRO operates at 50km polar orbit',
  },
  deltaVLunarCapture: {
    tag: 'sourced',
    reference: 'GMAT lunar transfer sample scenarios',
    notes: 'Lunar orbit insertion ~800-1000 m/s from trans-lunar injection',
  },
  lowEnergyTransfer: {
    tag: 'sourced',
    reference: 'Lunar IceCube trajectory design',
    notes: 'Weak stability boundary transfer, 3-6 month duration',
  },

  // Mission costs
  cubesatCost: {
    tag: 'gameplay-tuned',
    reference: 'Game value: a small lunar CubeSat budget ($25M cap)',
    notes: 'Not from CubeSat 101, which gives no lunar mission costs; part prices are tuned for play',
  },
  dsnCost: {
    tag: 'gameplay-tuned',
    reference: 'Deep Space Network scheduling costs',
    notes: 'Simplified for gameplay, actual costs vary widely',
  },

  // Events
  cloggedThruster: {
    tag: 'sourced',
    reference: 'Lunar Flashlight mission anomaly reports',
    notes: 'Thruster blockage prevented lunar orbit insertion',
  },
  lostContact: {
    tag: 'sourced',
    reference: 'Lunar IceCube mission status',
    notes: 'Communication lost shortly after deployment',
  },

  // Balance values
  budgetCaps: {
    tag: 'gameplay-tuned',
    reference: 'Internal balance testing',
    notes: 'Tuned for challenging but achievable gameplay',
  },
  dataTargets: {
    tag: 'gameplay-tuned',
    reference: 'Internal balance testing',
    notes: 'Based on realistic instrument data rates scaled for fun',
  },
  scoreWeights: {
    tag: 'gameplay-tuned',
    reference: 'Internal balance testing',
    notes: 'Emphasizes requirements completion as primary goal',
  },
} as const satisfies Record<string, DataSource>
