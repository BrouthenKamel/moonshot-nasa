import { z } from 'zod'
import { getPartById, type PartCategory } from '../data/parts'
import { getOrbitById } from '../data/orbits'
import { getRideById } from '../data/rides'
import { getTransferById } from '../data/transfers'
import { getGroundStationById } from '../data/ground'
import { computeBudgets, createDefaultDesign } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import { normalizeRocket } from '../viz/rocket/rocketView'
import { buildReport } from '../sim/evaluate'
import type { Design, DesignStep, Report, RunHistoryEntry, SimState, TurnAction } from '../sim/types'

/**
 * The guard between a saved game and the store (QC #70). A save from an older
 * build can miss fields the game now reads (e.g. a design without `planning`),
 * which white-screened the app on every reload. Every saved field is checked
 * here; anything that does not fit falls back to a fresh value, never a crash.
 */

const STEPS: DesignStep[] = ['brief', 'planning', 'instruments', 'rocket', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']

const num = z.number().finite()

const DesignSchema = z.object({
  planning: z.object({ buildTurns: num, testTurns: num, reservePercent: num }),
  instruments: z.array(z.string()),
  structure: z.string(),
  solar: z.string(),
  battery: z.string(),
  radio: z.string(),
  computer: z.string(),
  attitude: z.string(),
  propulsion: z.string(),
  orbit: z.string(),
  ride: z.string(),
  transfer: z.string(),
  groundStation: z.string(),
  contactHours: num.optional(),
  rocket: z.record(z.string(), z.string()).optional(),
})

const PART_FIELDS: [keyof Design, PartCategory][] = [
  ['structure', 'structure'],
  ['solar', 'solar'],
  ['battery', 'battery'],
  ['radio', 'radio'],
  ['computer', 'computer'],
  ['attitude', 'attitude'],
  ['propulsion', 'propulsion'],
]

/** A saved design, if every part it names still exists and the logic core can read it */
export function validDesign(raw: unknown): Design | null {
  const parsed = DesignSchema.safeParse(raw)
  if (!parsed.success) return null
  const d = parsed.data as Design
  const partsExist =
    PART_FIELDS.every(([field, cat]) => getPartById(d[field] as string)?.category === cat) &&
    d.instruments.every((id) => getPartById(id)?.category === 'instrument') &&
    !!getOrbitById(d.orbit) &&
    !!getRideById(d.ride) &&
    !!getTransferById(d.transfer) &&
    !!getGroundStationById(d.groundStation)
  if (!partsExist) return null
  try {
    goNoGo(d, computeBudgets(d, 'engineer'))
  } catch {
    return null
  }
  // The rocket only changes how the game looks: a save with an unknown part gets the default instead of being dropped
  return d.rocket ? { ...d, rocket: normalizeRocket(d.rocket).config } : d
}

const LogSchema = z.object({ turn: num, phase: z.string(), notes: z.array(z.string()), events: z.array(z.unknown()) }).loose()

const SimSchema = z
  .object({
    design: z.unknown(),
    difficulty: z.string(),
    seed: num,
    currentTurn: num,
    phase: z.enum(['build', 'test', 'wait', 'transfer', 'capture', 'orbit', 'complete', 'failed']),
    coveragePercent: num,
    totalDataReturned: num,
    turnsInOrbit: num,
    turnLogs: z.array(LogSchema),
    allEvents: z.array(z.unknown()),
    flight: z
      .object({
        main: num,
        reserve: num,
        dvLeft: num,
        launchTurn: num,
        launchedTurn: num.nullable(),
        captured: z.boolean(),
        scienceTurns: num,
        coverage: num,
        data: num,
        end: z.string(),
        counts: z.record(z.string(), num),
        science: z.object({ stored: num }).loose(),
      })
      .loose(),
  })
  .loose()

/** A saved flight, if it has the shape the flight code reads */
export function validSim(raw: unknown): SimState | null {
  const parsed = SimSchema.safeParse(raw)
  if (!parsed.success || !validDesign(parsed.data.design)) return null
  return raw as SimState
}

const ReportSchema = z
  .object({
    outcome: z.enum(['success', 'partial', 'failed']),
    outcomeReason: z.string(),
    requirements: z.array(z.object({ id: z.string(), name: z.string(), met: z.boolean() }).loose()),
    score: z.object({ total: num }).loose(),
    design: z.unknown(),
  })
  .loose()

function validReport(raw: unknown): Report | null {
  const parsed = ReportSchema.safeParse(raw)
  return parsed.success && validDesign(parsed.data.design) ? (raw as Report) : null
}

const ActionSchema = z.object({ mode: z.string(), buyExtraPass: z.boolean(), useReserve: z.boolean() }).loose()

export interface SavedGame {
  design: Design
  designStep: DesignStep
  visitedSteps: DesignStep[]
  runHistory: RunHistoryEntry[]
  simState: SimState | null
  pendingAction?: TurnAction
  replayTurn: number
  currentReport: Report | null
}

function rebuildReport(sim: SimState): Report | null {
  try {
    return buildReport(sim)
  } catch {
    return null
  }
}

/** Turn whatever was in storage into a save the game can load */
export function sanitizeSavedGame(raw: unknown): SavedGame {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const isStep = (x: unknown): x is DesignStep => typeof x === 'string' && (STEPS as string[]).includes(x)

  const simState = validSim(s.simState)
  const complete = simState?.phase === 'complete' || simState?.phase === 'failed'
  const runHistory = Array.isArray(s.runHistory)
    ? (s.runHistory as unknown[]).filter(
        (e): e is RunHistoryEntry =>
          !!e && typeof e === 'object' && typeof (e as RunHistoryEntry).id === 'string' && !!validReport((e as RunHistoryEntry).report)
      )
    : []
  const out: SavedGame = {
    design: validDesign(s.design) ?? createDefaultDesign(),
    // The Rocket step was folded into the Craft step: a save made on it opens the craft
    designStep: s.designStep === 'rocket' ? 'spacecraft' : isStep(s.designStep) ? s.designStep : 'brief',
    visitedSteps: Array.isArray(s.visitedSteps) ? (s.visitedSteps as unknown[]).filter(isStep) : [],
    runHistory,
    simState,
    replayTurn: simState && typeof s.replayTurn === 'number' && Number.isFinite(s.replayTurn) ? s.replayTurn : 0,
    // A report belongs to the finished flight it came from; if it is missing or broken, rebuild it
    currentReport: simState && complete ? (validReport(s.currentReport) ?? rebuildReport(simState)) : null,
  }
  if (simState && ActionSchema.safeParse(s.pendingAction).success) out.pendingAction = s.pendingAction as TurnAction
  return out
}
