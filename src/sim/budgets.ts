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
import { getOrbitById, polarOrbitId, type LunarOrbit } from '../data/orbits'
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
  orbit: LunarOrbit | undefined,
  /** A worked-out transfer: its arrival speed over escape (km/s) and course corrections (m/s) */
  arrival?: { excessKms: number; correction: number }
): number | null {
  if (!propulsion || !orbit) return null
  const engineKey = propulsion.impulsive ? 'chemical' : 'electric'
  const listed = orbit.insertionDeltaV[`${engineKey}_${transferType}`]
  if (listed !== undefined) return listed
  // An ion engine has too little thrust to brake on a fast fly-by; a slow low-energy arrival it can spiral down from
  if (!propulsion.impulsive && (transferType === 'direct' || (arrival?.excessKms ?? 0) > 0.05)) return null
  // Vis-viva: arrival speed at the low point minus orbit speed there, plus course corrections.
  const r = C.moonRadiusKm + orbit.altitude
  const far = orbit.farPointKm ?? orbit.altitude
  const a = far === orbit.altitude ? r : (2 * C.moonRadiusKm + orbit.altitude + far) / 2
  const vOrbit = Math.sqrt(C.moonMu * (2 / r - 1 / a))
  const vEscape = Math.sqrt((2 * C.moonMu) / r)
  // A low-thrust spiral down from capture costs about the circular speed at the orbit's mean radius (Edelbaum), not one quick burn:
  // this is why the listed ion figures are so much higher (1,700 m/s into 100 km)
  if (!propulsion.impulsive) return Math.round(Math.sqrt(C.moonMu / a) * 1000 + (arrival?.correction ?? C.courseCorrectionLowEnergy))
  if (arrival) {
    const vArrival = Math.sqrt(arrival.excessKms ** 2 + vEscape ** 2)
    return Math.round((vArrival - vOrbit) * 1000 + arrival.correction)
  }
  if (transferType === 'direct') {
    const vArrival = Math.sqrt(C.arrivalExcessSpeedKms ** 2 + vEscape ** 2)
    return Math.round((vArrival - vOrbit) * 1000 + C.courseCorrectionDirect)
  }
  return Math.round((vEscape - vOrbit) * 1000 + C.courseCorrectionLowEnergy)
}

/**
 * Share of an instrument's ice signal left at a height: full up to its limit, then fading
 * exponentially (a quarter of the limit per e-fold), cut to none below 0.1%. Because the orbit
 * passes the pole about 150 times a month, even a weak signal maps a lot: the fade is steep so
 * that the ice map shrinks steadily over 1 to 3 times the limit instead of all at once.
 */
