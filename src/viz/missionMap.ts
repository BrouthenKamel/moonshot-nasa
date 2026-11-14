import { buildings, type BuildingId } from '../data/agency'
import { getPartById } from '../data/parts'
import type { BuildingLabel } from '../scene/BaseMap'
import type { Budgets, Design, DesignStep, GoNoGoResult, SimState, TurnLog } from '../sim/types'
import { buildReport } from '../sim/evaluate'

/**
 * What the agency map shows for the Lunar Ice Mapper: which building holds
 * which decision, and building labels read from the logic core. Pure view:
 * no mission maths here, only core output turned into words.
 */

/** Each building holds the decisions of its role on the board */
export const BUILDING_STEPS: Record<BuildingId, DesignStep[]> = {
  'comms-center': ['brief', 'planning', 'comms', 'go-nogo'],
  'research-lab': ['instruments'],
  factory: ['spacecraft'],
  'launch-site': ['rocket', 'orbit', 'ride'],
}

/** The order the steps are suggested in */
export const STEP_ORDER: DesignStep[] = ['brief', 'planning', 'instruments', 'rocket', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']

export const STEP_NAMES: Record<DesignStep, string> = {
  brief: 'Brief',
  planning: 'Planning',
  instruments: 'Instruments',
  rocket: 'Rocket',
  spacecraft: 'Spacecraft',
  orbit: 'Orbit',
  ride: 'Ride & transfer',
  comms: 'Comms',
  'go-nogo': 'Go / No-Go',
}

export function buildingForStep(step: DesignStep): BuildingId {
  const found = (Object.keys(BUILDING_STEPS) as BuildingId[]).find((id) => BUILDING_STEPS[id].includes(step))
  return found ?? 'comms-center'
}

export function buildingName(id: BuildingId): string {
  return buildings.find((b) => b.id === id)?.name ?? id
}

/** Where on the map a step is decided, e.g. "the Factory (Spacecraft)" */
export function fixLocation(step: DesignStep): string {
  return `the ${buildingName(buildingForStep(step))} (${STEP_NAMES[step]})`
}

/** The first step not yet visited; Go / No-Go once every step has been seen */
export function suggestedStep(visited: DesignStep[]): DesignStep {
  return STEP_ORDER.find((s) => !visited.includes(s)) ?? 'go-nogo'
}

function goWord(checks: GoNoGoResult): string {
  if (!checks.canGo) return 'No-Go'
  return checks.warnings.length ? `Go with ${checks.warnings.length} warning${checks.warnings.length === 1 ? '' : 's'}` : 'Go'
}

/** Labels while the flight runs */
function flightLabels(budgets: Budgets, sim: SimState): Record<BuildingId, BuildingLabel> {
  const f = sim.flight
  const launched = f.launchedTurn !== null
  const factory = !launched
    ? `${sim.phase === 'test' ? 'Testing' : sim.phase === 'wait' ? 'Ready, waiting for the ride' : 'Building'} · ride in month ${f.launchTurn}`
    : 'Craft delivered to the ride'
  const over = sim.phase === 'complete' || sim.phase === 'failed'
  const launch = over
    ? `${sim.phase === 'failed' ? 'Mission lost' : 'Mission over'}: ${f.end}`
    : !launched
      ? `Ride leaves in month ${f.launchTurn}`
      : f.captured
        ? `Launched in month ${f.launchedTurn} · in lunar orbit`
        : `Launched in month ${f.launchedTurn} · transfer, ${months(Math.max(0, f.transferLeft ?? 0))} left`
  return {
    'comms-center': { status: `${f.data.toFixed(0)} MB home · ${budgets.linkKbps} kbps` },
    'research-lab': { status: `Ice ${f.coverage.toFixed(0)}% mapped` },
    factory: { status: factory },
    'launch-site': { status: launch },
  }
}

/** Building labels for the mission being planned or flown */
export function missionLabels(input: {
  design: Design
  budgets: Budgets
  checks: GoNoGoResult
  visited: DesignStep[]
  sim: SimState | null
}): Record<BuildingId, BuildingLabel> {
  const { design, budgets: b, checks, visited, sim } = input
  if (sim) return flightLabels(b, sim)

  const next = buildingForStep(suggestedStep(visited))
  const redSteps = new Set(checks.blockers.map((c) => c.fixStep).filter((s): s is DesignStep => !!s))
  const flags = (id: BuildingId) => ({
    alert: BUILDING_STEPS[id].some((s) => redSteps.has(s)),
    highlight: id === next,
  })
  const instrumentNames = design.instruments
    .map((id) => getPartById(id)?.name.replace(/\s*\(.*\)/, ''))
    .filter(Boolean)
    .join(' + ')

  return {
    'comms-center': {
      status: `${b.downlinkPerTurn.toFixed(0)} MB/month home · ${goWord(checks)}`,
      ...flags('comms-center'),
    },
    'research-lab': {
      status: `${instrumentNames || 'No instruments'} · ice ${b.projectedCoverage.toFixed(0)}% projected`,
      ...flags('research-lab'),
      pulse: researchLabPulses(visited, sim),
    },
    factory: {
      status: `${b.totalMass.toFixed(1)} / ${b.massLimit} kg · ${b.totalVolume.toFixed(1)} / ${b.volumeLimit} U`,
      ...flags('factory'),
    },
    'launch-site': {
      status:
        b.captureDeltaV === null || b.arrivalTurn === null
          ? `Ride in month ${b.rideTurn} · no way into this orbit`
          : `Ride in month ${b.rideTurn} · arrive in month ${b.arrivalTurn}`,
      ...flags('launch-site'),
    },
  }
}

/**
 * The Research Lab pulses until the player has opened the instruments step for
 * this mission: the first lesson is there (the starting infrared spectrometer
 * cannot see into the shadowed craters). Only while planning; in flight the
 * buildings cannot be entered.
 */
export function researchLabPulses(visited: DesignStep[], sim: SimState | null): boolean {
  return !sim && !visited.includes('instruments')
}

/** Where the mission is, for the stage chip in the top bar */
export type MissionStage = 'planning' | 'building' | 'transfer' | 'in-orbit' | 'success' | 'partial' | 'failed'

export const STAGE_NAMES: Record<MissionStage, string> = {
  planning: 'Planning',
  building: 'Building',
  transfer: 'Flying to the Moon',
  'in-orbit': 'Mapping',
  success: 'Success',
  partial: 'Partial success',
  failed: 'Failed',
}

/** The mission's status in the top bar: stage, next step, progress and where a click leads */
export interface MissionStatusView {
  stage: MissionStage
  /** Plain words: what comes next, or how it ended */
  next: string
  /** 0-1 progress through the current stage */
  progress: number
  /** A click opens this building (planning), the report (over), or nothing (in flight) */
  opens: BuildingId | 'report' | null
}

const months = (n: number) => `${n} month${n === 1 ? '' : 's'}`

/** The Lunar Ice Mapper's status, from the design steps or the flight */
export function missionStatus(input: { budgets: Budgets; visited: DesignStep[]; sim: SimState | null }): MissionStatusView {
  const { budgets: b, visited, sim } = input
  const clamp = (x: number) => Math.max(0, Math.min(1, x))

  if (!sim) {
    const next = suggestedStep(visited)
    const seen = STEP_ORDER.filter((s) => visited.includes(s)).length
    const building = buildingForStep(next)
    return {
      stage: 'planning',
      progress: clamp(seen / STEP_ORDER.length),
      next: `Next: ${STEP_NAMES[next]} at the ${buildingName(building)}`,
      opens: building,
    }
  }

  const f = sim.flight
  if (sim.phase === 'complete' || sim.phase === 'failed') {
    // A failed mission reads as failed, never as a green success; its budget is used up
    const outcome = buildReport(sim).outcome
    if (outcome === 'failed') {
      const why = sim.phase === 'failed' ? `lost: ${f.end}` : 'the brief was not met'
      return { stage: 'failed', progress: 1, next: `Mission failed, ${why}. Its budget is used up. See the report.`, opens: 'report' }
    }
    return { stage: outcome, progress: 1, next: `Mission over: ${f.end}. See the report.`, opens: 'report' }
  }
  if (f.launchedTurn === null) {
    return {
      stage: 'building',
      progress: clamp(sim.currentTurn / Math.max(1, f.launchTurn)),
      next: `In the Factory · the ride leaves in month ${f.launchTurn}`,
      opens: null,
    }
  }
  if (!f.captured) {
    const total = Math.max(1, b.transferTurns ?? 1)
    return {
      stage: 'transfer',
      progress: clamp((sim.currentTurn - f.launchedTurn) / total),
      next: `On the way to the Moon · ${months(Math.max(0, f.transferLeft ?? 0))} to capture`,
      opens: null,
    }
  }
  return {
    stage: 'in-orbit',
    progress: clamp(f.scienceTurns / 12),
    next: `Lunar orbit · ice ${f.coverage.toFixed(0)}% mapped · ${f.data.toFixed(0)} MB home`,
    opens: null,
  }
}

/** The mission month: month 0 until "Launch Mission", then the flight's current month */
export function missionMonth(sim: SimState | null): number {
  return sim ? sim.currentTurn : 0
}

/** The mission clock in the one unit the player sees (one turn of the logic core = one month) */
export function missionClockLabel(turn: number): string {
  return `month ${turn}`
}

const MILESTONES = /^(Launched|Capture burn successful|All requirements met|Mission over|Missed the ride|Primary mission done)/

/** One line of the mission log */
export interface MissionLogEntry {
  id: string
  month: number
  title: string
  tone: 'info' | 'good' | 'warning' | 'bad'
}

/** The flight's own events for the mission log, newest first: milestones, events and the end */
export function flightFeed(logs: TurnLog[]): MissionLogEntry[] {
  const out: MissionLogEntry[] = []
  for (const log of logs) {
    log.notes.forEach((note, i) => {
      const isEvent = log.events.length > 0 && !MILESTONES.test(note) && /underperform|delay|No signal|reset|outage|eclipse|degraded|weak/i.test(note)
      const isMilestone = MILESTONES.test(note)
      const isEnd = log.phase === 'failed' || /lost|ran out|not enough/i.test(note)
      if (!isEvent && !isMilestone && !(isEnd && log === logs[logs.length - 1])) return
      out.push({
        id: `lim-${log.turn}-${i}`,
        month: log.turn,
        title: note.replace(/\.$/, ''),
        tone: isEnd && !isMilestone ? 'bad' : isEvent ? 'warning' : /Capture|All requirements/.test(note) ? 'good' : 'info',
      })
    })
  }
  return out.reverse()
}
