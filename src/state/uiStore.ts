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
  /** performance.now() when the rocket's countdown started on the island; null when no launch is playing */
  launchAt: number | null
  startLaunch: () => void
  endLaunch: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  openingDone: false,
  finishOpening: () => set({ openingDone: true }),
  flightView: 'space',
  setFlightView: (flightView) => set({ flightView }),
  launchAt: null,
  startLaunch: () => set({ launchAt: performance.now(), flightView: 'island' }),
  endLaunch: () => set({ launchAt: null, flightView: 'space' }),
}))

/** The island launch: countdown, then the rocket climbs out of sight; then the view cuts to space */
export const LAUNCH = { ignitionS: 5.2, durationS: 11 }
