import { buildings, type BuildingId } from '../data/agency'
import { getPartById } from '../data/parts'
import type { BuildingLabel } from '../scene/BaseMap'
import type { Budgets, Design, DesignStep, GoNoGoResult, SimState } from '../sim/types'

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
