import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { createSafeStorage, skipUnchangedWrites } from './safeStorage'
import type { Difficulty } from '../data/brief'
import type { Budgets } from '../sim/types'
import type {
  Design,
  DesignStep,
  SimState,
  TurnAction,
  Report,
  RunHistoryEntry,
  RunRecord,
  GameMode,
  Player,
  SignOff,
} from '../sim/types'
import { createDefaultDesign, computeBudgets } from '../sim/budgets'
import { goNoGo, type GoNoGoResult } from '../sim/checks'
import { initSim, stepTurn, flyUntilDecision, getDefaultAction, isSimComplete, isMilestone } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'
import { generateSeed } from '../sim/rng'
import type { BuildingId } from '../data/agency'
import { BUILDING_STEPS, suggestedStep } from '../viz/missionMap'
import { useAgencyStore } from './agencyStore'

/** Difficulty levels are off for now (Jakob, 14 Nov): the game plays on the Engineer values */
export const FIXED_DIFFICULTY: Difficulty = 'engineer'

/** Screen the player is on */
export type Screen =
  | 'title'
  | 'base'
  | 'setup'
  | 'design'
  | 'simulation'
  | 'report'
  | 'replay'

/** Game state */
export interface GameState {
  // Navigation
  screen: Screen
  designStep: DesignStep

  // Configuration
  mode: GameMode
  players: Player[]
  difficulty: Difficulty

  // Design
  design: Design

  // Simulation
  simState: SimState | null
  pendingAction: TurnAction

  // Results
  currentReport: Report | null
  runHistory: RunHistoryEntry[]

  // Team mode
  signOffs: SignOff[]

  // Visualiser
  previousBudgets: Budgets | null
  replayTurn: number
  replayEntryId: string | null

  // Actions
  setScreen: (screen: Screen) => void
  setDesignStep: (step: DesignStep) => void
  setDifficulty: (difficulty: Difficulty) => void
  setMode: (mode: GameMode) => void
  setPlayers: (players: Player[]) => void
  updateDesign: (updates: Partial<Design>) => void
  resetDesign: () => void

  // Visualiser actions
  setReplayTurn: (n: number) => void
  openReplay: (entryId?: string) => void
  showReport: () => void

  // Computed
  getBudgets: () => ReturnType<typeof computeBudgets>
  getGoNoGo: () => GoNoGoResult

  // Simulation actions
  startSimulation: () => void
  advanceTurn: (action?: TurnAction) => void
  flyOn: () => void // fly until the mission ends or an event card needs the player
  /** Turn-by-turn flight: while on, each tick flies one turn and it switches off at a milestone */
  autoFly: boolean
  startAutoFly: () => void
  stopAutoFly: () => void
  autoFlyTick: () => void
  answerEvent: (choiceId: string) => void // answer the waiting event card and finish that turn
  applyFlight: (newState: SimState) => void // store a new flight state; saves the run when it ends
  setAction: (action: Partial<TurnAction>) => void

  // Team mode actions
  toggleSignOff: (role: Player['role']) => void
  resetSignOffs: () => void

  // History
  saveToHistory: (report: Report, run?: RunRecord) => void
  clearHistory: () => void
  loadDesignFromHistory: (id: string) => void

  // Design sharing
  exportDesignCode: () => string
  importDesignCode: (code: string) => boolean

  // Full reset
  newGame: () => void

  /** Start planning a fresh Lunar Ice Mapper mission from the agency base */
  startNewMission: () => void

  /** Design steps the player has opened in this mission (drives the map's suggested building) */
  visitedSteps: DesignStep[]
  /** Walk into a building on the map: opens the step it holds that is due next */
  openBuilding: (id: BuildingId) => void
  /** "Reset demo": the base back to day 112 and the mission abandoned, in both stores */
  resetDemo: () => void
}

/** localStorage if present (browser), otherwise an in-memory fallback (Node/tests) */
function getBaseStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // access can throw when site data is blocked
  }
  const mem = new Map<string, string>()
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  }
}

function lastTurnIndex(logs: { length: number } | undefined): number {
  return Math.max(0, (logs?.length ?? 0) - 1)
}

/** Encode design to a short shareable string */
function encodeDesign(design: Design): string {
  const data = {
    p: design.planning,
    i: design.instruments,
    s: design.structure,
    so: design.solar,
    b: design.battery,
    r: design.radio,
    c: design.computer,
    a: design.attitude,
    pr: design.propulsion,
    o: design.orbit,
    ri: design.ride,
    t: design.transfer,
    g: design.groundStation,
    h: design.contactHours,
  }
  return btoa(JSON.stringify(data))
}

