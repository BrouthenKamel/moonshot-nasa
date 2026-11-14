import { getRideById } from '../data/rides'
import { getTransferById, isTransferCompatible } from '../data/transfers'
import { getPartById, type PropulsionPart } from '../data/parts'
import type { Design, Budgets, CheckResult, GoNoGoResult, BarStatus } from './types'

export type { GoNoGoResult }

/**
 * Determine bar status from margin
 */
function getStatus(margin: number, greenThreshold: number, yellowThreshold: number): BarStatus {
  if (margin >= greenThreshold) return 'green'
  if (margin >= yellowThreshold) return 'yellow'
  return 'red'
}

/**
 * Run Go/No-Go checks on a design.
 */
export function goNoGo(design: Design, budgets: Budgets): GoNoGoResult {
  const checks: CheckResult[] = []

  // === MASS CHECK ===
  const massStatus = getStatus(budgets.massMargin, 1.0, 0)
  checks.push({
    resource: 'Mass',
    status: massStatus,
    value: budgets.totalMass,
    limit: budgets.massLimit,
    margin: budgets.massMargin,
    unit: 'kg',
    reason:
      massStatus === 'red'
        ? `Over mass limit by ${(-budgets.massMargin).toFixed(1)} kg. Remove parts or choose lighter options.`
        : massStatus === 'yellow'
          ? 'At mass limit. No margin for growth.'
          : `${budgets.massMargin.toFixed(1)} kg margin.`,
    fixStep: massStatus === 'red' ? 'spacecraft' : undefined,
  })

  // === VOLUME CHECK ===
  const volumeStatus = getStatus(budgets.volumeMargin, 0.5, 0)
  checks.push({
    resource: 'Volume',
    status: volumeStatus,
    value: budgets.totalVolume,
    limit: budgets.volumeLimit,
    margin: budgets.volumeMargin,
    unit: 'U',
    reason:
      volumeStatus === 'red'
        ? `Over volume limit by ${(-budgets.volumeMargin).toFixed(1)} U. The spacecraft won't fit in the 6U box.`
        : volumeStatus === 'yellow'
          ? 'At volume limit. Tight fit.'
          : `${budgets.volumeMargin.toFixed(1)} U margin.`,
    fixStep: volumeStatus === 'red' ? 'spacecraft' : undefined,
  })

  // === POWER CHECK ===
  const powerStatus = getStatus(budgets.powerMargin, 5, 0)
  checks.push({
    resource: 'Power',
    status: powerStatus,
    value: budgets.powerConsumed,
    limit: budgets.powerGenerated,
    margin: budgets.powerMargin,
    unit: 'W',
    reason:
      powerStatus === 'red'
        ? `Power deficit of ${(-budgets.powerMargin).toFixed(0)} W. Add solar panels or reduce instruments.`
        : powerStatus === 'yellow'
          ? 'Tight power margin. May struggle in non-optimal sun angles.'
          : `${budgets.powerMargin.toFixed(0)} W margin.`,
    fixStep: powerStatus === 'red' ? 'spacecraft' : undefined,
  })

  // === BUDGET CHECK ===
  const budgetStatus = getStatus(budgets.budgetMargin, 1.0, 0)
  checks.push({
    resource: 'Budget',
    status: budgetStatus,
    value: budgets.totalCost,
    limit: budgets.budgetCap,
    margin: budgets.budgetMargin,
    unit: '$M',
    reason:
      budgetStatus === 'red'
        ? `Over budget by $${(-budgets.budgetMargin).toFixed(1)}M. Choose cheaper options or reduce scope.`
        : budgetStatus === 'yellow'
          ? 'At budget limit. No reserve for problems.'
          : `$${budgets.budgetMargin.toFixed(1)}M margin.`,
    fixStep: budgetStatus === 'red' ? 'planning' : undefined,
  })

  // === TIME CHECK ===
  const timeStatus = getStatus(budgets.timeMarginTurns, 1, 0)
  checks.push({
    resource: 'Time',
    status: timeStatus,
    value: budgets.readyTurn,
    limit: budgets.rideTurn,
    margin: budgets.timeMarginTurns,
    unit: 'turns',
    reason:
      timeStatus === 'red'
        ? `Won't be ready until turn ${budgets.readyTurn}, but ride leaves turn ${budgets.rideTurn}. Reduce build/test time or pick a later ride.`
        : timeStatus === 'yellow'
          ? 'Cutting it close. Any delay means missing the ride.'
          : `Ready ${budgets.timeMarginTurns} turn(s) before ride.`,
    fixStep: timeStatus === 'red' ? 'planning' : undefined,
  })

  // === DELTA-V CHECK ===
  const deltaVStatus = getStatus(budgets.deltaVMargin, 100, 0)
  checks.push({
    resource: 'Delta-v',
    status: deltaVStatus,
    value: budgets.deltaVTotal,
    limit: budgets.deltaVAvailable,
    margin: budgets.deltaVMargin,
    unit: 'm/s',
    reason:
      deltaVStatus === 'red'
        ? `Need ${budgets.deltaVTotal.toFixed(0)} m/s but only have ${budgets.deltaVAvailable.toFixed(0)} m/s. Choose different propulsion, transfer, or orbit.`
        : deltaVStatus === 'yellow'
          ? 'Tight fuel margin. Little room for course corrections.'
          : `${budgets.deltaVMargin.toFixed(0)} m/s margin.`,
    fixStep: deltaVStatus === 'red' ? 'ride' : undefined,
  })

  // === DATA/COMMS CHECK ===
  const dataStatus = getStatus(budgets.dataMarginPerTurn, 0.5, 0)
  checks.push({
    resource: 'Data Link',
    status: dataStatus,
    value: budgets.dataPerTurn,
    limit: budgets.downlinkPerTurn,
    margin: budgets.dataMarginPerTurn,
    unit: 'GB/turn',
    reason:
      dataStatus === 'red'
        ? `Generate ${budgets.dataPerTurn.toFixed(1)} GB/turn but can only downlink ${budgets.downlinkPerTurn.toFixed(1)} GB/turn. Data will overflow and be lost.`
        : dataStatus === 'yellow'
          ? 'Downlink barely keeps up. Any contact issues will cause data loss.'
          : `Can downlink ${budgets.dataMarginPerTurn.toFixed(1)} GB/turn more than generated.`,
    fixStep: dataStatus === 'red' ? 'comms' : undefined,
  })

  // === COMPATIBILITY CHECKS ===

  // Ride + propulsion compatibility
  const ride = getRideById(design.ride)
  const transfer = getTransferById(design.transfer)
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined

  if (ride && transfer && propulsion) {
    const isCompatible = isTransferCompatible(transfer, propulsion.type)
    if (!isCompatible) {
      checks.push({
        resource: 'Propulsion Match',
        status: 'red',
        value: 0,
        limit: 1,
        margin: -1,
        unit: '',
        reason: `${transfer.name} requires ${transfer.propulsionType} propulsion, but you have ${propulsion.type}. Choose a compatible transfer or propulsion.`,
        fixStep: 'ride',
      })
    }

    // Check ride propulsion compatibility
    if (propulsion.type === 'electric' && !ride.electricCompatible) {
      checks.push({
        resource: 'Ride Compatibility',
        status: 'red',
        value: 0,
        limit: 1,
        margin: -1,
        unit: '',
        reason: `${ride.name} doesn't support electric propulsion. Choose a different ride or propulsion.`,
        fixStep: 'ride',
      })
    }
    if (propulsion.type === 'chemical' && !ride.chemicalCompatible) {
      checks.push({
        resource: 'Ride Compatibility',
        status: 'red',
        value: 0,
        limit: 1,
        margin: -1,
        unit: '',
        reason: `${ride.name} doesn't support chemical propulsion for this trajectory. Choose a different ride or propulsion.`,
        fixStep: 'ride',
      })
    }

    // Check mass vs ride limit
    if (budgets.totalMass > ride.massLimit) {
      checks.push({
        resource: 'Ride Mass Limit',
        status: 'red',
        value: budgets.totalMass,
        limit: ride.massLimit,
        margin: ride.massLimit - budgets.totalMass,
        unit: 'kg',
        reason: `Spacecraft (${budgets.totalMass.toFixed(1)} kg) exceeds ride mass limit (${ride.massLimit} kg). Reduce mass or choose a different ride.`,
        fixStep: 'spacecraft',
      })
    }
  }

  // Check eclipse survival
  if (budgets.batteryMarginMinutes < 0) {
    checks.push({
      resource: 'Eclipse Survival',
      status: 'red',
      value: budgets.eclipseDurationMinutes,
      limit: budgets.batteryCapacity / budgets.eclipsePowerConsumed * 60,
      margin: budgets.batteryMarginMinutes,
      unit: 'min',
      reason: `Battery can't last through ${budgets.eclipseDurationMinutes.toFixed(0)} minute eclipse. Add battery capacity or reduce power draw.`,
      fixStep: 'spacecraft',
    })
  } else if (budgets.batteryMarginMinutes < 10) {
    checks.push({
      resource: 'Eclipse Survival',
      status: 'yellow',
      value: budgets.eclipseDurationMinutes,
      limit: budgets.batteryCapacity / budgets.eclipsePowerConsumed * 60,
      margin: budgets.batteryMarginMinutes,
      unit: 'min',
      reason: `Only ${budgets.batteryMarginMinutes.toFixed(0)} minute margin for eclipse. Battery degradation could be problematic.`,
      fixStep: 'spacecraft',
    })
  }

  // Check thruster power during electric propulsion
  if (propulsion?.type === 'electric') {
    const powerDuringThrust = budgets.powerGenerated - budgets.thrustingPowerConsumed
    if (powerDuringThrust < budgets.powerConsumed) {
      checks.push({
        resource: 'Thrust Power',
        status: 'yellow',
        value: budgets.thrustingPowerConsumed + budgets.powerConsumed,
        limit: budgets.powerGenerated,
        margin: powerDuringThrust - budgets.powerConsumed,
        unit: 'W',
        reason: `During thrusting, power draw (${(budgets.thrustingPowerConsumed + budgets.powerConsumed).toFixed(0)} W) exceeds generation (${budgets.powerGenerated.toFixed(0)} W). Will need to pause instruments while thrusting.`,
        fixStep: 'spacecraft',
      })
    }
  }

  // Gather blockers and warnings
  const blockers = checks.filter((c) => c.status === 'red')
  const warnings = checks.filter((c) => c.status === 'yellow')
  const canGo = blockers.length === 0

  return {
    canGo,
    checks,
    blockers,
    warnings,
  }
}

/**
 * Get a summary of the Go/No-Go decision.
 */
export function getGoNoGoSummary(result: GoNoGoResult): string {
  if (result.canGo && result.warnings.length === 0) {
    return 'All systems go. Ready for launch.'
  }
  if (result.canGo) {
    return `Go with caution: ${result.warnings.length} warning(s) to watch.`
  }
  return `No-Go: ${result.blockers.length} critical issue(s) must be resolved.`
}
