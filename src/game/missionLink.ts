/**
 * The one place where the agency meets the mission model.
 *
 * Everything the agency knows about the Lunar Ice Mapper goes through here:
 * it reads the mission from the game store, turns it into a MissionSnapshot
 * for the agency rules (src/game/world.ts), and drives it only through the
 * game store's public actions (advanceTurn, answerEvent). When the mission
 * model changes, this is the file to adjust.
 *
 * Agency extension, not used by any screen in the MVP (docs/DESIGN-DIRECTION.md, 1a).
 */
import { useGameStore } from '../state/gameStore'
import { isSimComplete } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'
import { difficultyPresets, lunarIceMapperBrief } from '../data/brief'
import type { SimState } from '../sim/types'
import type { MissionSnapshot } from './world'

export const MISSION_NAME = lunarIceMapperBrief.name

/** The mission budget the agency and the government split ($M) */
export function missionBudget(): number {
  return difficultyPresets[useGameStore.getState().difficulty].budgetCap
}

export function currentSim(): SimState | null {
  return useGameStore.getState().simState
}

const outcomeCache = new Map<string, MissionSnapshot['outcome']>()

function outcomeOf(sim: SimState): MissionSnapshot['outcome'] {
  if (!isSimComplete(sim)) return null
  const key = `${sim.seed}-${sim.currentTurn}`
  if (!outcomeCache.has(key)) outcomeCache.set(key, buildReport(sim).outcome)
  return outcomeCache.get(key)!
}

/** What the agency rules need to know about the flight after a turn */
export function snapshotOf(sim: SimState): MissionSnapshot {
  const f = sim.flight
  return {
    seed: sim.seed,
    turn: sim.currentTurn,
    phase: sim.phase,
    launched: f.launchedTurn !== null,
    launchTurn: f.launchTurn,
    captured: f.captured,
    coverage: sim.coveragePercent,
    dataMb: sim.totalDataReturned,
    ended: isSimComplete(sim),
    outcome: outcomeOf(sim),
    leftover: Math.max(0, f.main) + Math.max(0, f.reserve),
    decisionTitle: sim.pendingDecision?.title ?? null,
  }
}

/** Fly one mission turn (one agency month) */
export function stepMission() {
  useGameStore.getState().advanceTurn()
}

export function answerDecision(optionId: string) {
  useGameStore.getState().answerEvent(optionId)
}

/** Calls back whenever the mission model changes */
export function onMissionChange(cb: (sim: SimState | null) => void): () => void {
  return useGameStore.subscribe((s, prev) => {
    if (s.simState !== prev.simState) cb(s.simState)
  })
}
