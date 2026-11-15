import { create } from 'zustand'
import type { Design } from '../sim/types'

/** Space-view cameras: the base shows overview, moon and earth; the others stay for other views */
export type FlightCamMode = 'director' | 'chase' | 'pole' | 'overview' | 'moon' | 'earth'
export type AgencyWalletFocus = 'funds' | 'popularity' | null

/**
 * Session-only interface state (never saved): what is on screen around the game,
 * not the game itself.
 */
interface UiState {
  /** The opening curtain was lifted this session */
  openingDone: boolean
  finishOpening: () => void
  /** Base screen overlay visibility & wallet focus */
  agencyDashboardOpen: boolean
  setAgencyDashboardOpen: (open: boolean) => void
  missionLogOpen: boolean
  setMissionLogOpen: (open: boolean) => void
  agencyWalletDetail: AgencyWalletFocus
  setAgencyWalletDetail: (detail: AgencyWalletFocus) => void
  /** During the flight, which view fills the base's centre panel */
  flightView: 'space' | 'island'
  setFlightView: (v: 'space' | 'island') => void
  /** Interactive camera preset when flightView === 'space' */
  flightCam: FlightCamMode
  setFlightCam: (cam: FlightCamMode) => void
  /** Auto-fly simulation speed multiplier (1x = 500ms/month, 2x = 250ms/month) */
  autoFlySpeed: 1 | 2
  setAutoFlySpeed: (speed: 1 | 2) => void
  /** Full-screen Mission Vitality HUD dial overlay */
  hudModalOpen: boolean
  setHudModalOpen: (open: boolean) => void
  toggleHudModal: () => void
  /** Transient hovered "what-if" patch across design screens */
  previewPatch: Partial<Design> | null
  setPreviewPatch: (patch: Partial<Design> | null) => void
  /** performance.now() when the rocket's countdown started on the island; null when no launch is playing */
  launchAt: number | null
  startLaunch: () => void
  endLaunch: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  openingDone: false,
  finishOpening: () => set({ openingDone: true }),
  agencyDashboardOpen: true,
  setAgencyDashboardOpen: (agencyDashboardOpen) => set({ agencyDashboardOpen }),
  missionLogOpen: true,
  setMissionLogOpen: (missionLogOpen) => set({ missionLogOpen }),
  agencyWalletDetail: null,
  setAgencyWalletDetail: (agencyWalletDetail) => set({ agencyWalletDetail }),
  flightView: 'space',
  setFlightView: (flightView) => set({ flightView }),
  flightCam: 'overview',
  setFlightCam: (flightCam) => set({ flightCam }),
  autoFlySpeed: 1,
  setAutoFlySpeed: (autoFlySpeed) => set({ autoFlySpeed }),
  hudModalOpen: false,
  setHudModalOpen: (hudModalOpen) => set({ hudModalOpen }),
  toggleHudModal: () => set((s) => ({ hudModalOpen: !s.hudModalOpen })),
  previewPatch: null,
  setPreviewPatch: (previewPatch) => set({ previewPatch }),
  launchAt: null,
  startLaunch: () => set({ launchAt: performance.now(), flightView: 'island' }),
  endLaunch: () => set({ launchAt: null, flightView: 'space' }),
}))

/** The island launch: countdown, then the rocket climbs out of sight; then the view cuts to space */
export const LAUNCH = { ignitionS: 5.2, durationS: 11 }
