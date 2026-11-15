import { getRideById } from '../data/rides'
import { getTransferById, isTransferCompatible } from '../data/transfers'
import { getPartById, type InstrumentPart, type PropulsionPart, type RadioPart } from '../data/parts'
import { lunarIceMapperBrief, modelConstants as C } from '../data/brief'
import { buildings, instrumentLabLevel, researchLabLevel } from '../data/agency'
import { fillWhen, linkLoss } from './budgets'
import { COVERAGE_TARGET } from './evaluate'
import type { Design, Budgets, CheckResult, GoNoGoResult, BarStatus, DesignStep } from './types'

/** Where the reserve is set: the Planning step's building (viz/missionMap BUILDING_STEPS; numberTruth.test checks they agree) */
export const PLANNING_BUILDING = buildings.find((x) => x.id === 'comms-center')?.name ?? 'Communications Center'

/**
 * Why the instruments get no power, naming the real cause (QC, 15 Nov). budgets.ts takes the lower of
 * two limits: the array in full sun minus the bus, and the power left averaged over the orbit (shadow
 * and radio time). The sentence names whichever one stops the instruments, with at most three numbers.
 */
export function powerShortReason(b: Budgets): string {
  const pct = Math.round(b.scienceDuty * 100)
  const leftInSun = b.powerGenerated - b.busPower
  // The same two limits budgets.ts takes the lower of: full sun, or averaged over the orbit
  if (b.instrumentPower > 0 && leftInSun / b.instrumentPower <= b.scienceDuty + 1e-9)
    return `Even in full sun the array leaves ${leftInSun} W after the bus, and the instruments need ${b.instrumentPower} W: they can run only ${pct}% of the time they could.`
  return `Averaged over the orbit’s shadow and radio time, power only lets the instruments run ${pct}% of the time they could.`
}

export function powerZeroReason(b: Budgets): string {
  if (b.powerGenerated <= b.busPower)
    return `In full sun the array makes ${b.powerGenerated} W and the bus alone takes ${b.busPower} W: nothing is left for the instruments. Fit a larger solar array.`
  if (b.observingShare <= 0) return 'This orbit never passes over the pole, so the instruments have nothing to observe. Choose another orbit.'
  return (
    `In full sun the array makes ${b.powerGenerated} W, but this orbit is sunlit only ${Math.round(b.sunlitShare * 100)}% of the time` +
    (b.contactHours > 0 ? ` and the radio transmits ${b.contactHours} h a day` : '') +
    `: averaged over the orbit, the bus${b.contactHours > 0 ? ' and the radio' : ''} use it all, so nothing is left for the instruments. ` +
    `Fit a larger solar array${b.contactHours > 0 ? ', choose an orbit with more sunlight, or book fewer contact hours' : ' or choose an orbit with more sunlight'}.`
  )
}

export type { GoNoGoResult }

/** Green with 15% to spare (or the given share), yellow when it just fits, red when it does not. */
function band(spareShare: number, green = C.greenMargin): BarStatus {
  return spareShare >= green ? 'green' : spareShare >= 0 ? 'yellow' : 'red'
}

function check(
  resource: string,
  status: BarStatus,
  value: number,
  limit: number,
  unit: string,
  reason: string,
  fixStep?: DesignStep
): CheckResult {
  return { resource, status, value, limit, margin: limit - value, unit, reason, fixStep: status === 'green' ? undefined : fixStep }
}

/**
 * Run Go/No-Go checks on a design. Any red bar blocks the launch; every
 * yellow and red bar says why in plain words and names the step that fixes it.
 */
/**
 * labDay: the agency base day, for the Research Lab lock. Left out, nothing is locked
 * (trial designs, tests, older callers). unlocks: level per instrument; the MVP table is
 * empty, so nothing is locked until the agency extension fills it.
 */
