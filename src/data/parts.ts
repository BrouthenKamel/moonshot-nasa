import { z } from 'zod'

/** Part categories */
export const PartCategorySchema = z.enum([
  'structure',
  'solar',
  'battery',
  'radio',
  'computer',
  'attitude',
  'propulsion',
  'instrument',
])
export type PartCategory = z.infer<typeof PartCategorySchema>

/** Base part schema */
export const BasePartSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: PartCategorySchema,
  mass: z.number(), // kg
  volume: z.number(), // U
  power: z.number(), // W (negative = draw, positive = generation)
  cost: z.number(), // $M
  buildMonths: z.number(),
  reliability: z.number().min(0).max(1), // 0-1
  description: z.string(),
})
export type BasePart = z.infer<typeof BasePartSchema>

/** Structure parts */
export const StructurePartSchema = BasePartSchema.extend({
  category: z.literal('structure'),
})
export type StructurePart = z.infer<typeof StructurePartSchema>

export const structures: StructurePart[] = [
  {
    id: 'bus-6u',
    name: '6U Bus',
    category: 'structure',
    mass: 1.5,
    volume: 0, // structure doesn't count against payload volume
    power: 0,
    cost: 0.3,
    buildMonths: 1,
    reliability: 0.99,
    description: 'Standard 6U CubeSat bus structure (10x20x30 cm)',
  },
]

/** Solar panel parts */
export const SolarPartSchema = BasePartSchema.extend({
  category: z.literal('solar'),
  powerGeneration: z.number(), // W in full sun
  deployable: z.boolean(),
})
export type SolarPart = z.infer<typeof SolarPartSchema>

export const solarPanels: SolarPart[] = [
  {
    id: 'solar-body',
    name: 'Body-Mounted Panels',
    category: 'solar',
    mass: 0.3,
    volume: 0,
    power: 15, // W generated
    powerGeneration: 15,
    cost: 0.1,
    buildMonths: 1,
    reliability: 0.99,
    deployable: false,
    description: 'Fixed panels on spacecraft body. Low power but no deployment risk.',
  },
  {
    id: 'solar-1wing',
    name: 'Single Deployable Wing',
    category: 'solar',
    mass: 0.5,
    volume: 0.3,
    power: 30,
    powerGeneration: 30,
    cost: 0.2,
    buildMonths: 1,
    reliability: 0.97,
    deployable: true,
    description: 'One deployable solar panel wing. Good power-to-mass ratio.',
  },
  {
    id: 'solar-2wing',
    name: 'Dual Deployable Wings',
    category: 'solar',
    mass: 0.9,
    volume: 0.5,
    power: 60,
    powerGeneration: 60,
    cost: 0.4,
    buildMonths: 2,
    reliability: 0.95,
    deployable: true,
    description: 'Two deployable solar wings. Maximum power for a 6U.',
  },
]

/** Battery parts */
export const BatteryPartSchema = BasePartSchema.extend({
  category: z.literal('battery'),
  capacity: z.number(), // Wh
})
export type BatteryPart = z.infer<typeof BatteryPartSchema>

export const batteries: BatteryPart[] = [
  {
    id: 'battery-small',
    name: 'Small Battery Pack',
    category: 'battery',
    mass: 0.3,
    volume: 0.2,
    power: 0,
    cost: 0.1,
    buildMonths: 1,
    reliability: 0.98,
    capacity: 20,
    description: 'Compact Li-ion pack. Sufficient for short eclipses.',
  },
  {
    id: 'battery-medium',
    name: 'Medium Battery Pack',
    category: 'battery',
    mass: 0.5,
    volume: 0.3,
    power: 0,
    cost: 0.15,
    buildMonths: 1,
    reliability: 0.97,
    capacity: 40,
    description: 'Standard Li-ion pack. Good eclipse margin.',
  },
  {
    id: 'battery-large',
    name: 'Large Battery Pack',
    category: 'battery',
    mass: 0.8,
    volume: 0.5,
    power: 0,
    cost: 0.25,
    buildMonths: 1,
    reliability: 0.96,
    capacity: 80,
    description: 'High-capacity pack for long eclipses or power-hungry instruments.',
  },
]

/** Radio/antenna parts */
export const RadioPartSchema = BasePartSchema.extend({
  category: z.literal('radio'),
  dataRate: z.number(), // kbps
  gain: z.number(), // dBi
  deployable: z.boolean(),
})
export type RadioPart = z.infer<typeof RadioPartSchema>

