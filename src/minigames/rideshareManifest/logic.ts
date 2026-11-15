import { modelConstants as C } from '../../data/brief'
import type { Difficulty } from '../../data/brief'
import { missedRideWaitTurns, rides, type Ride } from '../../data/rides'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import type { CheckResult, Design } from '../../sim/types'
import type { Insight, MinigameResult } from '../contract'

/** Pure rules of "Rideshare Manifest": schedule slack, mass fit, ride compatibility, the result. Numbers all come from src/sim and src/data. */

export interface MassFit {
  mass: number
  limit: number
  margin: number
  /** ok: room to spare; tight: fits with little to spare; over: the door will not close */
  status: 'ok' | 'tight' | 'over'
  reason: string
}

export interface RideRow {
  ride: Ride
  /** Where the ride drops you, in the board's words */
  destination: string
  departure: number
  price: number
  massLimit: number
  /** Month the CubeSat is ready (build + test + integration, from the sim) */
  ready: number
  /** Departure month minus ready month; negative means the ride leaves without you */
  slack: number
  missed: boolean
  /** False when this ride cannot take the craft's engine at all (ion needs GTO, chemical cannot climb out) */
  compatible: boolean
  incompatibleReason: string | null
}

export function destinationLabel(ride: Ride): string {
  switch (ride.dropOffOrbit) {
    case 'gto':
      return 'GTO'
    case 'trans-lunar':
      return 'Lunar trajectory'
    default:
      return 'Lunar vicinity'
  }
}

function withRide(design: Design, rideId: string): Design {
  return { ...design, ride: rideId }
}

function checkOf(design: Design, difficulty: Difficulty, rideId: string, resource: string): CheckResult | undefined {
  const d = withRide(design, rideId)
  return goNoGo(d, computeBudgets(d, difficulty)).checks.find((c) => c.resource === resource)
}

const TRANSFER_REASON = /fast fly-by|low-energy/

/** Compatibility of the craft's engine with a ride: the sim's own Delta-v check, when it blames the ride */
export function rideCompat(design: Design, difficulty: Difficulty, rideId: string): { ok: boolean; reason: string | null } {
  const c = checkOf(design, difficulty, rideId, 'Delta-v')
  if (c && c.status === 'red' && c.fixStep === 'ride' && !TRANSFER_REASON.test(c.reason)) return { ok: false, reason: c.reason }
  return { ok: true, reason: null }
}

/** The engine/transfer clash the player should hear about even though another ride cannot fix it */
export function transferNudge(design: Design, difficulty: Difficulty, rideId: string): string | null {
  const c = checkOf(design, difficulty, rideId, 'Delta-v')
  return c && c.status === 'red' && c.fixStep === 'ride' && TRANSFER_REASON.test(c.reason) ? c.reason : null
}

export function buildRows(design: Design, difficulty: Difficulty): RideRow[] {
  return rides.map((ride) => {
    const b = computeBudgets(withRide(design, ride.id), difficulty)
    const compat = rideCompat(design, difficulty, ride.id)
    return {
      ride,
      destination: destinationLabel(ride),
      departure: ride.departureTurn,
      price: ride.cost,
      massLimit: b.massLimit,
      ready: b.readyTurn,
      slack: ride.departureTurn - b.readyTurn,
      missed: ride.departureTurn < b.readyTurn,
      compatible: compat.ok,
      incompatibleReason: compat.reason,
    }
  })
}

export function isSelectable(row: RideRow): boolean {
  return !row.missed && row.compatible
}

/** When nothing on the board suits the craft, any ticket is accepted (and the player is told the cost) */
export function boardIsStuck(rows: RideRow[]): boolean {
  return rows.every((r) => !isSelectable(r))
}

export type PickOutcome =
  | { kind: 'ok' }
  | { kind: 'missed'; flap: string; line: string }
  | { kind: 'nofit'; flap: string; line: string }

/** Reyes' words for a missed ride: the wait and what it costs */
export function waitLine(row: RideRow): string {
  const late = row.ready - row.departure
  return `The ${row.ride.name} leaves in month ${row.departure}; your CubeSat is ready in month ${row.ready}, ${late} month${late === 1 ? '' : 's'} late. Miss a ride and the next is about ${missedRideWaitTurns} months away, and the team costs $${C.teamCostPrelaunch.toFixed(2)}M every month it waits.`
}

export function pickOutcome(rows: RideRow[], rideId: string): PickOutcome {
  const row = rows.find((r) => r.ride.id === rideId)
  if (!row || boardIsStuck(rows)) return { kind: 'ok' }
  if (!row.compatible) return { kind: 'nofit', flap: 'NO FIT', line: row.incompatibleReason ?? 'This ride does not suit your engine.' }
  if (row.missed) return { kind: 'missed', flap: 'MISSED', line: waitLine(row) }
  return { kind: 'ok' }
}

export function massFit(design: Design, difficulty: Difficulty, rideId: string): MassFit {
  const b = computeBudgets(withRide(design, rideId), difficulty)
  const c = checkOf(design, difficulty, rideId, 'Mass')
  const status: MassFit['status'] = b.massMargin < 0 ? 'over' : b.massMargin / b.massLimit < C.massGreenMargin ? 'tight' : 'ok'
  return { mass: b.totalMass, limit: b.massLimit, margin: b.massMargin, status, reason: c?.reason ?? '' }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function buildResult(args: {
  design: Design
  difficulty: Difficulty
  rideId: string
  /** The rocket as cycled in the pride corner, when the player touched it */
  rocket?: Design['rocket']
  durationS: number
}): MinigameResult {
  const { design, difficulty, rideId, rocket, durationS } = args
  const row = buildRows(design, difficulty).find((r) => r.ride.id === rideId)!
  const fit = massFit(design, difficulty, rideId)
  const waitText =
    row.slack >= 0
      ? `Your ride leaves in month ${row.departure}; the CubeSat is ready in month ${row.ready}.`
      : `Your ride leaves in month ${row.departure}, but the CubeSat is ready in month ${row.ready}: you wait for the next ride.`
  const insights: Insight[] = [
    { id: 'ride-wait', room: 'launch-hangar', text: waitText, metric: { label: 'slack', value: row.slack, unit: 'months' } },
    {
      id: 'ride-mass',
      room: 'launch-hangar',
      text: `The fuelled craft weighs ${round1(fit.mass)} kg; this ride takes ${fit.limit} kg.`,
      metric: { label: 'mass margin', value: round1(fit.margin), unit: 'kg' },
    },
  ]
  return { patch: rocket ? { ride: rideId, rocket } : { ride: rideId }, insights, durationS: Math.round(durationS) }
}
