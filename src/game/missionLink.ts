/**
 * The one place where the agency meets the mission model.
 *
 * Everything the agency knows about the Lunar Ice Mapper goes through here:
 * it reads the mission from the game store, turns it into a MissionSnapshot
 * for the agency rules (src/game/world.ts), and drives it only through the
 * game store's public actions (advanceTurn, answerEvent, startNewMission,
 * setScreen). When the mission model changes, this is the file to adjust.
 */
import { useGameStore } from '../state/gameStore'
import { isSimComplete, buildStage } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'
import { difficultyPresets, lunarIceMapperBrief } from '../data/brief'
import { groundStations } from '../data/ground'
import type { DesignStep, SimState } from '../sim/types'
import type { MissionSnapshot } from './world'

export const MISSION_NAME = lunarIceMapperBrief.name

/** The mission budget the agency and the government split ($M) */
export function missionBudget(): number {
  return difficultyPresets[useGameStore.getState().difficulty].budgetCap
}

/** Science data target in MB */
export function dataTarget(): number {
  return difficultyPresets[useGameStore.getState().difficulty].dataTarget
}

/** Re-render a component whenever the mission or the planning step changes */
export function useMissionWatch(): void {
  useGameStore((s) => s.simState)
  useGameStore((s) => s.designStep)
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

/* ------------------------------------------------------------------ */
/* Driving the mission                                                 */
/* ------------------------------------------------------------------ */

/** Fly one mission turn (one agency month) */
export function stepMission() {
  useGameStore.getState().advanceTurn()
}

export function answerDecision(optionId: string) {
  useGameStore.getState().answerEvent(optionId)
}

/** Open the planning steps for a fresh Lunar Ice Mapper */
export function startPlanning() {
  useGameStore.getState().startNewMission()
}

/** Drop the flight from the game store too (demo reset) */
export function clearFlight() {
  useGameStore.setState({ simState: null, currentReport: null })
  saveFlightCopy(null)
}

/** Open the mission team's own screens for the current mission */
export function openMissionScreen() {
  const g = useGameStore.getState()
  if (g.simState) g.setScreen(isSimComplete(g.simState) && g.currentReport ? 'report' : 'simulation')
  else g.setScreen('design')
}

/** Calls back whenever the mission model changes */
export function onMissionChange(cb: (sim: SimState | null) => void): () => void {
  return useGameStore.subscribe((s, prev) => {
    if (s.simState !== prev.simState) cb(s.simState)
  })
}

/* ------------------------------------------------------------------ */
/* Keeping the flight across reloads                                   */
/* ------------------------------------------------------------------ */

const SIM_KEY = 'moonshot-agency-flight'

/** The game store does not save a flight in progress, so the agency keeps a copy */
export function saveFlightCopy(sim: SimState | null) {
  try {
    if (sim) localStorage.setItem(SIM_KEY, JSON.stringify(sim))
    else localStorage.removeItem(SIM_KEY)
  } catch {
    // storage blocked or full: the flight just won't survive a reload
  }
}

/** Put the saved flight back into the game store if it lost it */
export function restoreFlight(seed: number) {
  if (useGameStore.getState().simState) return
  try {
    const raw = localStorage.getItem(SIM_KEY)
    if (!raw) return
    const sim = JSON.parse(raw) as SimState
    if (sim.seed === seed) useGameStore.setState({ simState: sim })
  } catch {
    // ignore a broken copy
  }
}

/* ------------------------------------------------------------------ */
/* Read-only views for the base screen                                 */
/* ------------------------------------------------------------------ */

const designSteps: { id: DesignStep; name: string }[] = [
  { id: 'brief', name: 'Brief' },
  { id: 'planning', name: 'Planning' },
  { id: 'instruments', name: 'Instruments' },
  { id: 'spacecraft', name: 'Spacecraft' },
  { id: 'orbit', name: 'Orbit' },
  { id: 'ride', name: 'Ride & transfer' },
  { id: 'comms', name: 'Comms' },
  { id: 'go-nogo', name: 'Go / No-Go' },
]

/** Where the player is in the planning steps */
export function planningProgress(): { step: string; index: number; total: number } {
  const step = useGameStore.getState().designStep
  const index = Math.max(0, designSteps.findIndex((s) => s.id === step))
  return { step: designSteps[index].name, index, total: designSteps.length - 1 }
}

export interface MissionDetails {
  phase: SimState['phase']
  buildStage: string
  stagesLeft: { design: number; build: number; test: number; integration: number }
  testTurns: number
  testFactor: number
  missedRides: number
  fuelMs: number
  moneyLeft: number
  reserve: number
  coverage: number
  dataMb: number
  dataTarget: number
  turnsInOrbit: number
  station: string
  contactHours: number | null
  instruments: string[]
  decision: { title: string; text: string; realMission?: string; options: { id: string; label: string }[] } | null
  recentNotes: string[]
}

export function missionDetails(): MissionDetails | null {
  const sim = currentSim()
  if (!sim) return null
  const f = sim.flight
  const station = groundStations.find((g) => g.id === sim.design.groundStation)
  return {
    phase: sim.phase,
    buildStage: buildStage(f),
    stagesLeft: { ...f.stages },
    testTurns: f.testTurns,
    testFactor: f.testFactor,
    missedRides: f.missedRides,
    fuelMs: f.dvLeft,
    moneyLeft: f.main,
    reserve: f.reserve,
    coverage: sim.coveragePercent,
    dataMb: sim.totalDataReturned,
    dataTarget: dataTarget(),
    turnsInOrbit: sim.turnsInOrbit,
    station: station?.name ?? sim.design.groundStation,
    contactHours: sim.design.contactHours ?? null,
    instruments: sim.design.instruments,
    decision: sim.pendingDecision
      ? {
          title: sim.pendingDecision.title,
          text: sim.pendingDecision.text,
          realMission: sim.pendingDecision.realMission,
          options: sim.pendingDecision.options,
        }
      : null,
    recentNotes: sim.turnLogs.slice(-3).flatMap((l) => l.notes.slice(0, 2)).slice(-4),
  }
}
