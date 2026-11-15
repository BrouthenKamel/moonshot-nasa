import { turnConstants } from '../../data/brief'
import type { Budgets } from '../../sim/types'
import type { RoomId } from '../rooms/ids'

/**
 * The six mission resources the hackathon brief asks the game to show
 * (mass, power, budget, data, comms, time), as one compact craft-status strip.
 *
 * Pure and deterministic: numbers come only from `computeBudgets`. A resource stays
 * locked ("?") until the room that measures it is done ("earn the number").
 * Budget and time are known from day one: the agency hands you both with the brief.
 */

export type ResourceId = 'mass' | 'power' | 'budget' | 'data' | 'comms' | 'time'
export type ResourceTone = 'go' | 'caution' | 'nogo'

export const RESOURCE_ORDER: ResourceId[] = ['mass', 'power', 'budget', 'data', 'comms', 'time']

export interface ResourceSpec {
  label: string
  /** Rooms of which ANY one being done reveals this number; [] = known from the start */
  unlockedBy: RoomId[]
  /** What the locked pip says when asked */
  lockedHint: string
}

export const RESOURCES: Record<ResourceId, ResourceSpec> = {
  mass: { label: 'Mass', unlockedBy: ['clean-room'], lockedHint: 'Weigh the craft in the Clean Room to learn its mass.' },
  power: {
    label: 'Power',
    unlockedBy: ['clean-room', 'thermal-vac'],
    lockedHint: 'Wire the bus in the Clean Room to learn your power margin.',
  },
  budget: { label: 'Budget', unlockedBy: [], lockedHint: '' },
  data: { label: 'Data', unlockedBy: ['science-lab'], lockedHint: 'Scan the crater in the Science Lab to learn how much data you make.' },
  comms: {
    label: 'Comms',
    unlockedBy: ['ground-station'],
    lockedHint: 'Catch a pass at the Ground Station to learn how much data gets home.',
  },
  time: { label: 'Time', unlockedBy: [], lockedHint: '' },
}

export type ResourcePip =
  | { id: ResourceId; label: string; unlocked: false; detail: string }
  | {
      id: ResourceId
      label: string
      unlocked: true
      value: string
      tone: ResourceTone
      detail: string
      /** 0..1 for the cart's physical gauge: how full (mass, data), how much left (budget, time) */
      level: number
    }

export function isUnlocked(id: ResourceId, completed: readonly RoomId[]): boolean {
  const by = RESOURCES[id].unlockedBy
  return by.length === 0 || by.some((r) => completed.includes(r))
}

const money = (m: number) => `$${m.toFixed(1)}M`
const round = (x: number) => Math.round(x)

