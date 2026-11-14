import {
  type Difficulty,
  difficultyPresets,
  lunarIceMapperBrief,
} from '../data/brief'
import {
  type Part,
  type SolarPart,
  type BatteryPart,
  type RadioPart,
  type ComputerPart,
  type PropulsionPart,
  type InstrumentPart,
  getPartById,
} from '../data/parts'
import { getOrbitById, lunarOrbitInsertionDeltaV } from '../data/orbits'
import { getRideById } from '../data/rides'
import { getTransferById } from '../data/transfers'
import { getGroundStationById, calculateDownlinkPerTurn } from '../data/ground'
import type { Design, Budgets } from './types'

/**
 * Compute delta-v available from propulsion system using rocket equation.
 * deltaV = Isp * g0 * ln(m0 / m1)
 * where m0 = total mass, m1 = dry mass (total - propellant)
 */
function computeDeltaV(
  totalMass: number,
  propellantMass: number,
  isp: number
): number {
  const g0 = 9.80665 // m/s^2
  const dryMass = totalMass - propellantMass
  if (dryMass <= 0 || propellantMass <= 0) return 0
  return isp * g0 * Math.log(totalMass / dryMass)
}

/**
 * Compute all resource budgets from a design.
 */
export function computeBudgets(design: Design, difficulty: Difficulty): Budgets {
  const preset = difficultyPresets[difficulty]
  const brief = lunarIceMapperBrief

  // Gather all parts
  const parts: Part[] = []
  const partIds = [
    design.structure,
    design.solar,
    design.battery,
    design.radio,
    design.computer,
    design.attitude,
    design.propulsion,
    ...design.instruments,
  ]

  for (const id of partIds) {
    const part = getPartById(id)
    if (part) parts.push(part)
  }

  // Get specific part types for calculations
  const solar = getPartById(design.solar) as SolarPart | undefined
  const battery = getPartById(design.battery) as BatteryPart | undefined
  const radio = getPartById(design.radio) as RadioPart | undefined
  const computer = getPartById(design.computer) as ComputerPart | undefined
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const instruments = design.instruments
    .map((id) => getPartById(id))
    .filter((p): p is InstrumentPart => p !== undefined && p.category === 'instrument')

  const orbit = getOrbitById(design.orbit)
  const ride = getRideById(design.ride)
  const transfer = getTransferById(design.transfer)
  const groundStation = getGroundStationById(design.groundStation)

  // === MASS ===
  const totalMass = parts.reduce((sum, p) => sum + p.mass, 0)
  const massLimit = brief.constraints.maxMass
  const massMargin = massLimit - totalMass

  // === VOLUME ===
  const totalVolume = parts.reduce((sum, p) => sum + p.volume, 0)
  const volumeLimit = brief.constraints.maxVolume
  const volumeMargin = volumeLimit - totalVolume

  // === POWER (in sun) ===
  const powerGenerated = solar?.powerGeneration ?? 0
  // Negative power values mean consumption
  const powerConsumed = parts
    .filter((p) => p.power < 0)
    .reduce((sum, p) => sum + Math.abs(p.power), 0)
  const powerMargin = powerGenerated - powerConsumed
  const thrustingPowerConsumed = propulsion?.thrustPower ?? 0

  // === POWER (in eclipse) ===
  const eclipseFraction = orbit?.eclipseFraction ?? 0.3
  const orbitPeriodMinutes = orbit?.orbitPeriodMinutes ?? 120
  const eclipseDurationMinutes = orbitPeriodMinutes * eclipseFraction
  const batteryCapacity = battery?.capacity ?? 0
  // Power needed during eclipse (instruments may not work, just survival)
  const survivalPower = parts
    .filter((p) => p.category !== 'instrument' && p.power < 0)
    .reduce((sum, p) => sum + Math.abs(p.power), 0)
  const eclipsePowerConsumed = survivalPower
  // How long can battery last at eclipse power draw
  const batteryDurationMinutes =
    eclipsePowerConsumed > 0 ? (batteryCapacity / eclipsePowerConsumed) * 60 : 999
  const batteryMarginMinutes = batteryDurationMinutes - eclipseDurationMinutes

  // === COST ===
  const partsCost = parts.reduce((sum, p) => sum + p.cost, 0)
  const rideCost = ride?.cost ?? 0
  const groundSetupCost = groundStation?.setupCost ?? 0
  const groundCostPerTurn = groundStation?.costPerTurn ?? 0
  // Estimate 12 turns of operations
  const operationsCost = groundCostPerTurn * 12
  const totalCostBeforeReserve = partsCost + rideCost + groundSetupCost + operationsCost
  const reservePercent = design.planning.reservePercent
  const reserveAmount = (totalCostBeforeReserve * reservePercent) / 100
  const totalCost = totalCostBeforeReserve + reserveAmount
  const budgetCap = preset.budgetCap
  const budgetMargin = budgetCap - totalCost

  // === TIME ===
  const buildTurns = design.planning.buildTurns
  const testTurns = design.planning.testTurns
  const totalPrepTurns = buildTurns + testTurns
  const rideTurn = ride?.departureTurn ?? 8
  const readyTurn = totalPrepTurns
  const timeMarginTurns = rideTurn - readyTurn

  // === DELTA-V ===
  const propellantMass = propulsion?.propellantMass ?? 0
  const isp = propulsion?.isp ?? 0
  const deltaVAvailable = computeDeltaV(totalMass, propellantMass, isp)

  const baseRequiredDeltaV = ride?.requiredDeltaV ?? 900
  const transferMultiplier = transfer?.deltaVMultiplier ?? 1.0
  const deltaVTransfer = baseRequiredDeltaV * transferMultiplier

  const orbitId = design.orbit
  const deltaVCapture = lunarOrbitInsertionDeltaV[orbitId] ?? 800

  const stationKeepingPerTurn = orbit?.stationKeepingDeltaV ?? 10
  const missionTurns = brief.missionDurationTurns
  const deltaVStationKeeping = stationKeepingPerTurn

  const deltaVTotal = deltaVTransfer + deltaVCapture + stationKeepingPerTurn * missionTurns
  const deltaVMargin = deltaVAvailable - deltaVTotal

  // === DATA ===
  const dataPerTurn = instruments.reduce((sum, i) => sum + i.dataPerTurn, 0)
  const radioDataRate = radio?.dataRate ?? 0
  const contactMinutes = orbit?.contactWindowMinutes ?? 45
  const downlinkPerTurn = groundStation
    ? calculateDownlinkPerTurn(radioDataRate, groundStation, contactMinutes)
    : 0
  const storageCapacity = computer?.storage ?? 0
  const dataMarginPerTurn = downlinkPerTurn - dataPerTurn

  // === RELIABILITY ===
  const baseReliability = parts.reduce((prod, p) => prod * p.reliability, 1)
  // More testing improves reliability
  const testingBonus = Math.min(testTurns * 0.02, 0.05) // up to 5% improvement
  const overallReliability = Math.min(baseReliability + testingBonus, 0.99)

  return {
    totalMass,
    massLimit,
    massMargin,

    totalVolume,
    volumeLimit,
    volumeMargin,

    powerGenerated,
    powerConsumed,
    powerMargin,
    thrustingPowerConsumed,

    eclipsePowerConsumed,
    eclipseDurationMinutes,
    batteryCapacity,
    batteryMarginMinutes,

    partsCost,
    rideCost,
    groundCost: groundSetupCost,
    groundCostPerTurn,
    operationsCost,
    totalCost,
    budgetCap,
    budgetMargin,
    reserveAmount,

    buildTurns,
    testTurns,
    totalPrepTurns,
    rideTurn,
    readyTurn,
    timeMarginTurns,

    deltaVAvailable,
    deltaVTransfer,
    deltaVCapture,
    deltaVStationKeeping,
    deltaVTotal,
    deltaVMargin,

    dataPerTurn,
    downlinkPerTurn,
    storageCapacity,
    dataMarginPerTurn,

    overallReliability,
    testingBonus,
  }
}

/**
 * Create a default design with minimum viable selections.
 * Uses electric propulsion with low-energy transfer, like Lunar IceCube.
 */
export function createDefaultDesign(): Design {
  return {
    planning: {
      buildTurns: 4,
      testTurns: 2,
      reservePercent: 10,
    },
    instruments: ['inst-ir-spec'],
    structure: 'bus-6u',
    solar: 'solar-2wing', // Need power for ion thruster
    battery: 'battery-medium',
    radio: 'radio-sband',
    computer: 'computer-basic',
    attitude: 'attitude-basic',
    propulsion: 'prop-ion', // Electric propulsion like Lunar IceCube
    orbit: 'orbit-100km',
    ride: 'ride-lunar',
    transfer: 'transfer-low-energy', // WSB trajectory
    groundStation: 'ground-medium',
  }
}