export function goNoGo(
  design: Design,
  budgets: Budgets,
  labDay?: number,
  unlocks: Record<string, number> = instrumentLabLevel
): GoNoGoResult {
  const b = budgets
  const spare = Math.round(C.greenMargin * 100)
  const turns = lunarIceMapperBrief.missionDurationTurns
  const ride = getRideById(design.ride)
  const transfer = getTransferById(design.transfer)
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const radio = getPartById(design.radio) as RadioPart | undefined
  const dataTarget = lunarIceMapperBrief.requirements.find((r) => r.id === 'data')?.target ?? 300
  const checks: CheckResult[] = []

  // Mass (the ride's limit when it is lower than the brief's 14 kg)
  // Mass warns below 8% spare: at 15% nearly every design was yellow (Jakob, 14 Nov)
  let status = band(b.massMargin / b.massLimit, C.massGreenMargin)
  checks.push(
    check(
      'Mass',
      status,
      b.totalMass,
      b.massLimit,
      'kg',
      status === 'red'
        ? `The fuelled craft weighs ${b.totalMass.toFixed(1)} kg; ${ride && ride.massLimit < lunarIceMapperBrief.constraints.maxMass ? `this ride takes ${ride.massLimit} kg` : `the limit is ${b.massLimit} kg`}. Choose lighter parts or less propellant.`
        : status === 'yellow'
          ? `Less than ${Math.round(C.massGreenMargin * 100)}% mass to spare.`
          : `${b.massMargin.toFixed(1)} kg to spare (propellant included).`,
      'spacecraft'
    )
  )

  // Volume
  status = band(b.volumeMargin / b.volumeLimit)
  checks.push(
    check(
      'Volume',
      status,
      b.totalVolume,
      b.volumeLimit,
      'U',
      status === 'red'
        ? `The parts need ${b.totalVolume.toFixed(2)} U but the box holds ${b.volumeLimit} U. Drop an instrument or the dish, or take a smaller tank.`
        : status === 'yellow'
          ? `Less than ${spare}% of the box is spare.`
          : `${b.volumeMargin.toFixed(1)} U to spare.`,
      'spacecraft'
    )
  )

  // Time
  status = b.timeMarginTurns < 0 ? 'red' : b.timeMarginTurns === 0 ? 'yellow' : 'green'
  checks.push(
    check(
      'Time',
      status,
      b.readyTurn,
      b.rideTurn,
      'month',
      status === 'red'
        ? `Ready in month ${b.readyTurn} (${b.buildTurns} month${b.buildTurns === 1 ? '' : 's'} of building, plus testing), but the ride leaves in month ${b.rideTurn}. Test less, choose simpler parts, or take a later ride.`
        : status === 'yellow'
          ? 'Ready exactly on the ride month. One build delay and you miss the ride.'
          : `Ready ${b.timeMarginTurns} month(s) before the ride.`,
      'planning'
    )
  )

  // Propulsion, ride and transfer: can the craft get into the science orbit at all?
  const need = (b.captureDeltaV ?? 0) + b.deltaVStationKeeping * turns
  let reason = ''
  let fix: DesignStep = 'spacecraft'
  if (!propulsion || propulsion.propellantMass <= 0) {
    status = 'red'
    reason = 'Without propulsion the craft cannot brake into lunar orbit; it flies past the Moon.'
  } else if (ride && propulsion.type === 'electric' && !ride.electricCompatible) {
    status = 'red'
    reason = `${ride.name} does not suit an ion engine.`
    fix = 'ride'
  } else if (ride && propulsion.type !== 'electric' && !ride.chemicalCompatible) {
    status = 'red'
    reason = `From ${ride.name} only an ion engine can climb out to the Moon: a chemical tank would need far more than ${ride.extraDeltaV} m/s.`
    fix = 'ride'
  } else if (transfer && !isTransferCompatible(transfer, propulsion.type)) {
    status = 'red'
    reason = 'An ion engine is too weak to brake on a fast fly-by. Choose the low-energy transfer.'
    fix = 'ride'
  } else if (b.captureDeltaV === null) {
    status = 'red'
    reason = 'This engine cannot get into the chosen orbit. Choose another orbit or transfer.'
    fix = 'orbit'
  } else if (b.thrustLevel === 0) {
    status = 'red'
    reason = `The ion engine needs ${propulsion.minThrustPower} W. While thrusting it may use three quarters of the ${b.powerGenerated} W array, and the bus takes its share of that first: ${Math.max(0, b.thrustPower).toFixed(0)} W are left for the engine. Fit the large solar array.`
  } else if (b.deltaVAvailable < b.captureDeltaV) {
    status = 'red'
    reason = `The tank gives ${b.deltaVAvailable.toFixed(0)} m/s; capturing into this orbit needs ${b.captureDeltaV.toFixed(0)}. Carry more propellant, save mass, or change the orbit or transfer.`
    fix = 'orbit'
  } else {
    status = band((b.deltaVAvailable - need) / need)
    reason =
      status === 'red'
        ? `Enough to capture, but not to hold the orbit for ${turns} months (${b.upkeepTurns} months of upkeep on board).`
        : status === 'yellow'
          ? `Less than ${spare}% delta-v to spare. A weak thruster would end the mission.`
          : `${(b.deltaVAvailable - need).toFixed(0)} m/s to spare after capture and ${turns} months of upkeep.`
    fix = 'orbit'
  }
  checks.push(check('Delta-v', status, need, b.deltaVAvailable, 'm/s', reason, fix))

  // Power
  if (b.scienceDuty <= 0) {
    status = 'red'
    reason = powerZeroReason(b)
  } else if (!b.batteryOk) {
    status = 'red'
    reason = `Each orbit has an eclipse that needs ${b.batteryNeedWh.toFixed(0)} Wh; the battery gives ${b.batteryUsableWh.toFixed(0)} Wh. Fit a larger battery or choose an orbit with less shadow.`
  } else if (b.scienceDuty < 1) {
    status = 'yellow'
    reason = powerShortReason(b)
  } else if (!b.batteryLongOk) {
    status = 'yellow'
    reason = `The battery cannot carry the bus through a long eclipse: ${C.longEclipseHours} hours of shadow need ${b.batteryLongNeedWh.toFixed(0)} Wh, the battery gives ${b.batteryUsableWh.toFixed(0)} Wh. Science stops in those months.`
  } else {
    status = 'green'
    reason = `Instruments can run all the time; the battery covers the eclipses.`
  }
  checks.push(check('Power', status, b.powerConsumed, b.powerGenerated, 'W', reason, 'spacecraft'))

  // Comms
  fix = 'comms'
  if (b.downlinkPerTurn <= 0) {
    status = 'red'
    if (radio && !radio.reachesMoon) reason = 'The UHF radio works in low Earth orbit; it does not reach Earth from the Moon. Choose a deep-space radio.'
    else if (b.contactHours <= 0) reason = 'No contact time is booked with the ground station.'
    else {
      reason = 'No power is left to transmit. Fit a larger solar array.'
      fix = 'spacecraft'
    }
  } else if (b.transmitShare < 1) {
    status = 'yellow'
    reason = `Power only lets the radio transmit ${Math.round(b.transmitShare * 100)}% of the contact time.`
    fix = 'spacecraft'
  } else {
    status = 'green'
    reason = `${b.linkKbps} kbps for ${b.contactHours} h a day.`
  }
  checks.push(check('Comms', status, b.linkKbps, b.linkKbps, 'kbps', reason, fix))

  // Data
  if (b.downlinkPerTurn <= 0 || b.dataPerTurn <= 0) {
    status = 'red'
    reason = b.downlinkPerTurn <= 0 ? 'Nothing can be sent home: see Comms.' : 'The instruments make no data: they have no power.'
  } else if (b.downlinkPerTurn >= b.dataPerTurn * (1 + C.greenMargin)) {
    status = 'green'
    reason = `The link carries ${b.downlinkPerTurn.toFixed(0)} MB a month; the instruments make ${b.dataPerTurn.toFixed(0)}.`
  } else if (b.downlinkPerTurn < b.dataPerTurn) {
    status = 'yellow'
    const loss = linkLoss(b.dataPerTurn, b.downlinkPerTurn, b.storageCapacity)
    reason = `The instruments make ${b.dataPerTurn.toFixed(0)} MB a month but the link carries ${b.downlinkPerTurn.toFixed(0)}: the ${b.storageCapacity} MB storage fills ${fillWhen(loss)}, then ${loss.lostPerMonth.toFixed(0)} MB a month (${Math.round(loss.lostShare * 100)}% of the science) is lost, and its coverage with it.`
  } else {
    status = 'yellow'
    reason = `The link carries ${b.downlinkPerTurn.toFixed(0)} MB a month and the instruments make ${b.dataPerTurn.toFixed(0)}: less than ${spare}% to spare. What cannot be sent waits in storage (${b.storageCapacity} MB); overflow is lost, and its coverage with it.`
  }
  checks.push(check('Data Link', status, b.dataPerTurn, b.downlinkPerTurn, 'MB/month', reason, 'comms'))

  // Budget: the reserve is locked for fixes in flight, so the plan must fit in what is left.
  // A bigger reserve means a cheaper craft (Jakob, 14 Nov: the reserve line is a hard limit).
  if (b.totalCost <= b.spendable) {
    status = 'green'
    reason = `${(b.spendable - b.totalCost).toFixed(1)} M to spare, with ${b.reserveAmount.toFixed(1)} M reserve held back for fixes in flight.`
  } else if (b.totalCost <= b.budgetCap) {
    status = 'red'
    reason = `The plan costs ${b.totalCost.toFixed(1)} M but only ${b.spendable.toFixed(1)} M is spendable: the ${b.reserveAmount.toFixed(1)} M reserve is locked for fixes in flight. Lower the reserve at the ${PLANNING_BUILDING} (Planning), or choose cheaper parts.`
  } else {
    status = 'red'
    reason = `The plan costs ${b.totalCost.toFixed(1)} M; the budget is ${b.budgetCap} M. Cheaper parts, a shorter transfer or less ground time bring it down.`
  }
  checks.push(check('Budget', status, b.totalCost, b.budgetCap, '$M', reason, 'spacecraft'))

  // Science: never red. A design that cannot meet the brief may still fly.
  // More coverage is better here, so the margin counts up from the target (check() counts down to a limit).
  const coverageTarget = COVERAGE_TARGET
  const enough = b.projectedCoverage >= coverageTarget && b.projectedData >= dataTarget
  const science = check(
      'Science',
      enough ? 'green' : 'yellow',
      b.projectedCoverage,
      coverageTarget,
      '% ice',
      enough
        ? `Projected ${b.projectedCoverage.toFixed(0)}% ice coverage and ${b.projectedData.toFixed(0)} MB in ${turns} clean months.`
        : `${
            design.instruments.some((id) => (getPartById(id) as InstrumentPart | undefined)?.seesShadow)
              ? ''
              : 'No instrument on board can see into the shadowed craters: fit the laser reflectometer or the neutron spectrometer at the Research Lab. '
          }Even with no bad luck this reaches only ${b.projectedCoverage.toFixed(0)}% ice coverage and ${b.projectedData.toFixed(0)} MB in ${turns} months (needed: ${coverageTarget}% and ${dataTarget} MB); an extended mission of up to ${turns} more months can add some. It may fly, but it is unlikely to fully succeed.`,
      'instruments'
    )
  checks.push({ ...science, margin: b.projectedCoverage - coverageTarget })

  if (labDay !== undefined) checks.push(...researchLabChecks(design, labDay, unlocks))

  const blockers = checks.filter((c) => c.status === 'red')
  const warnings = checks.filter((c) => c.status === 'yellow')
  return { canGo: blockers.length === 0, checks, blockers, warnings }
}