/** Decode design from a short string */
function decodeDesign(code: string): Design | null {
  try {
    const data = JSON.parse(atob(code))
    return {
      planning: data.p,
      instruments: data.i,
      structure: data.s,
      solar: data.so,
      battery: data.b,
      radio: data.r,
      computer: data.c,
      attitude: data.a,
      propulsion: data.pr,
      orbit: data.o,
      ride: data.ri,
      transfer: data.t,
      groundStation: data.g,
      contactHours: data.h,
    }
  } catch {
    return null
  }
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // Initial state: the game starts on the agency map
      screen: 'base',
      designStep: 'brief',
      mode: 'solo',
      players: [],
      difficulty: FIXED_DIFFICULTY,
      design: createDefaultDesign(),
      simState: null,
      pendingAction: getDefaultAction(),
      autoFly: false,
      currentReport: null,
      runHistory: [],
      signOffs: [],
      previousBudgets: null,
      replayTurn: 0,
      replayEntryId: null,
      visitedSteps: [],

      // Navigation
      setScreen: (screen) => set({ screen }),
      setDesignStep: (designStep) =>
        set((state) => ({
          designStep,
          previousBudgets: null,
          replayTurn: 0,
          visitedSteps: state.visitedSteps.includes(designStep) ? state.visitedSteps : [...state.visitedSteps, designStep],
        })),

      openBuilding: (id) => {
        const { visitedSteps } = get()
        const steps = BUILDING_STEPS[id]
        const next = suggestedStep(visitedSteps)
        const step = steps.includes(next) ? next : (steps.find((s) => !visitedSteps.includes(s)) ?? steps[0])
        get().setDesignStep(step)
        set({ screen: 'design' })
      },

      resetDemo: () => {
        useAgencyStore.getState().resetAgency()
        set({
          screen: 'base',
          designStep: 'brief',
          design: createDefaultDesign(),
          simState: null,
          currentReport: null,
          signOffs: [],
          pendingAction: getDefaultAction(),
          previousBudgets: null,
          replayTurn: 0,
          replayEntryId: null,
          visitedSteps: [],
        })
      },

      // Visualiser
      setReplayTurn: (n) =>
        set((state) => {
          const logs = state.replayEntryId
            ? state.runHistory.find((r) => r.id === state.replayEntryId)?.run?.turnLogs
            : state.simState?.turnLogs
          const max = lastTurnIndex(logs)
          const clamped = Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : 0
          return { replayTurn: clamped }
        }),

      openReplay: (entryId) => {
        const { runHistory, simState } = get()
        if (entryId) {
          const run = runHistory.find((r) => r.id === entryId)?.run
          if (!run) return
          set({
            replayEntryId: entryId,
            replayTurn: lastTurnIndex(run.turnLogs),
            screen: 'replay',
          })
          return
        }
        if (!simState) return
        set({
          replayEntryId: null,
          replayTurn: lastTurnIndex(simState.turnLogs),
          screen: 'replay',
        })
      },

      showReport: () => set({ screen: 'report' }),

      // Configuration
      // Difficulty levels are off for now: the setting stays on the Engineer values
      setDifficulty: () => set({ difficulty: FIXED_DIFFICULTY }),
      setMode: (mode) => set({ mode }),
      setPlayers: (players) => set({ players }),

      // Design
      updateDesign: (updates) =>
        set((state) => ({
          previousBudgets: computeBudgets(state.design, state.difficulty),
          design: { ...state.design, ...updates },
        })),

      resetDesign: () =>
        set({ design: createDefaultDesign(), previousBudgets: null, replayTurn: 0 }),

      // Computed values
      getBudgets: () => {
        const { design, difficulty } = get()
        return computeBudgets(design, difficulty)
      },

      getGoNoGo: () => {
        const { design, difficulty } = get()
        const budgets = computeBudgets(design, difficulty)
        return goNoGo(design, budgets)
      },

      // Simulation
      startSimulation: () => {
        const { design, difficulty } = get()
        const seed = generateSeed()
        const simState = initSim(design, difficulty, seed)
        // The flight plays on the agency base, whose clock now follows the turns
        useAgencyStore.getState().startMissionClock()
        set({
          simState,
          currentReport: null,
          replayEntryId: null,
          replayTurn: 0,
          screen: 'base',
          pendingAction: getDefaultAction(),
          autoFly: false,
        })
      },

      advanceTurn: (action) => {
        const { simState, pendingAction } = get()
        if (!simState || isSimComplete(simState)) return
        get().applyFlight(stepTurn(simState, action ?? pendingAction))
      },

      flyOn: () => {
        const { simState, pendingAction } = get()
        if (!simState || isSimComplete(simState) || simState.pendingDecision) return
        get().applyFlight(flyUntilDecision(simState, pendingAction))
      },

      startAutoFly: () => {
        const { simState } = get()
        if (!simState || isSimComplete(simState) || simState.pendingDecision) return
        set({ autoFly: true })
      },

      stopAutoFly: () => set({ autoFly: false }),

      autoFlyTick: () => {
        const { simState, pendingAction, autoFly } = get()
        if (!autoFly || !simState || isSimComplete(simState) || simState.pendingDecision) {
          if (autoFly) set({ autoFly: false })
          return
        }
        const next = stepTurn(simState, pendingAction)
        get().applyFlight(next)
        if (isMilestone(simState, next)) set({ autoFly: false })
      },

      answerEvent: (choiceId) => {
        const { simState, pendingAction } = get()
        const decision = simState?.pendingDecision
        if (!simState || !decision) return
        const action = { ...pendingAction, choices: { ...pendingAction.choices, [decision.key]: choiceId } }
        get().applyFlight(stepTurn(simState, action))
      },

      applyFlight: (newState) => {
        set({
          simState: newState,
          pendingAction: getDefaultAction(),
          replayTurn: lastTurnIndex(newState.turnLogs),
        })

        // Run ended: save it, but stay on screen so the player sees the last turn.
        // The base clock catches up to the last turn and then runs by itself again.
        if (isSimComplete(newState)) {
          const agency = useAgencyStore.getState()
          agency.syncToMissionTurn(newState.currentTurn)
          agency.endMissionClock()
          const report = buildReport(newState)
          get().saveToHistory(report, {
            seed: newState.seed,
            turnLogs: newState.turnLogs,
            allEvents: newState.allEvents,
          })
          set({ currentReport: report })
        }
      },

      setAction: (action) =>
        set((state) => ({
          pendingAction: { ...state.pendingAction, ...action },
        })),

      // Team mode
      toggleSignOff: (role) =>
        set((state) => {
          const existing = state.signOffs.find((s) => s.role === role)
          if (existing) {
            return {
              signOffs: state.signOffs.map((s) =>
                s.role === role ? { ...s, approved: !s.approved } : s
              ),
            }
          }
          const player = state.players.find((p) => p.role === role)
          return {
            signOffs: [
              ...state.signOffs,
              { role, playerName: player?.name ?? role, approved: true },
            ],
          }
        }),

      resetSignOffs: () => set({ signOffs: [] }),

      // History
      saveToHistory: (report, run) =>
        set((state) => ({
          runHistory: [
            { id: crypto.randomUUID(), report, ...(run ? { run } : {}) },
            ...state.runHistory.slice(0, 19), // Keep last 20
          ],
        })),

      clearHistory: () => set({ runHistory: [] }),

      loadDesignFromHistory: (id) => {
        const { runHistory } = get()
        const entry = runHistory.find((r) => r.id === id)
        if (entry) {
          set({
            design: entry.report.design,
            difficulty: entry.report.difficulty,
            screen: 'design',
            designStep: 'brief',
            previousBudgets: null,
            replayTurn: 0,
          })
        }
      },

      // Design sharing
      exportDesignCode: () => {
        const { design } = get()
        return encodeDesign(design)
      },

      importDesignCode: (code) => {
        const design = decodeDesign(code)
        if (design) {
          set({ design, previousBudgets: null, replayTurn: 0 })
          return true
        }
        return false
      },

      // Full reset
      newGame: () =>
        set({
          // No difficulty levels for now (Jakob, 14 Nov): always the Engineer values
          difficulty: FIXED_DIFFICULTY,
          screen: 'base',
          designStep: 'brief',
          design: createDefaultDesign(),
          simState: null,
          currentReport: null,
          signOffs: [],
          pendingAction: getDefaultAction(),
          previousBudgets: null,
          replayTurn: 0,
          replayEntryId: null,
          visitedSteps: [],
        }),

      startNewMission: () => {
        useAgencyStore.getState().resetMissionClock()
        set({
          screen: 'design',
          designStep: 'brief',
          design: createDefaultDesign(),
          simState: null,
          currentReport: null,
          signOffs: [],
          pendingAction: getDefaultAction(),
          visitedSteps: [],
        })
      },
    }),
    {
      name: 'moonshot-game-storage',
      storage: skipUnchangedWrites(createJSONStorage(() => createSafeStorage(getBaseStorage()) as StateStorage)!) as never,
      // Difficulty is not saved: a stored Cadet or Flight Director setting from before is ignored
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<GameState>), difficulty: FIXED_DIFFICULTY }),
      partialize: (state) => ({
        mode: state.mode,
        // Keep the mission being planned, so the base can show and resume it
        design: state.design,
        designStep: state.designStep,
        visitedSteps: state.visitedSteps,
        players: state.players,
        runHistory: state.runHistory,
      }),
    }
  )
)