export const radios: RadioPart[] = [
  {
    id: 'radio-uhf',
    name: 'UHF Transceiver',
    category: 'radio',
    mass: 0.2,
    volume: 0.1,
    power: -2,
    cost: 0.05,
    buildMonths: 1,
    reliability: 0.98,
    dataRate: 9.6, // kbps
    gain: 0,
    deployable: false,
    description: 'Basic UHF radio. Very low data rate, not suitable for science data from the Moon.',
  },
  {
    id: 'radio-sband',
    name: 'S-Band with Patch Antenna',
    category: 'radio',
    mass: 0.4,
    volume: 0.2,
    power: -5,
    cost: 0.2,
    buildMonths: 1,
    reliability: 0.97,
    dataRate: 256, // kbps
    gain: 6,
    deployable: false,
    description: 'S-band radio with patch antenna. Moderate data rate for lunar distance.',
  },
  {
    id: 'radio-xband',
    name: 'X-Band with High-Gain Antenna',
    category: 'radio',
    mass: 0.8,
    volume: 0.4,
    power: -10,
    cost: 0.5,
    buildMonths: 2,
    reliability: 0.95,
    dataRate: 2000, // kbps
    gain: 20,
    deployable: true,
    description: 'X-band radio with deployable high-gain antenna. Best data rate but complex.',
  },
]

/** Computer parts */
export const ComputerPartSchema = BasePartSchema.extend({
  category: z.literal('computer'),
  redundant: z.boolean(),
  storage: z.number(), // GB
})
export type ComputerPart = z.infer<typeof ComputerPartSchema>

export const computers: ComputerPart[] = [
  {
    id: 'computer-basic',
    name: 'Basic Flight Computer',
    category: 'computer',
    mass: 0.2,
    volume: 0.1,
    power: -3,
    cost: 0.1,
    buildMonths: 1,
    reliability: 0.95,
    redundant: false,
    storage: 8,
    description: 'Single-string flight computer. Lower cost but single point of failure.',
  },
  {
    id: 'computer-redundant',
    name: 'Redundant Flight Computer',
    category: 'computer',
    mass: 0.4,
    volume: 0.2,
    power: -5,
    cost: 0.3,
    buildMonths: 2,
    reliability: 0.99,
    redundant: true,
    storage: 16,
    description: 'Dual-redundant flight computer. Higher reliability and more storage.',
  },
]

/** Attitude control parts */
export const AttitudePartSchema = BasePartSchema.extend({
  category: z.literal('attitude'),
  pointingAccuracy: z.number(), // degrees
  hasSunSensors: z.boolean(),
  hasStarTracker: z.boolean(),
})
export type AttitudePart = z.infer<typeof AttitudePartSchema>

export const attitudeControls: AttitudePart[] = [
  {
    id: 'attitude-basic',
    name: 'Basic ADCS',
    category: 'attitude',
    mass: 0.3,
    volume: 0.2,
    power: -2,
    cost: 0.2,
    buildMonths: 1,
    reliability: 0.95,
    pointingAccuracy: 1.0,
    hasSunSensors: true,
    hasStarTracker: false,
    description: 'Magnetorquers and sun sensors. Adequate for most instruments.',
  },
  {
    id: 'attitude-precision',
    name: 'Precision ADCS',
    category: 'attitude',
    mass: 0.6,
    volume: 0.3,
    power: -4,
    cost: 0.5,
    buildMonths: 2,
    reliability: 0.93,
    pointingAccuracy: 0.1,
    hasSunSensors: true,
    hasStarTracker: true,
    description: 'Reaction wheels with star tracker. Required for high-resolution imaging.',
  },
]

/** Propulsion parts */
export const PropulsionPartSchema = BasePartSchema.extend({
  category: z.literal('propulsion'),
  type: z.enum(['electric', 'chemical', 'cold-gas']),
  isp: z.number(), // seconds
  thrust: z.number(), // mN
  propellantMass: z.number(), // kg
  thrustPower: z.number(), // W required during thrusting (0 for chemical)
})
export type PropulsionPart = z.infer<typeof PropulsionPartSchema>