export function iceSignal(limitKm: number | null, altitudeKm: number): number {
  if (limitKm === null || altitudeKm <= limitKm) return 1
  const q = Math.exp(-(altitudeKm - limitKm) / (limitKm / 4))
  return q < 0.001 ? 0 : q
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
export interface LinkLoss {
  /** MB a month the link cannot send: it waits in storage until storage is full */
  backlogPerMonth: number
  /** Months until storage is full (Infinity when the link keeps up) */
  monthsToFill: number
  /** MB lost each month once storage is full (what scienceTurn drops every month from then on) */
  lostPerMonth: number
  /** lostPerMonth as a share of the data made (0..1) */
  lostShare: number
}

/**
 * The one model of data loss, the same one scienceTurn runs month by month: what the link
 * cannot send waits in storage; once storage is full, all of it is lost every month.
 * The Data Link check and the Comms storage tray both read this (number truth, 15 Nov).
 */
export function linkLoss(dataPerTurn: number, downlinkPerTurn: number, storageCapacity: number): LinkLoss {
  const made = Math.max(0, dataPerTurn)
  const backlog = Math.max(0, made - Math.max(0, downlinkPerTurn))
  const cap = Math.max(0, storageCapacity)
  return {
    backlogPerMonth: backlog,
    monthsToFill: backlog > 0 ? cap / backlog : Infinity,
    lostPerMonth: backlog,
    lostShare: made > 0 ? backlog / made : 0,
  }
}

/** "in about 2 months" / "within the first month": when storage fills */
export function fillWhen(loss: Pick<LinkLoss, 'monthsToFill'>): string {
  if (!Number.isFinite(loss.monthsToFill)) return 'never'
  if (loss.monthsToFill < 1) return 'within the first month'
  const m = Math.round(loss.monthsToFill)
  return `in about ${m} month${m === 1 ? '' : 's'}`
}

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

/**
 * [ice coverage %, science data MB, sunlit-ground coverage %, outreach MB].
 * Two ice instruments map independent strips, so their coverage combines:
 * 1 - (1 - a)(1 - b) (balance redesign, 14 Nov; before, only the better one counted).
 */
export function scienceTotals(design: Design, st: ScienceState): [number, number, number, number] {
  let unmapped = 1
  let data = 0
  let context = 0
  let outreach = 0
  for (const id of design.instruments) {
    const inst = getPartById(id) as InstrumentPart | undefined
    if (!inst) continue
    if (inst.seesShadow) unmapped *= 1 - st.mapped[id] / 100
    if (inst.kind === 'context') context = Math.max(context, st.mapped[id])
    if (inst.kind === 'outreach') outreach += st.returned[id]
    else data += st.returned[id]
  }
  return [100 * (1 - unmapped), data, context, outreach]
}

/**
 * Ice coverage the craft has observed, home or not, in %: the same combination as scienceTotals but
 * over what was seen. What it shows above scienceTotals' ice is on board, waiting for a downlink.
 */
export function observedIce(design: Design, st: ScienceState): number {
  let unseen = 1
  for (const id of design.instruments) {
    const inst = getPartById(id) as InstrumentPart | undefined
    if (inst?.seesShadow) unseen *= 1 - (st.observed[id] ?? 0) / 100
  }
  return 100 * (1 - unseen)
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
  const arrival =
    transfer?.arrivalExcessKms !== undefined
      ? { excessKms: transfer.arrivalExcessKms, correction: transfer.courseCorrection ?? C.courseCorrectionLowEnergy }
      : undefined
  const baseInsert = insertionDeltaV(propulsion, transferType, orbit, arrival)
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
    // A worked-out transfer sets its own months of cruise, scaled by the ride (a lander near the Moon halves it)
    const cruise =
      transfer?.days !== undefined
        ? Math.round(transfer.durationTurns * ((ride?.cruiseTurns ?? C.cruiseTurns) / C.cruiseTurns))
        : (ride?.cruiseTurns ?? C.cruiseTurns)
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
    // Above its altitude limit an ice instrument's signal fades (fewer laser returns, blurrier neutron counts):
    // it maps less the higher it flies, and nothing from about three times its limit
    let q = iceSignal(limit, altitude)
    if (!precise) q *= inst.qualityWithoutPrecisePointing
    quality[inst.id] = q
    // At most C.mappingPassesCap passes a month map: the rest go to downlink, charging and orbit trims
    const mappingPasses = Math.min(orbit?.passesPerTurn ?? 0, C.mappingPassesCap)
    coverageRate[inst.id] = 1 - Math.exp(-mappingPasses * inst.footprint * q * scienceDuty)
    dataPerTurn += inst.dataPerTurn * scienceDuty
  }

  // --- step 7: money
  const turns = brief.missionDurationTurns
  const opsCostPerTurn = C.teamCostFlight + groundCostPerTurn
  const rideCost = ride?.cost ?? 0
  const costPrelaunch = partsCost + C.teamCostPrelaunch * rideTurn + C.testCost * testTurns + rideCost
  // The cruise runs on a smaller team than the science phase (balance redesign, 14 Nov)
  const transferCostPerTurn =
    C.teamCostCruise + groundCostPerTurn + (propulsion && !propulsion.impulsive ? C.electricNavCost : 0)
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
    sunlitShare: sunlit,
    observingShare: observing,
    averagePowerLeft: averageLeft,
    transmitShare,
    batteryUsableWh,
    batteryNeedWh,
    batteryOk: batteryUsableWh >= batteryNeedWh,
    batteryLongNeedWh: busPower * C.longEclipseHours,
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
  // No way to the Moon (no capture, or an engine that cannot thrust): no science to project
  const cleanTurns = transferTurns === null ? 0 : Math.min(turns, upkeepTurns)
  for (let i = 0; i < cleanTurns; i++) scienceTurn(design, budgets, science)
  ;[budgets.projectedCoverage, budgets.projectedData, budgets.projectedContext, budgets.projectedOutreach] =
    scienceTotals(design, science)
  budgets.projectedLost = science.lost
  return budgets
}

/**
 * The design a new game starts from: a Lunar IceCube-like ion craft with the laser reflectometer,
 * in the Orbit step's own 15 km polar orbit (LunaH-Map's 15 x 3,150 km). Left as it is, it can fly
 * the mission. (Until 15 Nov it carried the IR spectrometer, blind in shadow, as the first lesson.)
 */
export function createDefaultDesign(): Design {
  return {
    planning: {
      buildTurns: 0,
      testTurns: 1,
      // It starts with no reserve, so the first fix in flight it cannot pay teaches the reserve
      // (it costs 21.3 M of the 25 M since the balance redesign; 24.9 M before)
      reservePercent: 0,
    },
    // The laser sees into the shadowed craters: left as it is, the starting craft can fly the mission
    // (all checks go, about 92% full success). It was the IR spectrometer, a trap, before 15 Nov.
    instruments: ['inst-laser'],
    structure: 'bus-6u',
    solar: 'solar-2wing',
    battery: 'battery-large',
    radio: 'radio-sband',
    computer: 'computer-basic',
    attitude: 'attitude-basic',
    propulsion: 'prop-ion-large',
    orbit: polarOrbitId(15),
    ride: 'ride-lunar',
    transfer: 'transfer-low-energy',
    groundStation: 'ground-medium',
    contactHours: 1,
  }
}
