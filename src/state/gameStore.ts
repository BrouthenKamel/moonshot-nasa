import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Difficulty } from '../data/brief'
import type {
  Design,
  DesignStep,
  SimState,
  TurnAction,
  Report,
  RunHistoryEntry,
  GameMode,
  Player,
  SignOff,
} from '../sim/types'
import { createDefaultDesign, computeBudgets } from '../sim/budgets'
import { goNoGo, type GoNoGoResult } from '../sim/checks'
import { initSim, stepTurn, getDefaultAction, isSimComplete } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'
import { generateSeed } from '../sim/rng'

/** Screen the player is on */
export type Screen =
  | 'title'
  | 'setup'
  | 'design'
  | 'simulation'
  | 'report'

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

  // Actions
  setScreen: (screen: Screen) => void
  setDesignStep: (step: DesignStep) => void
  setDifficulty: (difficulty: Difficulty) => void
  setMode: (mode: GameMode) => void
  setPlayers: (players: Player[]) => void
  updateDesign: (updates: Partial<Design>) => void
  resetDesign: () => void

  // Computed
  getBudgets: () => ReturnType<typeof computeBudgets>
  getGoNoGo: () => GoNoGoResult

  // Simulation actions
  startSimulation: () => void
  advanceTurn: (action?: TurnAction) => void
  setAction: (action: Partial<TurnAction>) => void

  // Team mode actions
  toggleSignOff: (role: Player['role']) => void
  resetSignOffs: () => void

  // History
  saveToHistory: (report: Report) => void
  clearHistory: () => void
  loadDesignFromHistory: (id: string) => void

  // Design sharing
  exportDesignCode: () => string
  importDesignCode: (code: string) => boolean

  // Full reset
  newGame: () => void
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

      // Navigation
      setScreen: (screen) => set({ screen }),
      setDesignStep: (designStep) => set({ designStep }),

      // Configuration
      setDifficulty: (difficulty) => set({ difficulty }),
      setMode: (mode) => set({ mode }),
      setPlayers: (players) => set({ players }),

      // Design
      updateDesign: (updates) =>
        set((state) => ({
          design: { ...state.design, ...updates },
        })),

      resetDesign: () => set({ design: createDefaultDesign() }),

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
          screen: 'simulation',
          pendingAction: getDefaultAction(),
        })
      },

      advanceTurn: (action) => {
        const { simState, pendingAction } = get()
        if (!simState || isSimComplete(simState)) return

        const newState = stepTurn(simState, action ?? pendingAction)
        set({
          simState: newState,
          pendingAction: getDefaultAction(),
        })

        // Check if simulation complete
        if (isSimComplete(newState)) {
          const report = buildReport(newState)
          set({ currentReport: report, screen: 'report' })
          get().saveToHistory(report)
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
      saveToHistory: (report) =>
        set((state) => ({
          runHistory: [
            { id: crypto.randomUUID(), report },
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
          set({ design })
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
        }),
    }),
    {
      name: 'moonshot-game-storage',
      partialize: (state) => ({
        difficulty: state.difficulty,
        mode: state.mode,
        players: state.players,
        runHistory: state.runHistory,
      }),
    }
  )
)