export const propulsionSystems: PropulsionPart[] = [
  {
    id: 'prop-coldgas',
    name: 'Cold Gas Thrusters',
    category: 'propulsion',
    mass: 0.5,
    volume: 0.3,
    power: 0,
    cost: 0.1,
    buildMonths: 1,
    reliability: 0.98,
    type: 'cold-gas',
    isp: 70,
    thrust: 100,
    propellantMass: 0.3,
    thrustPower: 0,
    description: 'Simple cold gas system. Very low delta-v, only for attitude control.',
  },
  {
    id: 'prop-chemical',
    name: 'Green Monopropellant',
    category: 'propulsion',
    mass: 1.2,
    volume: 0.8,
    power: -1,
    cost: 0.6,
    buildMonths: 2,
    reliability: 0.94,
    type: 'chemical',
    isp: 230,
    thrust: 1000,
    propellantMass: 2.0,
    thrustPower: 0,
    description: 'AF-M315E green propellant. Fast burns, moderate efficiency.',
  },
  {
    id: 'prop-chemical-large',
    name: 'Large Chemical System',
    category: 'propulsion',
    mass: 1.8,
    volume: 1.2,
    power: -1,
    cost: 0.9,
    buildMonths: 2,
    reliability: 0.92,
    type: 'chemical',
    isp: 230,
    thrust: 2000,
    propellantMass: 3.5,
    thrustPower: 0,
    description: 'Larger green propellant system. More delta-v for direct transfers.',
  },
  {
    id: 'prop-ion',
    name: 'Ion Thruster (Iodine)',
    category: 'propulsion',
    mass: 1.0,
    volume: 0.6,
    power: -2, // Standby power only; thrust power is separate
    cost: 0.8,
    buildMonths: 3,
    reliability: 0.90,
    type: 'electric',
    isp: 2200,
    thrust: 1.5,
    propellantMass: 1.5,
    thrustPower: 60, // Power draw during active thrusting
    description: 'BIT-3 style iodine ion thruster. High efficiency but slow and power-hungry during burns.',
  },
  {
    id: 'prop-ion-large',
    name: 'Large Ion System',
    category: 'propulsion',
    mass: 1.5,
    volume: 0.9,
    power: -3, // Standby power only
    cost: 1.2,
    buildMonths: 3,
    reliability: 0.88,
    type: 'electric',
    isp: 2500,
    thrust: 2.0,
    propellantMass: 2.0,
    thrustPower: 80, // Power draw during active thrusting
    description: 'Larger ion system with more propellant. Maximum delta-v capability.',
  },
]

/** Instrument parts */
export const InstrumentPartSchema = BasePartSchema.extend({
  category: z.literal('instrument'),
  dataPerTurn: z.number(), // GB per turn in science orbit
  scienceValue: z.number(), // relative science value 1-10
  requiredPointingAccuracy: z.number(), // degrees
  eclipseSafe: z.boolean(), // can operate during eclipse
})
export type InstrumentPart = z.infer<typeof InstrumentPartSchema>

export const instruments: InstrumentPart[] = [
  {
    id: 'inst-ir-spec',
    name: 'IR Spectrometer (BIRCHES-type)',
    category: 'instrument',
    mass: 1.2,
    volume: 0.8,
    power: -8,
    cost: 1.5,
    buildMonths: 3,
    reliability: 0.92,
    dataPerTurn: 2.0,
    scienceValue: 10,
    requiredPointingAccuracy: 1.0,
    eclipseSafe: false,
    description:
      'Broadband IR spectrometer like Lunar IceCube. Maps water distribution across the surface.',
  },
  {
    id: 'inst-laser',
    name: 'Laser Reflectometer',
    category: 'instrument',
    mass: 1.5,
    volume: 1.0,
    power: -15,
    cost: 2.0,
    buildMonths: 3,
    reliability: 0.90,
    dataPerTurn: 1.5,
    scienceValue: 10,
    requiredPointingAccuracy: 0.5,
    eclipseSafe: true,
    description:
      'Four-laser reflectometer like Lunar Flashlight. Detects ice in permanently shadowed craters.',
  },
  {
    id: 'inst-camera',
    name: 'Narrow-Angle Camera',
    category: 'instrument',
    mass: 0.5,
    volume: 0.3,
    power: -3,
    cost: 0.4,
    buildMonths: 2,
    reliability: 0.95,
    dataPerTurn: 3.0,
    scienceValue: 4,
    requiredPointingAccuracy: 0.1,
    eclipseSafe: false,
    description:
      'High-resolution camera. Great images for outreach but limited ice detection capability.',
  },
  {
    id: 'inst-neutron',
    name: 'Neutron Spectrometer',
    category: 'instrument',
    mass: 0.8,
    volume: 0.5,
    power: -5,
    cost: 1.0,
    buildMonths: 2,
    reliability: 0.93,
    dataPerTurn: 0.5,
    scienceValue: 8,
    requiredPointingAccuracy: 5.0,
    eclipseSafe: true,
    description:
      'Detects hydrogen beneath the surface. Lower resolution but complements other instruments.',
  },
]

/** All parts combined */
export type Part =
  | StructurePart
  | SolarPart
  | BatteryPart
  | RadioPart
  | ComputerPart
  | AttitudePart
  | PropulsionPart
  | InstrumentPart

export const allParts: Part[] = [
  ...structures,
  ...solarPanels,
  ...batteries,
  ...radios,
  ...computers,
  ...attitudeControls,
  ...propulsionSystems,
  ...instruments,
]

export function getPartById(id: string): Part | undefined {
  return allParts.find((p) => p.id === id)
}

export function getPartsByCategory<T extends Part>(category: PartCategory): T[] {
  return allParts.filter((p) => p.category === category) as T[]
}
