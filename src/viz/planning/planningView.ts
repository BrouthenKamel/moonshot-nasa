import { modelConstants as C } from '../../data/brief'
import { missedRideWaitTurns } from '../../data/rides'
import type { Budgets, CheckResult, Design } from '../../sim/types'

/**
 * Everything the mission control room shows on the Planning step, derived
 * from the game's own budgets and Go/No-Go checks (one source of truth).
 */

export type StatusLevel = 'nominal' | 'caution' | 'alert'

export interface CostBlock {
  key: 'parts' | 'team' | 'ride' | 'testing' | 'flight' | 'other'
  label: string
  amount: number // $M
}

export interface TimelineBlock {
  key: 'design' | 'build' | 'test' | 'fit'
  label: string
  start: number // months from the start, 0-based
  length: number // months
}

/** A Go / No-Go check this step can turn red, with goNoGo's own plain-words reason. */
export interface StepCheck {
  resource: 'Time' | 'Budget'
  status: 'green' | 'yellow' | 'red'
  reason: string
}

export interface PlanningView {
  cap: number
  reserve: number
  spendable: number
  totalCost: number
  costBlocks: CostBlock[]
  budgetState: 'free' | 'eating' | 'over'
  budgetGap: number // free: spendable - total; eating: total - spendable; over: total - cap
  timeline: TimelineBlock[]
  readyMonth: number
  rideMonth: number
  marginMonths: number
  monthCount: number
  headline: string
  nextRideMonth: number
  testTurns: number
  testCost: number
  riskFactor: number
  riskCaption: string
  buildTurns: number
  meterValue: number
  reservePercent: number
  status: { level: StatusLevel; chip: string }
  checks: StepCheck[] // Time, then Budget
  readouts: { test: string; build: string; reserve: string }
}

const finite = (x: number | null | undefined, fallback = 0) => (Number.isFinite(x) ? (x as number) : fallback)
const money = (x: number) => `$${x.toFixed(1)}M`
const months = (n: number) => `${n} MONTH${n === 1 ? '' : 'S'}`

export const METER_MAX = 6

export function buildPlanningView(design: Design, budgets: Budgets, checks: CheckResult[]): PlanningView {
  const testTurns = design.planning.testTurns
  const reservePercent = design.planning.reservePercent
  const rideMonth = finite(budgets.rideTurn, 8)
  const buildTurns = finite(budgets.buildTurns)
  const totalCost = finite(budgets.totalCost)
  const cap = finite(budgets.budgetCap)
  const reserve = finite(budgets.reserveAmount)
  const spendable = finite(budgets.spendable, cap - reserve)
  const testCost = C.testCost * testTurns

  // Budget tank: named blocks, plus "Other" for anything the names miss
  const named: CostBlock[] = [
    { key: 'parts', label: 'Parts', amount: finite(budgets.partsCost) },
    { key: 'team', label: 'Team until launch', amount: C.teamCostPrelaunch * rideMonth },
    { key: 'ride', label: 'Ride', amount: finite(budgets.rideCost) },
    { key: 'testing', label: 'Testing', amount: testCost },
    { key: 'flight', label: 'Flight', amount: finite(budgets.operationsCost) },
  ]
  const namedSum = named.reduce((s, b) => s + b.amount, 0)
  const diff = totalCost - namedSum
  const costBlocks = named.map((b) => ({ ...b, amount: Math.max(0, b.amount) }))
  if (diff > 0.005) costBlocks.push({ key: 'other', label: 'Other', amount: diff })
  else if (diff < -0.005) {
    // Named costs exceed the total (should not happen): scale them down so the tank matches the dashboard
    const k = namedSum > 0 ? totalCost / namedSum : 0
    costBlocks.forEach((b) => (b.amount = Math.max(0, b.amount * k)))
  }
  const blockSum = costBlocks.reduce((s, b) => s + b.amount, 0)
  if (blockSum > 0 && Math.abs(blockSum - totalCost) > 0) {
    // Put any rounding remainder in the largest block so the stack equals the total exactly
    const biggest = costBlocks.reduce((a, b) => (b.amount > a.amount ? b : a))
    biggest.amount = Math.max(0, biggest.amount + (totalCost - blockSum))
  }

  const budgetState: PlanningView['budgetState'] = totalCost > cap ? 'over' : totalCost > spendable ? 'eating' : 'free'
  const budgetGap = budgetState === 'over' ? totalCost - cap : budgetState === 'eating' ? totalCost - spendable : spendable - totalCost

  // Road to launch
  const timeline: TimelineBlock[] = []
  let at = 0
  const push = (key: TimelineBlock['key'], label: string, length: number) => {
    if (length <= 0) return
    timeline.push({ key, label, start: at, length })
    at += length
  }
  push('design', 'DESIGN', C.designTurns)
  push('build', 'BUILD', buildTurns)
  push('test', 'TEST', testTurns)
  push('fit', 'FIT', C.integrationTurns)
  const readyMonth = finite(budgets.readyTurn, at)
  const marginMonths = rideMonth - readyMonth
  const headline =
    marginMonths > 0 ? `${months(marginMonths)} SPARE` : marginMonths === 0 ? 'NO SPARE TIME' : `MISSED BY ${months(-marginMonths)}`

  // Flight risk
  const riskFactor = finite(budgets.testFactor, 1)
  const riskCaption =
    riskFactor > 1 ? 'failures in flight more likely' : riskFactor < 1 ? 'failures in flight less likely' : 'normal odds of failure in flight'

  // Room status: only this step's checks drive the room. A missed ride is the
  // alarm (the knob causes it); over budget is a caution here, because the
  // parts cause it and the Factory (spacecraft step) fixes it.
  const statusOf = (resource: string) => checks.find((c) => c.resource === resource)?.status ?? 'green'
  const time = statusOf('Time')
  const budget = statusOf('Budget')
  let status: PlanningView['status']
  if (time === 'red') status = { level: 'alert', chip: 'RIDE MISSED' }
  else if (budget === 'red') status = { level: 'caution', chip: 'OVER BUDGET' }
  else if (testTurns === 0) status = { level: 'caution', chip: 'CAUTION: UNTESTED' }
  else if (reservePercent === 0) status = { level: 'caution', chip: 'CAUTION: NO RESERVE' }
  else if (time === 'yellow') status = { level: 'caution', chip: 'CAUTION: NO SPARE TIME' }
  else if (budget === 'yellow') status = { level: 'caution', chip: 'CAUTION: EATING THE RESERVE' }
  else status = { level: 'nominal', chip: 'ALL NOMINAL' }

  const stepChecks: StepCheck[] = (['Time', 'Budget'] as const).map((resource) => {
    const c = checks.find((x) => x.resource === resource)
    return { resource, status: c?.status ?? 'green', reason: c?.reason ?? '' }
  })

  return {
    cap,
    reserve,
    spendable,
    totalCost,
    costBlocks,
    budgetState,
    budgetGap,
    timeline,
    readyMonth,
    rideMonth,
    marginMonths,
    monthCount: Math.max(10, rideMonth, readyMonth + 1),
    headline,
    nextRideMonth: rideMonth + missedRideWaitTurns,
    testTurns,
    testCost,
    riskFactor,
    riskCaption,
    buildTurns,
    meterValue: Math.max(1, Math.min(buildTurns, METER_MAX)),
    reservePercent,
    status,
    checks: stepChecks,
    readouts: {
      test: `${months(testTurns)} · ${money(testCost)}`,
      build: `${buildTurns} MO · SET AT THE FACTORY`,
      reserve: `${reservePercent}% · ${money(reserve)} LOCKED`,
    },
  }
}
