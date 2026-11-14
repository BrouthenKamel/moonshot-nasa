import { z } from 'zod'

/**
 * Spacecraft parts. Numbers follow the Lunar Ice Mapper logic map
 * (prototype/reference/core-loop-logic-map.md on branch python-core-logic):
 * real lunar CubeSats where a source exists, game values otherwise.
 * Units: kg, U, W, $M, MB per turn. `effort` is build work: 10 points take one turn.
 */

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
  mass: z.number(), // kg, dry
  volume: z.number(), // U inside the box
  power: z.number(), // W (negative = draw, positive = generation)
  cost: z.number(), // $M
  effort: z.number(), // build effort points
  buildMonths: z.number(),
  reliability: z.number().min(0).max(1), // 0-1, shown only
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
    mass: 2.2,
    volume: 0, // the frame and harness, not counted against the 6U inside
    power: -3, // survival heater
    cost: 1.0,
    effort: 4,
    buildMonths: 1,
    reliability: 0.99,
    description: '6U CubeSat frame, harness and survival heater (10 x 20 x 30 cm).',
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
    name: 'Body-Mounted Panels (20 W)',
    category: 'solar',
    mass: 0.4,
    volume: 0,
    power: 20,
    powerGeneration: 20,
    cost: 0.15,
    effort: 1,
    buildMonths: 1,
    reliability: 0.99,
    deployable: false,
    description: 'Cells on the outside of the box. Nothing to deploy, but barely enough for the computer and radio.',
  },
  {
    id: 'solar-1wing',
    name: 'Deployable Wings (84 W)',
    category: 'solar',
    mass: 1.3,
    volume: 0, // folds against the outside of the box
    power: 84,
    powerGeneration: 84,
    cost: 0.6,
    effort: 3,
    buildMonths: 1,
    reliability: 0.97,
    deployable: true,
    description: 'Two deployable wings, as on many lunar CubeSats. Enough for one power-hungry instrument.',
  },
  {
    id: 'solar-2wing',
    name: 'Large Deployable Array (120 W)',
    category: 'solar',
    mass: 2.0,
    volume: 0,
    power: 120,
    powerGeneration: 120,
    cost: 1.0,
    effort: 4,
    buildMonths: 2,
    reliability: 0.95,
    deployable: true,
    description: 'The 120 W array Lunar IceCube flew. An ion engine needs this much.',
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
    name: 'Small Battery Pack (20 Wh)',
    category: 'battery',
    mass: 0.2,
    volume: 0.1,
    power: 0,
    cost: 0.05,
    effort: 1,
    buildMonths: 1,
    reliability: 0.98,
    capacity: 20,
    description: 'Compact Li-ion pack. Fine in constant sunlight, short of breath in shadow.',
  },
  {
    id: 'battery-medium',
    name: 'Medium Battery Pack (40 Wh)',
    category: 'battery',
    mass: 0.3,
    volume: 0.15,
    power: 0,
    cost: 0.1,
    effort: 1,
    buildMonths: 1,
    reliability: 0.97,
    capacity: 40,
    description: 'Standard Li-ion pack. Covers the short eclipses of a lunar orbit.',
  },
  {
    id: 'battery-large',
    name: 'Large Battery Pack (80 Wh)',
    category: 'battery',
    mass: 0.6,
    volume: 0.3,
    power: 0,
    cost: 0.2,
    effort: 1,
    buildMonths: 1,
    reliability: 0.96,
    capacity: 80,
    description: 'Rides out long eclipses when the Earth shadows the Moon.',
  },
]

/** Radio/antenna parts */
export const RadioPartSchema = BasePartSchema.extend({
  category: z.literal('radio'),
  reachesMoon: z.boolean(), // can close a link from lunar distance
  listenPower: z.number(), // W while listening
  transmitPower: z.number(), // W while transmitting
  gain: z.number(), // antenna gain factor on the ground station rate
  needsPrecisePointing: z.boolean(),
  gainWithoutPrecisePointing: z.number(), // factor on gain without precise pointing
  deployable: z.boolean(),
})
export type RadioPart = z.infer<typeof RadioPartSchema>

