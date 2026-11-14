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
import { initSim, stepTurn, flyUntilDecision, getDefaultAction, isSimComplete } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'
import { generateSeed } from '../sim/rng'

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
      // Initial state
      screen: 'title',
      designStep: 'brief',
      mode: 'solo',
      players: [],
      difficulty: 'engineer',
      design: createDefaultDesign(),
      simState: null,
      pendingAction: getDefaultAction(),
      currentReport: null,
      runHistory: [],
      signOffs: [],
      previousBudgets: null,
      replayTurn: 0,
      replayEntryId: null,

      // Navigation
      setScreen: (screen) => set({ screen }),
      setDesignStep: (designStep) =>
        set({ designStep, previousBudgets: null, replayTurn: 0 }),

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
      setDifficulty: (difficulty) => set({ difficulty }),
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
        set({
          simState,
          replayEntryId: null,
          replayTurn: 0,
          screen: 'simulation',
          pendingAction: getDefaultAction(),
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

        // Run ended: save it, but stay on the simulation screen so the player sees the last turn
        if (isSimComplete(newState)) {
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
          screen: 'title',
          designStep: 'brief',
          design: createDefaultDesign(),
          simState: null,
          currentReport: null,
          signOffs: [],
          pendingAction: getDefaultAction(),
          previousBudgets: null,
          replayTurn: 0,
          replayEntryId: null,
        }),

      startNewMission: () =>
        set({
          screen: 'design',
          designStep: 'brief',
          design: createDefaultDesign(),
          simState: null,
          currentReport: null,
          signOffs: [],
          pendingAction: getDefaultAction(),
        }),
    }),
    {
      name: 'moonshot-game-storage',
      storage: skipUnchangedWrites(createJSONStorage(() => createSafeStorage(getBaseStorage()) as StateStorage)!) as never,
      partialize: (state) => ({
        difficulty: state.difficulty,
        mode: state.mode,
        // Keep the mission being planned, so the base can show and resume it
        design: state.design,
        designStep: state.designStep,
        players: state.players,
        runHistory: state.runHistory,
      }),
    }
  )
)