/** The launch is allowed, but the Science check says the craft cannot reach the brief's targets */
export function cannotMeetBrief(result: GoNoGoResult): boolean {
  return result.canGo && result.checks.some((c) => c.resource === 'Science' && c.status !== 'green')
}

/** One red check per instrument aboard that needs a higher Research Lab level than the lab has. */
function researchLabChecks(design: Design, day: number, unlocks: Record<string, number>): CheckResult[] {
  const level = researchLabLevel(day)
  const up = buildings.find((b) => b.id === 'research-lab')?.upgrade
  return design.instruments.flatMap((id) => {
    const needed = unlocks[id] ?? 1
    if (level >= needed) return []
    const name = (getPartById(id) as InstrumentPart | undefined)?.name ?? id
    const when =
      up && up.toLevel >= needed && day < up.endDay
        ? `upgrade done in ${Math.ceil(up.endDay - day)} days at the base; let time run with ▶`
        : 'upgrade it at the base'
    return [check('Research Lab', 'red', level, needed, 'LV', `${name} needs Research Lab level ${needed}; the lab is level ${level} (${when}).`, 'instruments')]
  })
}

/**
 * Get a summary of the Go/No-Go decision.
 */
export function getGoNoGoSummary(result: GoNoGoResult): string {
  // Science never blocks, but a Go must not read as an endorsement of a doomed craft (Jakob, 14 Nov)
  if (cannotMeetBrief(result)) {
    return 'Go, but this craft cannot meet the brief: it may fly, but even with no bad luck it falls short.'
  }
  if (result.canGo && result.warnings.length === 0) {
    return 'All systems go. Ready for launch.'
  }
  if (result.canGo) {
    return `Go with caution: ${result.warnings.length} warning(s) to watch.`
  }
  return `No-Go: ${result.blockers.length} critical issue(s) must be resolved.`
}
