import { buildings, type AgencyEvent, type BuildingId, type MissionView } from '../data/agency'
import { getPartById } from '../data/parts'
import type { BuildingLabel } from '../scene/BaseMap'
import { missionDay } from '../state/agencyStore'
import type { Budgets, Design, DesignStep, GoNoGoResult, SimState, TurnLog } from '../sim/types'

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
  'launch-site': ['orbit', 'ride'],
}

/** The order the steps are suggested in */
export const STEP_ORDER: DesignStep[] = ['brief', 'planning', 'instruments', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']

export const STEP_NAMES: Record<DesignStep, string> = {
  brief: 'Brief',
  planning: 'Planning',
  instruments: 'Instruments',
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

function levelOf(id: BuildingId): number {
  return buildings.find((b) => b.id === id)?.level ?? 1
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
    ? `${sim.phase === 'test' ? 'Testing' : sim.phase === 'wait' ? 'Ready, waiting for the ride' : 'Building'} · ride on turn ${f.launchTurn}`
    : 'Craft delivered to the ride'
  const launch = !launched
    ? `Ride leaves on turn ${f.launchTurn}`
    : f.captured
      ? `Launched turn ${f.launchedTurn} · in lunar orbit`
      : `Launched turn ${f.launchedTurn} · transfer, ${Math.max(0, f.transferLeft ?? 0)} turns left`
  return {
    'comms-center': { level: levelOf('comms-center'), status: `${f.data.toFixed(0)} MB home · ${budgets.linkKbps} kbps` },
    'research-lab': { level: levelOf('research-lab'), status: `Ice ${f.coverage.toFixed(0)}% mapped` },
    factory: { level: levelOf('factory'), status: factory },
    'launch-site': { level: levelOf('launch-site'), status: launch },
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
      level: levelOf('comms-center'),
      status: `${b.downlinkPerTurn.toFixed(0)} MB/turn home · ${goWord(checks)}`,
      ...flags('comms-center'),
    },
    'research-lab': {
      level: levelOf('research-lab'),
      status: `${instrumentNames || 'No instruments'} · ice ${b.projectedCoverage.toFixed(0)}% projected`,
      ...flags('research-lab'),
    },
    factory: {
      level: levelOf('factory'),
      status: `${b.totalMass.toFixed(1)} / ${b.massLimit} kg · ${b.totalVolume.toFixed(1)} / ${b.volumeLimit} U`,
      ...flags('factory'),
    },
    'launch-site': {
      level: levelOf('launch-site'),
      status:
        b.captureDeltaV === null || b.arrivalTurn === null
          ? `Ride on turn ${b.rideTurn} · no way into this orbit`
          : `Ride on turn ${b.rideTurn} · arrive turn ${b.arrivalTurn}`,
      ...flags('launch-site'),
    },
  }
}

/** The Lunar Ice Mapper's card in the missions list, from the design steps or the flight */
export function lunarMissionView(input: {
  design: Design
  budgets: Budgets
  visited: DesignStep[]
  sim: SimState | null
}): MissionView {
  const { budgets: b, visited, sim } = input
  const base = { id: 'lunar-ice-mapper', name: 'Lunar Ice Mapper', kind: 'cubesat' as const, isReal: true }
  const clamp = (x: number) => Math.max(0, Math.min(1, x))

  if (!sim) {
    const next = suggestedStep(visited)
    const seen = STEP_ORDER.filter((s) => visited.includes(s)).length
    return {
      ...base,
      status: 'planning',
      progress: clamp(seen / STEP_ORDER.length),
      detail: `Next: ${STEP_NAMES[next]} at the ${buildingName(buildingForStep(next))}`,
    }
  }

  const f = sim.flight
  if (sim.phase === 'complete' || sim.phase === 'failed') {
    return { ...base, status: 'complete', progress: 1, detail: sim.phase === 'failed' ? `Mission lost: ${f.end}` : `Mission over: ${f.end}` }
  }
  if (f.launchedTurn === null) {
    return {
      ...base,
      status: 'building',
      progress: clamp(sim.currentTurn / Math.max(1, f.launchTurn)),
      detail: `In the Factory · ride on turn ${f.launchTurn}`,
    }
  }
  if (!f.captured) {
    const total = Math.max(1, b.transferTurns ?? 1)
    return {
      ...base,
      status: 'transfer',
      progress: clamp((sim.currentTurn - f.launchedTurn) / total),
      detail: `On the way to the Moon · ${Math.max(0, f.transferLeft ?? 0)} turns to capture`,
    }
  }
  return {
    ...base,
    status: 'in-orbit',
    progress: clamp(f.scienceTurns / 12),
    detail: `Lunar orbit · ice ${f.coverage.toFixed(0)}% mapped · ${f.data.toFixed(0)} MB home`,
  }
}

const MILESTONES = /^(Launched|Capture burn successful|All requirements met|Mission over|Missed the ride|Primary mission done)/

/** The flight log as activity-feed entries on the base calendar, newest first */
export function flightFeed(logs: TurnLog[], startDay: number): AgencyEvent[] {
  const out: AgencyEvent[] = []
  for (const log of logs) {
    const day = missionDay(startDay, log.turn)
    log.notes.forEach((note, i) => {
      const isEvent = log.events.length > 0 && !MILESTONES.test(note) && /underperform|delay|No signal|reset|outage|eclipse|degraded|weak/i.test(note)
      const isMilestone = MILESTONES.test(note)
      const isEnd = log.phase === 'failed' || /lost|ran out|not enough/i.test(note)
      if (!isEvent && !isMilestone && !(isEnd && log === logs[logs.length - 1])) return
      out.push({
        id: `lim-${log.turn}-${i}`,
        day,
        title: note.replace(/\.$/, ''),
        detail: `Lunar Ice Mapper · turn ${log.turn}`,
        tone: isEnd && !isMilestone ? 'bad' : isEvent ? 'warning' : /Capture|All requirements/.test(note) ? 'good' : 'info',
      })
    })
  }
  return out.sort((a, b) => b.day - a.day)
}
