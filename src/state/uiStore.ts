import { create } from 'zustand'

/**
 * Session-only interface state (never saved): what is on screen around the game,
 * not the game itself.
 */
interface UiState {
  /** The opening curtain was lifted this session */
  openingDone: boolean
  finishOpening: () => void
  /** During the flight, which view fills the base's centre panel */
  flightView: 'space' | 'island'
  setFlightView: (v: 'space' | 'island') => void
}

export const useUiStore = create<UiState>()((set) => ({
  openingDone: false,
  finishOpening: () => set({ openingDone: true }),
  flightView: 'space',
  setFlightView: (flightView) => set({ flightView }),
}))
