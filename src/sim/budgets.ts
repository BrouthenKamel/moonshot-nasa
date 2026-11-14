import {
  type Difficulty,
  difficultyPresets,
  lunarIceMapperBrief,
  modelConstants as C,
} from '../data/brief'
import {
  type Part,
  type SolarPart,
  type BatteryPart,
  type RadioPart,
  type ComputerPart,
  type AttitudePart,
  type PropulsionPart,
  type InstrumentPart,
  getPartById,
} from '../data/parts'
import { getOrbitById, type LunarOrbit } from '../data/orbits'
import { getRideById } from '../data/rides'
import { getTransferById } from '../data/transfers'
import { getGroundStationById } from '../data/ground'
import type { Design, Budgets, ScienceState } from './types'

/**
 * The budget calculator: one pass from a design to every number the meters,
 * the Go / No-Go check and the flight use. Ported from the Lunar Ice Mapper
 * logic map (prototype/lunar_ice_mapper/calculator.py on branch python-core-logic).
 */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/**
 * Delta-v (m/s) to get from a trans-lunar drop-off into the science orbit.
 * null = not possible (no engine, or an ion engine on a direct transfer).
 */
export function insertionDeltaV(
  propulsion: PropulsionPart | undefined,
  transferType: 'direct' | 'low_energy',
  orbit: LunarOrbit | undefined
): number | null {
  if (!propulsion || !orbit) return null
  const engineKey = propulsion.impulsive ? 'chemical' : 'electric'
  const listed = orbit.insertionDeltaV[`${engineKey}_${transferType}`]
  if (listed !== undefined) return listed
  if (!propulsion.impulsive) return null // too little thrust to brake on a fast fly-by
  // Vis-viva: arrival speed at the low point minus orbit speed there, plus course corrections.
  const r = C.moonRadiusKm + orbit.altitude
  const far = orbit.farPointKm ?? orbit.altitude
  const a = far === orbit.altitude ? r : (2 * C.moonRadiusKm + orbit.altitude + far) / 2
  const vOrbit = Math.sqrt(C.moonMu * (2 / r - 1 / a))
  const vEscape = Math.sqrt((2 * C.moonMu) / r)
  if (transferType === 'direct') {
    const vArrival = Math.sqrt(C.arrivalExcessSpeedKms ** 2 + vEscape ** 2)
    return Math.round((vArrival - vOrbit) * 1000 + C.courseCorrectionDirect)
  }
  return Math.round((vEscape - vOrbit) * 1000 + C.courseCorrectionLowEnergy)
}

/** Hours a day booked on the ground station */
export function contactHoursFor(design: Design): number {
  const station = getGroundStationById(design.groundStation)
  if (!station) return 0
  const wanted = design.contactHours ?? station.defaultHours
  return Math.max(0, Math.min(wanted, station.contactHoursPerDay))
}

export function newScienceState(instrumentIds: string[]): ScienceState {
  const zero = () => Object.fromEntries(instrumentIds.map((id) => [id, 0]))
  return { observed: zero(), waiting: zero(), mapped: zero(), storedBy: zero(), returned: zero(), stored: 0, lost: 0 }
}

/**
 * One turn of observing and downlink. Coverage only counts once its data is on the ground.
 * dutyFactor 0 = safe mode; linkFactor 0.5 = station outage; scienceFactor drops as instruments degrade.
 * Returns the MB made, sent and lost this turn.
 */
export function scienceTurn(
  design: Design,
  b: Budgets,
  st: ScienceState,
  dutyFactor = 1,
  linkFactor = 1,
  scienceFactor = 1
): { made: number; sent: number; lost: number } {
  const availableBy: Record<string, number> = {}
  let made = 0
  for (const id of design.instruments) {
    const inst = getPartById(id) as InstrumentPart | undefined
    if (!inst) continue
    let rate = b.coverageRate[id] ?? 0
    if (dutyFactor !== 1) rate = 1 - (1 - rate) ** dutyFactor
    rate *= scienceFactor
    const fresh = (100 - st.observed[id]) * rate
    st.observed[id] += fresh
    st.waiting[id] += fresh
    const newData = inst.dataPerTurn * b.scienceDuty * dutyFactor * scienceFactor
    made += newData
    availableBy[id] = st.storedBy[id] + newData
  }
  const available = Object.values(availableBy).reduce((s, v) => s + v, 0)
  const sent = Math.min(available, b.downlinkPerTurn * linkFactor)
  const kept = Math.min(available - sent, b.storageCapacity)
  const lost = available - sent - kept
  const sentShare = available > 0 ? sent / available : 0
  const keptShare = available > 0 ? kept / available : 0
  for (const id of Object.keys(availableBy)) {
    st.returned[id] += availableBy[id] * sentShare
    st.storedBy[id] = availableBy[id] * keptShare
    const credited = st.waiting[id] * sentShare
    const dropped = st.waiting[id] * (1 - sentShare - keptShare)
    st.mapped[id] += credited
    st.waiting[id] -= credited + dropped
    st.observed[id] -= dropped // lost data means that ground must be observed again
  }
  st.stored = kept
  st.lost += lost
  return { made, sent, lost }
}