/** go above `share` of the limit left, caution between 0 and that, nogo below 0 */
function marginTone(margin: number, limit: number, share = 0.1): ResourceTone {
  if (margin < 0) return 'nogo'
  if (limit > 0 && margin < limit * share) return 'caution'
  return 'go'
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

/** 0..1 for each gauge, from the same budgets */
export function gaugeLevel(id: ResourceId, b: Budgets): number {
  switch (id) {
    case 'mass':
      return clamp01(b.totalMass / b.massLimit)
    case 'power':
      return clamp01(b.powerGenerated > 0 ? b.powerMargin / b.powerGenerated : 0)
    case 'budget':
      return clamp01(b.budgetMargin / b.budgetCap)
    case 'data':
      return clamp01(b.storageCapacity > 0 ? b.dataPerTurn / b.storageCapacity : 0)
    case 'comms':
      return clamp01(b.dataPerTurn > 0 ? b.downlinkPerTurn / b.dataPerTurn : b.downlinkPerTurn > 0 ? 1 : 0)
    case 'time':
      return clamp01(b.rideTurn > 0 ? b.timeMarginTurns / b.rideTurn : 0)
  }
}

function measured(id: ResourceId, b: Budgets): { value: string; tone: ResourceTone; detail: string } {
  const months = turnConstants.monthsPerTurn
  switch (id) {
    case 'mass':
      return {
        value: `${b.totalMass.toFixed(1)} kg`,
        tone: marginTone(b.massMargin, b.massLimit),
        detail:
          b.massMargin >= 0
            ? `The craft weighs ${b.totalMass.toFixed(1)} kg; the ride takes up to ${b.massLimit.toFixed(1)} kg.`
            : `The craft weighs ${b.totalMass.toFixed(1)} kg, ${(-b.massMargin).toFixed(1)} kg over the ride's ${b.massLimit.toFixed(1)} kg limit.`,
      }
    case 'power': {
      const tone: ResourceTone =
        b.powerMargin < 0 || !b.batteryOk ? 'nogo' : marginTone(b.powerMargin, b.powerGenerated)
      const sign = b.powerMargin >= 0 ? '+' : ''
      const eclipse = b.batteryOk
        ? `the battery lasts the ${round(b.eclipseDurationMinutes)} min eclipse.`
        : `the battery runs flat in the ${round(b.eclipseDurationMinutes)} min eclipse.`
      return {
        value: `${sign}${round(b.powerMargin)} W`,
        tone,
        detail: `Solar makes ${round(b.powerGenerated)} W and the craft uses ${round(b.powerConsumed)} W in sunlight; ${eclipse}`,
      }
    }
    case 'budget':
      return {
        value: `${money(b.budgetMargin)} of ${money(b.budgetCap)}`,
        tone: marginTone(b.budgetMargin, b.budgetCap),
        detail:
          b.budgetMargin >= 0
            ? `${money(b.budgetMargin)} of the ${money(b.budgetCap)} budget is left after ${money(b.totalCost)} of parts, ride and operations (${money(b.reserveAmount)} held in reserve).`
            : `Spent ${money(b.totalCost)}, ${money(-b.budgetMargin)} over the ${money(b.budgetCap)} budget.`,
      }
    case 'data':
      return {
        value: `${round(b.dataPerTurn / months)} MB/mo`,
        tone: b.dataPerTurn > 0 ? 'go' : 'nogo',
        detail:
          b.dataPerTurn > 0
            ? `Your instruments make ${round(b.dataPerTurn / months)} MB of science a month; the craft stores ${round(b.storageCapacity)} MB.`
            : 'No instrument is making data yet.',
      }
    case 'comms': {
      const tone: ResourceTone = b.downlinkPerTurn <= 0 ? 'nogo' : b.dataMarginPerTurn < 0 ? 'caution' : 'go'
      return {
        value: `${round(b.downlinkPerTurn / months)} MB/mo`,
        tone,
        detail:
          b.dataMarginPerTurn >= 0
            ? `The radio sends ${round(b.downlinkPerTurn / months)} MB home a month, more than the ${round(b.dataPerTurn / months)} MB you make.`
            : `The radio sends ${round(b.downlinkPerTurn / months)} MB a month but you make ${round(b.dataPerTurn / months)} MB: data piles up.`,
      }
    }
    case 'time': {
      const ride = b.rideTurn * months
      const ready = b.readyTurn * months
      const tone: ResourceTone = b.timeMarginTurns < 0 ? 'nogo' : b.timeMarginTurns === 0 ? 'caution' : 'go'
      return {
        value: `${ride} mo`,
        tone,
        detail:
          b.timeMarginTurns >= 0
            ? `The ride leaves in month ${ride}; the craft is ready in month ${ready}.`
            : `The ride leaves in month ${ride} but the craft is only ready in month ${ready}.`,
      }
    }
  }
}

/** The six pips, in strip order, for the current budgets and finished rooms */
export function resourcePips(b: Budgets, completed: readonly RoomId[]): ResourcePip[] {
  return RESOURCE_ORDER.map((id) => {
    const { label, lockedHint } = RESOURCES[id]
    if (!isUnlocked(id, completed)) return { id, label, unlocked: false, detail: lockedHint }
    return { id, label, unlocked: true, ...measured(id, b), level: gaugeLevel(id, b) }
  })
}