export const radios: RadioPart[] = [
  {
    id: 'radio-uhf',
    name: 'UHF Transceiver',
    category: 'radio',
    mass: 0.2,
    volume: 0.2,
    power: -1,
    cost: 0.1,
    effort: 1,
    buildMonths: 1,
    reliability: 0.98,
    reachesMoon: false,
    listenPower: 1,
    transmitPower: 5,
    gain: 1,
    needsPrecisePointing: false,
    gainWithoutPrecisePointing: 1,
    deployable: false,
    description: 'The radio CubeSat 101 recommends for low Earth orbit. It does not reach Earth from the Moon.',
  },
  {
    id: 'radio-sband',
    name: 'Deep-Space Radio, Patch Antenna',
    category: 'radio',
    mass: 1.2,
    volume: 0.5,
    power: -10,
    cost: 1.55,
    effort: 5,
    buildMonths: 1,
    reliability: 0.97,
    reachesMoon: true,
    listenPower: 10,
    transmitPower: 35,
    gain: 1,
    needsPrecisePointing: false,
    gainWithoutPrecisePointing: 1,
    deployable: false,
    description: 'JPL Iris deep-space transponder with a flat patch antenna, as on the lunar CubeSats.',
  },
  {
    id: 'radio-xband',
    name: 'Deep-Space Radio, Deployable Dish',
    category: 'radio',
    mass: 2.1,
    volume: 2.0,
    power: -10,
    cost: 2.3,
    effort: 7,
    buildMonths: 2,
    reliability: 0.95,
    reachesMoon: true,
    listenPower: 10,
    transmitPower: 35,
    gain: 8,
    needsPrecisePointing: true,
    gainWithoutPrecisePointing: 0.25,
    deployable: true,
    description: 'Iris with a 0.5 m deployable dish: eight times the data rate, but it takes 1.5 U and must be pointed precisely.',
  },
]

/** Computer parts */
export const ComputerPartSchema = BasePartSchema.extend({
  category: z.literal('computer'),
  redundant: z.boolean(),
  storage: z.number(), // MB
  resetFactor: z.number(), // multiplies the odds of radiation resets and lost contact
})
export type ComputerPart = z.infer<typeof ComputerPartSchema>

export const computers: ComputerPart[] = [
  {
    id: 'computer-basic',
    name: 'Basic Flight Computer',
    category: 'computer',
    mass: 0.2,
    volume: 0.2,
    power: -3,
    cost: 0.3,
    effort: 2,
    buildMonths: 1,
    reliability: 0.95,
    redundant: false,
    storage: 512,
    resetFactor: 1.0,
    description: 'Single-string computer with 512 MB of storage. Radiation resets it now and then.',
  },
  {
    id: 'computer-redundant',
    name: 'Radiation-Hard Redundant Computer',
    category: 'computer',
    mass: 0.4,
    volume: 0.3,
    power: -5,
    cost: 0.9,
    effort: 4,
    buildMonths: 2,
    reliability: 0.99,
    redundant: true,
    storage: 4096,
    resetFactor: 0.3,
    description: 'Radiation-tolerant and redundant, with 4 GB of storage. Resets far less often.',
  },
]

/** Attitude control parts */
export const AttitudePartSchema = BasePartSchema.extend({
  category: z.literal('attitude'),
  pointingAccuracy: z.number(), // degrees
  precise: z.boolean(),
  hasSunSensors: z.boolean(),
  hasStarTracker: z.boolean(),
})
export type AttitudePart = z.infer<typeof AttitudePartSchema>

export const attitudeControls: AttitudePart[] = [
  {
    id: 'attitude-basic',
    name: 'Basic ADCS',
    category: 'attitude',
    mass: 0.5,
    volume: 0.3,
    power: -2,
    cost: 0.3,
    effort: 2,
    buildMonths: 1,
    reliability: 0.95,
    pointingAccuracy: 1.0,
    precise: false,
    hasSunSensors: true,
    hasStarTracker: false,
    description: 'Sun sensors and small wheels. The laser loses half its quality and a dish a quarter of its gain.',
  },
  {
    id: 'attitude-precision',
    name: 'Precision ADCS',
    category: 'attitude',
    mass: 0.9,
    volume: 0.5,
    power: -3,
    cost: 0.8,
    effort: 4,
    buildMonths: 2,
    reliability: 0.93,
    pointingAccuracy: 0.1,
    precise: true,
    hasSunSensors: true,
    hasStarTracker: true,
    description: 'Reaction wheels with a star tracker. Needed for the laser and for a dish antenna.',
  },
]

