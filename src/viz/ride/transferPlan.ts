/**
 * The transfer view: one draggable flight time from the drop-off to the Moon, everything else
 * worked out by the logic core. Pure: the dashboard and the 3D view both read this.
 */
import type { Difficulty } from '../../data/brief'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { getRideById } from '../../data/rides'
import {
  DIRECT_MAX_DAYS,
  LOW_ENERGY_DAYS,
  TRANSFER_MAX_DAYS,
  TRANSFER_MIN_DAYS,
  getTransferById,
  timedTransfer,
  timedTransferDays,
  transferDays,
} from '../../data/transfers'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import type { Design } from '../../sim/types'

const LOG_MIN = Math.log(TRANSFER_MIN_DAYS)
const LOG_MAX = Math.log(TRANSFER_MAX_DAYS)

/** The shortest flight this engine can fly: an ion engine needs the slow, low-energy end */
export function minDaysFor(design: Design): number {
  const engine = getPartById(design.propulsion) as PropulsionPart | undefined
  return engine && !engine.impulsive ? LOW_ENERGY_DAYS : TRANSFER_MIN_DAYS
}

/** Drag position 0..1 to days, logarithmic (the quick paths differ most) */
export function daysAt(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return Math.round(Math.exp(LOG_MIN + x * (LOG_MAX - LOG_MIN)))
}

export function positionOfDays(days: number): number {
  return (Math.log(Math.min(TRANSFER_MAX_DAYS, Math.max(TRANSFER_MIN_DAYS, days))) - LOG_MIN) / (LOG_MAX - LOG_MIN)
}

/** Days of the design's transfer, named or worked out */
export function designDays(design: Design): number {
  const t = getTransferById(design.transfer)
  return timedTransferDays(design.transfer) ?? (t ? transferDays(t) : 120)
}

export interface TransferPlan {
  days: number
  /** 'direct' | 'phasing' | 'low-energy' */
  kind: 'direct' | 'phasing' | 'low-energy'
  name: string
  rideName: string
  /** Mission month the ride leaves Earth (month 0 = today) */
  departureMonth: number
  /** Mission month the craft reaches the Moon */
  arrivalMonth: number
  /** Speed left over on arrival, km/s: what the capture burn has to remove */
  arrivalKms: number
  capture: number | null
  tank: number
  /** Propellant left for holding the orbit, m/s */
  leftAfter: number | null
  monthsHeld: number
  /** Months between the drop-off and the capture (an ion engine adds its slow spiral); null = cannot get there */
  cruiseMonths: number | null
  minDays: number
  ionEngine: boolean
  checks: { label: string; status: 'green' | 'yellow' | 'red'; reason: string }[]
}

const ROWS: Record<string, string> = { 'Delta-v': 'Fuel', Budget: 'Budget' }

export function transferPlan(design: Design, difficulty: Difficulty): TransferPlan {
  const days = designDays(design)
  const t = timedTransfer(days)
  const ride = getRideById(design.ride)
  const b = computeBudgets(design, difficulty)
  const g = goNoGo(design, b)
  const engine = getPartById(design.propulsion) as PropulsionPart | undefined
  const departureMonth = ride?.departureTurn ?? 8
  const cruiseMonths = b.transferTurns ?? Math.round(days / 30)
  return {
    days,
    kind: days <= DIRECT_MAX_DAYS ? 'direct' : days < LOW_ENERGY_DAYS ? 'phasing' : 'low-energy',
    name: t.name,
    rideName: ride?.name ?? 'No ride',
    departureMonth,
    arrivalMonth: departureMonth + Math.max(0, cruiseMonths),
    arrivalKms: t.arrivalExcessKms ?? 0,
    capture: b.captureDeltaV,
    tank: b.deltaVAvailable,
    leftAfter: b.captureDeltaV === null ? null : b.deltaVAfterCapture,
    monthsHeld: b.upkeepTurns,
    cruiseMonths: b.transferTurns,
    minDays: minDaysFor(design),
    ionEngine: !!engine && !engine.impulsive,
    checks: g.checks.filter((c) => ROWS[c.resource]).map((c) => ({ label: ROWS[c.resource], status: c.status, reason: c.reason })),
  }
}

/**
 * Why the player cannot go on from the transfer yet, or null. A blocker is a red check on this view
 * (fuel, budget), a flight an ion engine cannot brake from, or a Moon the craft never reaches.
 */
export function transferBlocker(plan: TransferPlan): string | null {
  const red = plan.checks.some((c) => c.status === 'red')
  const ionTooFast = plan.ionEngine && plan.days < plan.minDays
  return red || ionTooFast || plan.cruiseMonths === null ? 'Fix the transfer first' : null
}

export { DIRECT_MAX_DAYS, LOW_ENERGY_DAYS, TRANSFER_MAX_DAYS, TRANSFER_MIN_DAYS }
