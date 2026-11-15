import { create } from 'zustand'
import type { Design, DesignStep } from '../sim/types'

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
  /** Transient hovered "what-if" patch across design screens */
  previewPatch: Partial<Design> | null
  setPreviewPatch: (patch: Partial<Design> | null) => void
  /** The Ride step's two views, each a stage in the top bar: the launch (Ride) and the flight time (Transfer) */
  rideView: 'launch' | 'transfer'
  setRideView: (view: 'launch' | 'transfer') => void
  /** performance.now() when the rocket's countdown started on the island; null when no launch is playing */
  launchAt: number | null
  startLaunch: () => void
  endLaunch: () => void
  /** The hint ladder: after the same failure twice, the step the Fix button opens highlights its control */
  fixHint: { step: DesignStep; decision: string; why: string } | null
  setFixHint: (hint: { step: DesignStep; decision: string; why: string } | null) => void
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
  previewPatch: null,
  setPreviewPatch: (previewPatch) => set({ previewPatch }),
  rideView: 'launch',
  setRideView: (rideView) => set({ rideView }),
  launchAt: null,
  startLaunch: () => set({ launchAt: performance.now(), flightView: 'island' }),
  endLaunch: () => set({ launchAt: null, flightView: 'space' }),
  fixHint: null,
  setFixHint: (fixHint) => set({ fixHint }),
}))

/**
 * The launch, in two parts. On the island: the countdown, ignition at `ignitionS`, and the rocket
 * climbing out of sight by `islandS`. Then (with WebGL) the ride inside the fairing joins its own
 * sequence at `fairingFromS`, just before staging, so its countdown and ignition do not play twice,
 * and runs to its end at `fairingS`: staging, the fairing opening, the CubeSat leaving. Then space.
 */
const ISLAND_S = 10.5
const FAIRING_FROM_S = 5.6
const FAIRING_S = 11
export const LAUNCH = {
  ignitionS: 5.2,
  islandS: ISLAND_S,
  fairingFromS: FAIRING_FROM_S,
  fairingS: FAIRING_S,
  /** The whole launch, island and fairing */
  durationS: ISLAND_S + FAIRING_S - FAIRING_FROM_S,
}