/** [ice coverage %, science data MB, sunlit-ground coverage %, outreach MB] */
export function scienceTotals(design: Design, st: ScienceState): [number, number, number, number] {
  let ice = 0
  let data = 0
  let context = 0
  let outreach = 0
  for (const id of design.instruments) {
    const inst = getPartById(id) as InstrumentPart | undefined
    if (!inst) continue
    if (inst.seesShadow) ice = Math.max(ice, st.mapped[id])
    if (inst.kind === 'context') context = Math.max(context, st.mapped[id])
    if (inst.kind === 'outreach') outreach += st.returned[id]
    else data += st.returned[id]
  }
  return [ice, data, context, outreach]
}

/**
 * Compute all resource budgets from a design.
 */
export function computeBudgets(design: Design, difficulty: Difficulty): Budgets {
  const preset = difficultyPresets[difficulty] ?? difficultyPresets.engineer
  const brief = lunarIceMapperBrief

  const structure = getPartById(design.structure)
  const solar = getPartById(design.solar) as SolarPart | undefined
  const battery = getPartById(design.battery) as BatteryPart | undefined
  const radio = getPartById(design.radio) as RadioPart | undefined
  const computer = getPartById(design.computer) as ComputerPart | undefined
  const attitude = getPartById(design.attitude) as AttitudePart | undefined
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const instruments = design.instruments
    .map((id) => getPartById(id))
    .filter((p): p is InstrumentPart => p !== undefined && p.category === 'instrument')
  const orbit = getOrbitById(design.orbit)
  const ride = getRideById(design.ride)
  const transfer = getTransferById(design.transfer)
  const station = getGroundStationById(design.groundStation)

  const parts: Part[] = [structure, solar, battery, radio, computer, attitude, propulsion, ...instruments].filter(
    (p): p is Part => p !== undefined
  )

  // --- step 3: mass, volume, power, cost and effort roll-ups
  const propellantMass = propulsion?.propellantMass ?? 0
  const dryMass = parts.reduce((s, p) => s + p.mass, 0)
  const totalMass = dryMass + propellantMass
  const totalVolume = parts.reduce((s, p) => s + p.volume, 0)
  const partsCost = parts.reduce((s, p) => s + p.cost, 0)
  const buildEffort = parts.reduce((s, p) => s + p.effort, 0)
  const powerGenerated = solar?.powerGeneration ?? 0
  const heater = structure ? Math.max(0, -structure.power) : 0
  const busPower =
    heater + Math.max(0, -(computer?.power ?? 0)) + Math.max(0, -(attitude?.power ?? 0)) + (radio?.listenPower ?? 0)
  const instrumentPower = instruments.reduce((s, i) => s + Math.abs(i.power), 0)
  const transmitExtraPower = radio ? radio.transmitPower - radio.listenPower : 0
  const precise = attitude?.precise ?? false

  // --- step 1: schedule and money pots
  const testTurns = design.planning.testTurns
  const buildTurns = Math.ceil(buildEffort / C.effortPerTurn)
  const readyTurn = C.designTurns + buildTurns + testTurns + C.integrationTurns
  const rideTurn = ride?.departureTurn ?? brief.defaultRideTurn
  const timeMarginTurns = rideTurn - readyTurn
  const budgetCap = preset.budgetCap
  const reserveAmount = (budgetCap * design.planning.reservePercent) / 100
  const spendable = budgetCap - reserveAmount
  const testFactor = C.testFactor[Math.max(0, Math.min(3, testTurns))]

  // --- step 5: delta-v and transfer
  const deltaVAvailable =
    propulsion && propellantMass > 0 ? propulsion.isp * C.g0 * Math.log(totalMass / dryMass) : 0
  const transferType = transfer?.type ?? 'low_energy'
  const baseInsert = insertionDeltaV(propulsion, transferType, orbit)
  const rideAllows = ride
    ? propulsion?.type === 'electric'
      ? ride.electricCompatible
      : ride.chemicalCompatible
    : false
  const captureDeltaV =
    baseInsert === null || !ride || !rideAllows || propellantMass <= 0
      ? null
      : baseInsert * ride.insertionFactor + ride.extraDeltaV
  const thrustPower = powerGenerated * C.thrustPowerShare - busPower
  let thrustLevel = 0
  if (propulsion?.impulsive) thrustLevel = 1
  else if (propulsion && thrustPower >= propulsion.minThrustPower) thrustLevel = Math.min(1, thrustPower / propulsion.thrustPower)
  let transferTurns: number | null = null
  if (captureDeltaV !== null && thrustLevel > 0 && propulsion) {
    const cruise = ride?.cruiseTurns ?? C.cruiseTurns
    if (propulsion.impulsive) {
      transferTurns = transferType === 'direct' ? 0 : cruise
    } else {
      const averageMass = totalMass - propellantMass / 2
      const spiral =
        (Math.max(0, captureDeltaV - C.spiralFreeDeltaV) * averageMass) /
        ((propulsion.thrust / 1000) * thrustLevel * C.thrustDuty * C.turnSeconds)
      transferTurns = cruise + Math.ceil(spiral)
    }
  }
  const deltaVStationKeeping = orbit?.stationKeepingDeltaV ?? 0
  const deltaVAfterCapture = deltaVAvailable - (captureDeltaV ?? 0)
  const upkeepTurns =
    deltaVAfterCapture >= 0 && deltaVStationKeeping > 0 ? Math.floor(deltaVAfterCapture / deltaVStationKeeping) : 0

  // --- step 6: link
  const pointingOk = precise || !radio?.needsPrecisePointing
  const gain = radio ? radio.gain * (pointingOk ? 1 : radio.gainWithoutPrecisePointing) : 0
  const linkKbps = radio?.reachesMoon && station ? station.rateKbps * gain : 0
  const contactHours = contactHoursFor(design)
  const groundCostPerTurn = contactHours * (station?.pricePerHour ?? 0)
  const transmitShare = transmitExtraPower > 0 ? clamp01((powerGenerated - busPower) / transmitExtraPower) : 1
  const earthVisible = orbit?.earthVisible ?? 0
  const downlinkPerTurn = ((linkKbps * contactHours * 30 * 3600) / 8 / 1000) * earthVisible * transmitShare

  // --- steps 2 + 4: science rates
  const sunlit = orbit?.sunlitShare ?? 0
  const observing = orbit?.observingShare ?? 0
  const dutyInstant = instrumentPower > 0 ? clamp01((powerGenerated - busPower) / instrumentPower) : 0
  const averageLeft = powerGenerated * sunlit - busPower - transmitExtraPower * (contactHours / 24) * transmitShare
  const dutyAverage = instrumentPower > 0 && observing > 0 ? clamp01(averageLeft / (instrumentPower * observing)) : 0
  const scienceDuty = Math.min(dutyInstant, dutyAverage)
  const eclipseHours = orbit?.eclipseHours ?? 0
  const batteryUsableWh = (battery?.capacity ?? 0) * C.usableBatteryShare
  const batteryNeedWh = (busPower + instrumentPower) * eclipseHours
  const quality: Record<string, number> = {}
  const coverageRate: Record<string, number> = {}
  let dataPerTurn = 0
  for (const inst of instruments) {
    const limit = inst.maxAltitudeKm
    const altitude = orbit?.altitude ?? 0
    let q = limit === null || altitude <= limit ? 1 : (limit / altitude) ** 2
    if (!precise) q *= inst.qualityWithoutPrecisePointing
    quality[inst.id] = q
    coverageRate[inst.id] = 1 - Math.exp(-(orbit?.passesPerTurn ?? 0) * inst.footprint * q * scienceDuty)
    dataPerTurn += inst.dataPerTurn * scienceDuty
  }

  // --- step 7: money
  const turns = brief.missionDurationTurns
  const opsCostPerTurn = C.teamCostFlight + groundCostPerTurn
  const rideCost = ride?.cost ?? 0
  const costPrelaunch = partsCost + C.teamCostPrelaunch * rideTurn + C.testCost * testTurns + rideCost
  const transferCostPerTurn = opsCostPerTurn + (propulsion && !propulsion.impulsive ? C.electricNavCost : 0)
  const operationsCost = transferCostPerTurn * (transferTurns ?? 0) + opsCostPerTurn * turns
  const totalCost = costPrelaunch + operationsCost

  // Power figures for the meters: peak draw with every instrument on
  const powerConsumed = busPower + instrumentPower
  const eclipsePowerConsumed = busPower + instrumentPower
  const eclipseDurationMinutes = eclipseHours * 60
  const batteryMarginMinutes =
    eclipsePowerConsumed > 0 ? (batteryUsableWh / eclipsePowerConsumed) * 60 - eclipseDurationMinutes : 999
  const massLimit = Math.min(brief.constraints.maxMass, ride?.massLimit ?? brief.constraints.maxMass)
  const deltaVTotal = captureDeltaV === null ? 0 : captureDeltaV + deltaVStationKeeping * turns

  const budgets: Budgets = {
    totalMass,
    massLimit,
    massMargin: massLimit - totalMass,
    totalVolume,
    volumeLimit: brief.constraints.maxVolume,
    volumeMargin: brief.constraints.maxVolume - totalVolume,
    powerGenerated,
    powerConsumed,
    powerMargin: powerGenerated - powerConsumed,
    thrustingPowerConsumed: propulsion && !propulsion.impulsive ? propulsion.thrustPower : 0,
    eclipsePowerConsumed,
    eclipseDurationMinutes,
    batteryCapacity: battery?.capacity ?? 0,
    batteryMarginMinutes,
    partsCost,
    rideCost,
    groundCost: station?.setupCost ?? 0,
    groundCostPerTurn,
    operationsCost,
    totalCost,
    budgetCap,
    budgetMargin: budgetCap - totalCost,
    reserveAmount,
    buildTurns,
    testTurns,
    totalPrepTurns: readyTurn,
    rideTurn,
    readyTurn,
    timeMarginTurns,
    deltaVAvailable,
    deltaVTransfer: ride?.extraDeltaV ?? 0,
    deltaVCapture: captureDeltaV === null ? 0 : captureDeltaV - (ride?.extraDeltaV ?? 0),
    deltaVStationKeeping,
    deltaVTotal,
    deltaVMargin: deltaVAvailable - deltaVTotal,
    dataPerTurn,
    downlinkPerTurn,
    storageCapacity: computer?.storage ?? 0,
    dataMarginPerTurn: downlinkPerTurn - dataPerTurn,
    overallReliability: parts.reduce((prod, p) => prod * p.reliability, 1),
    testingBonus: 0,
    dryMass,
    propellantMass,
    buildEffort,
    testFactor,
    spendable,
    busPower,
    instrumentPower,
    transmitExtraPower,
    scienceDuty,
    transmitShare,
    batteryUsableWh,
    batteryNeedWh,
    batteryOk: batteryUsableWh >= batteryNeedWh,
    batteryLongOk: batteryUsableWh >= busPower * C.longEclipseHours,
    captureDeltaV,
    thrustPower,
    thrustLevel,
    transferTurns,
    arrivalTurn: transferTurns === null ? null : rideTurn + transferTurns,
    deltaVAfterCapture,
    upkeepTurns,
    linkKbps,
    contactHours,
    opsCostPerTurn,
    transferCostPerTurn,
    costPrelaunch,
    quality,
    coverageRate,
    projectedCoverage: 0,
    projectedData: 0,
    projectedContext: 0,
    projectedOutreach: 0,
    projectedLost: 0,
  }

  // --- step 7: projection of a clean science phase (no events)
  const science = newScienceState(design.instruments)
  const cleanTurns = captureDeltaV === null ? 0 : Math.min(turns, upkeepTurns)
  for (let i = 0; i < cleanTurns; i++) scienceTurn(design, budgets, science)
  ;[budgets.projectedCoverage, budgets.projectedData, budgets.projectedContext, budgets.projectedOutreach] =
    scienceTotals(design, science)
  budgets.projectedLost = science.lost
  return budgets
}

/**
 * The design a new game starts from: a Lunar IceCube-like craft (ion engine,
 * IR spectrometer, elliptical orbit). It can fly, but the IR spectrometer
 * cannot see into the shadowed craters: the first lesson of the game.
 */
export function createDefaultDesign(): Design {
  return {
    planning: {
      buildTurns: 0,
      testTurns: 1,
      reservePercent: 10,
    },
    instruments: ['inst-ir-spec'],
    structure: 'bus-6u',
    solar: 'solar-2wing',
    battery: 'battery-large',
    radio: 'radio-sband',
    computer: 'computer-basic',
    attitude: 'attitude-basic',
    propulsion: 'prop-ion-large',
    orbit: 'orbit-elliptical',
    ride: 'ride-lunar',
    transfer: 'transfer-low-energy',
    groundStation: 'ground-medium',
    contactHours: 1,
  }
}
