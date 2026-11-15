/**
 * Where the player stands on the campaign ladder. Pure: the store keeps the records,
 * this file reads them with the agency's funds and popularity.
 *
 * Rules
 * - A mission counts as flown once it ended in success or partial success.
 * - The next mission opens when the one before it was flown AND the agency reaches its gate
 *   (funds and popularity). Once opened, it stays open (`opened`), so a dip after starting it
 *   never locks the player out of a mission already chosen.
 * - Exactly one mission is "next": the first one not yet flown. It is the only highlighted rung.
 * - When the next gate is not met, the advice is to fly again: the cheapest flown mission
 *   (mission 1 at the start) brings money and popularity back.
 */
import { CAMPAIGN, planOf, type CampaignMission, type CampaignMissionId, type Gate, type Picks } from './missions'
import { missionFunding } from '../game/economy'
import { PARTIAL_SHARE } from './flight'
import type { Outcome } from './scenes/types'

export interface FlightRecord {
  missionId: CampaignMissionId
  outcome: Outcome
  science: number
  day: number
  seed: number
}

export interface CampaignProgress {
  flights: FlightRecord[]
  /** Missions the player has started at least once (their gate is behind them) */
  opened: CampaignMissionId[]
}

export const emptyProgress = (): CampaignProgress => ({ flights: [], opened: ['ice-mapper'] })

export type RungState = 'flown' | 'next' | 'locked'

export interface Rung {
  mission: CampaignMission
  state: RungState
  /** Can a mission be started from here right now (flown missions can be flown again) */
  open: boolean
  best: Outcome | null
  flights: number
}

export interface GateProgress {
  mission: CampaignMission
  gate: Gate
  funds: number
  popularity: number
  /** 0-1 per bar */
  fundsShare: number
  popularityShare: number
  met: boolean
  /** The mission before it is flown */
  previousFlown: boolean
}

const RANK: Record<Outcome, number> = { failed: 0, partial: 1, success: 2 }

export function bestOutcome(progress: CampaignProgress, id: CampaignMissionId): Outcome | null {
  let best: Outcome | null = null
  for (const f of progress.flights) if (f.missionId === id && (best === null || RANK[f.outcome] > RANK[best])) best = f.outcome
  return best
}

export function isFlown(progress: CampaignProgress, id: CampaignMissionId): boolean {
  const b = bestOutcome(progress, id)
  return b === 'success' || b === 'partial'
}

export function gateMet(gate: Gate | null, funds: number, popularity: number): boolean {
  return !gate || (funds >= gate.funds - 1e-9 && popularity >= gate.popularity - 1e-9)
}

/** Is this mission open to start now? */
export function isOpen(progress: CampaignProgress, mission: CampaignMission, funds: number, popularity: number): boolean {
  if (progress.opened.includes(mission.id)) return true
  const prev = CAMPAIGN[mission.n - 2]
  if (prev && !isFlown(progress, prev.id)) return false
  return gateMet(mission.gate, funds, popularity)
}

export function ladder(progress: CampaignProgress, funds: number, popularity: number): Rung[] {
  const nextIndex = CAMPAIGN.findIndex((m) => !isFlown(progress, m.id))
  return CAMPAIGN.map((mission, i) => ({
    mission,
    state: nextIndex === -1 || i < nextIndex ? 'flown' : i === nextIndex ? 'next' : 'locked',
    open: isOpen(progress, mission, funds, popularity),
    best: bestOutcome(progress, mission.id),
    flights: progress.flights.filter((f) => f.missionId === mission.id).length,
  }))
}

/** The highlighted rung, or null once the whole campaign is flown */
export function nextMission(progress: CampaignProgress): CampaignMission | null {
  return CAMPAIGN.find((m) => !isFlown(progress, m.id)) ?? null
}

/** Progress toward the next mission's gate (null when it has no gate or is already opened) */
export function gateProgress(progress: CampaignProgress, funds: number, popularity: number): GateProgress | null {
  const mission = nextMission(progress)
  if (!mission?.gate || progress.opened.includes(mission.id)) return null
  const prev = CAMPAIGN[mission.n - 2]
  const g = mission.gate
  return {
    mission,
    gate: g,
    funds,
    popularity,
    fundsShare: Math.min(1, Math.max(0, funds / g.funds)),
    popularityShare: Math.min(1, Math.max(0, popularity / g.popularity)),
    met: gateMet(g, funds, popularity),
    previousFlown: !prev || isFlown(progress, prev.id),
  }
}

/** The cheapest picks: the least the agency can pay to fly a mission */
export function cheapestPicks(m: CampaignMission): Picks {
  return Object.fromEntries(m.choices.map((c) => [c.id, [...c.options].sort((a, b) => a.cost - b.cost)[0].id]))
}

/** The smallest agency share at Go for a mission at this popularity, $M (0 for mission 1, paid through main) */
export function minimumShare(m: CampaignMission, popularity: number): number {
  if (m.choices.length === 0) return 0
  return missionFunding(planOf(m, cheapestPicks(m)).budget, popularity).agencyPays
}

/** The picks with the best landing chance: what the build-up advice assumes */
export function safestPicks(m: CampaignMission): Picks {
  return Object.fromEntries(m.choices.map((c) => [c.id, [...c.options].sort((a, b) => b.reliability - a.reliability)[0].id]))
}

/** Expected money from flying a mission again with the safest picks, $M (award odds minus the agency share) */
export function repeatValue(m: CampaignMission, popularity: number): number {
  const plan = planOf(m, safestPicks(m))
  const p = plan.success
  const partial = m.launchReliability * (1 - plan.landing) * PARTIAL_SHARE
  return p * m.award.repeat + (partial * m.award.repeat) / 2 - missionFunding(plan.budget, popularity).agencyPays
}

/**
 * What to fly to build up money and popularity: the flown campaign mission (2-4) worth most when
 * flown again, else the Lunar Ice Mapper.
 */
export function buildUpMission(progress: CampaignProgress, popularity = 70): CampaignMission {
  const flown = CAMPAIGN.slice(1).filter((m) => isFlown(progress, m.id))
  if (flown.length === 0) return CAMPAIGN[0]
  return flown.reduce((best, m) => (repeatValue(m, popularity) > repeatValue(best, popularity) ? m : best))
}

export function recordFlight(progress: CampaignProgress, record: FlightRecord): CampaignProgress {
  if (progress.flights.some((f) => f.seed === record.seed && f.missionId === record.missionId)) return progress
  return { ...progress, flights: [...progress.flights, record] }
}

export function markOpened(progress: CampaignProgress, id: CampaignMissionId): CampaignProgress {
  return progress.opened.includes(id) ? progress : { ...progress, opened: [...progress.opened, id] }
}

/** Is this the mission's first success (for the milestone award)? */
export function firstSuccess(progress: CampaignProgress, id: CampaignMissionId): boolean {
  return !progress.flights.some((f) => f.missionId === id && f.outcome === 'success')
}

/** Progress per phase for the Headquarters label: the ice map, the Moon (landing and base), Mars */
export function hqProgress(progress: CampaignProgress): { satellites: number; moon: number; mars: number } {
  const f = (id: CampaignMissionId) => (isFlown(progress, id) ? 1 : 0)
  return { satellites: f('ice-mapper'), moon: (f('moon-landing') + f('moon-base')) / 2, mars: f('mars-base') }
}
