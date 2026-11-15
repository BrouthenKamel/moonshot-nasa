import { create } from 'zustand'

/** Player-facing onboarding state, kept apart from campusStore. Session-only. */
interface PlayerState {
  /** True once the name / suit picker has been confirmed */
  setupDone: boolean
  completeSetup: () => void
  resetPlayer: () => void
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  setupDone: false,
  completeSetup: () => set({ setupDone: true }),
  resetPlayer: () => set({ setupDone: false }),
}))