/** Propulsion parts. `mass` is dry; propellant is added on top. */
export const PropulsionPartSchema = BasePartSchema.extend({
  category: z.literal('propulsion'),
  type: z.enum(['electric', 'chemical', 'cold-gas']),
  impulsive: z.boolean(), // fast burns (chemical, cold gas) or slow thrust (electric)
  isp: z.number(), // seconds
  thrust: z.number(), // mN
  propellantMass: z.number(), // kg
  thrustPower: z.number(), // W nominal while thrusting (0 for impulsive)
  minThrustPower: z.number(), // W below which an electric engine cannot run
})
export type PropulsionPart = z.infer<typeof PropulsionPartSchema>

export const propulsionSystems: PropulsionPart[] = [
  {
    id: 'prop-coldgas',
    name: 'Cold Gas Thrusters',
    category: 'propulsion',
    mass: 0.5,
    volume: 0.4,
    power: 0,
    cost: 0.1,
    effort: 2,
    buildMonths: 1,
    reliability: 0.98,
    type: 'cold-gas',
    impulsive: true,
    isp: 70,
    thrust: 100,
    propellantMass: 0.3,
    thrustPower: 0,
    minThrustPower: 0,
    description: 'Simple and safe, but only good for pointing: far too little delta-v to stop at the Moon.',
  },
  {
    id: 'prop-chemical',
    name: 'Green Monopropellant (2 kg)',
    category: 'propulsion',
    mass: 3.6,
    volume: 2.4,
    power: 0,
    cost: 2.5,
    effort: 9,
    buildMonths: 2,
    reliability: 0.94,
    type: 'chemical',
    impulsive: true,
    isp: 150, // effective, reproduces Lunar Flashlight's module
    thrust: 1000,
    propellantMass: 2.0,
    thrustPower: 0,
    minThrustPower: 0,
    description: 'Lunar Flashlight-class module: quick burns, about 230 m/s on a 14 kg craft.',
  },
  {
    id: 'prop-chemical-large',
    name: 'Green Monopropellant (3 kg)',
    category: 'propulsion',
    mass: 3.6,
    volume: 2.9,
    power: 0,
    cost: 2.5,
    effort: 9,
    buildMonths: 2,
    reliability: 0.92,
    type: 'chemical',
    impulsive: true,
    isp: 150,
    thrust: 1000,
    propellantMass: 3.0,
    thrustPower: 0,
    minThrustPower: 0,
    description: 'The same module with the largest tank. More delta-v, but heavy and bulky.',
  },
  {
    id: 'prop-ion',
    name: 'Ion Thruster, BIT-3 (1.0 kg iodine)',
    category: 'propulsion',
    mass: 1.4,
    volume: 1.5,
    power: 0,
    cost: 3.0,
    effort: 10,
    buildMonths: 3,
    reliability: 0.9,
    type: 'electric',
    impulsive: false,
    isp: 2150,
    thrust: 1.1,
    propellantMass: 1.0,
    thrustPower: 65,
    minThrustPower: 56,
    description: 'Busek BIT-3 iodine ion engine. Very efficient but slow, and it needs 56 to 65 W while thrusting.',
  },
  {
    id: 'prop-ion-large',
    name: 'Ion Thruster, BIT-3 (1.5 kg iodine)',
    category: 'propulsion',
    mass: 1.4,
    volume: 1.6,
    power: 0,
    cost: 3.0,
    effort: 10,
    buildMonths: 3,
    reliability: 0.88,
    type: 'electric',
    impulsive: false,
    isp: 2150,
    thrust: 1.1,
    propellantMass: 1.5,
    thrustPower: 65,
    minThrustPower: 56,
    description: 'BIT-3 with its full 1.5 kg tank, as on Lunar IceCube: about 2.4 km/s on a 14 kg craft.',
  },
]

/** Instrument parts */
export const InstrumentPartSchema = BasePartSchema.extend({
  category: z.literal('instrument'),
  dataPerTurn: z.number(), // MB per turn at full power
  scienceValue: z.number(), // relative science value 1-10, shown only
  requiredPointingAccuracy: z.number(), // degrees
  eclipseSafe: z.boolean(),
  seesShadow: z.boolean(), // can map ice in permanently shadowed craters
  maxAltitudeKm: z.number().nullable(), // above this the quality drops; null = any altitude
  footprint: z.number(), // share of the polar region seen per pass
  kind: z.enum(['ice', 'context', 'outreach']),
  qualityWithoutPrecisePointing: z.number(),
  flownOn: z.string(),
})
export type InstrumentPart = z.infer<typeof InstrumentPartSchema>

export const instruments: InstrumentPart[] = [
  {
    id: 'inst-ir-spec',
    name: 'IR Spectrometer (BIRCHES-type)',
    category: 'instrument',
    mass: 3.2,
    volume: 1.5,
    power: -12,
    cost: 3.0,
    effort: 9,
    buildMonths: 3,
    reliability: 0.92,
    dataPerTurn: 400,
    scienceValue: 7,
    requiredPointingAccuracy: 1.0,
    eclipseSafe: false,
    seesShadow: false,
    maxAltitudeKm: null,
    footprint: 0.02,
    kind: 'context',
    qualityWithoutPrecisePointing: 1,
    flownOn: 'Lunar IceCube',
    description:
      'Maps water on sunlit ground, like Lunar IceCube. It needs reflected sunlight, so it cannot see into the shadowed craters where the ice is.',
  },
  {
    id: 'inst-laser',
    name: 'Laser Reflectometer',
    category: 'instrument',
    mass: 2.0,
    volume: 2.0,
    power: -25,
    cost: 2.5,
    effort: 8,
    buildMonths: 3,
    reliability: 0.9,
    dataPerTurn: 100,
    scienceValue: 10,
    requiredPointingAccuracy: 0.5,
    eclipseSafe: true,
    seesShadow: true,
    maxAltitudeKm: 20,
    footprint: 0.025,
    kind: 'ice',
    qualityWithoutPrecisePointing: 0.5,
    flownOn: 'Lunar Flashlight',
    description:
      'Shines its own lasers into the shadowed craters, like Lunar Flashlight. Power hungry, works only below about 20 km, and needs precise pointing.',
  },
  {
    id: 'inst-camera',
    name: 'Narrow-Angle Camera',
    category: 'instrument',
    mass: 0.5,
    volume: 0.3,
    power: -3,
    cost: 0.2,
    effort: 2,
    buildMonths: 2,
    reliability: 0.95,
    dataPerTurn: 1500,
    scienceValue: 3,
    requiredPointingAccuracy: 0.1,
    eclipseSafe: false,
    seesShadow: false,
    maxAltitudeKm: null,
    footprint: 0.05,
    kind: 'outreach',
    qualityWithoutPrecisePointing: 1,
    flownOn: 'generic CubeSat camera',
    description:
      'Great pictures for the public, but it cannot see ice in the dark. Its large images compete with the science data for the link.',
  },
  {
    id: 'inst-neutron',
    name: 'Neutron Spectrometer',
    category: 'instrument',
    mass: 2.5,
    volume: 2.0,
    power: -5,
    cost: 2.0,
    effort: 6,
    buildMonths: 2,
    reliability: 0.93,
    dataPerTurn: 30,
    scienceValue: 8,
    requiredPointingAccuracy: 5.0,
    eclipseSafe: true,
    seesShadow: true,
    maxAltitudeKm: 25,
    footprint: 0.01,
    kind: 'ice',
    qualityWithoutPrecisePointing: 1,
    flownOn: 'LunaH-Map',
    description:
      'Senses hydrogen under the surface, in light or dark, like LunaH-Map. Low power and little data, but it must pass within about 25 km.',
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
