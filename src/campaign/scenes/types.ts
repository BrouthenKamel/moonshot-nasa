/**
 * The contract between the campaign screens and its cinematic shows.
 * Every show is a full-screen overlay that plays once and calls onDone at its end (or on Skip).
 */
export type RocketClass = 'small' | 'medium' | 'heavy' | 'super'
export type Outcome = 'success' | 'partial' | 'failed'
export type PayoffKind = 'ice-map' | 'moon-landing' | 'moon-base' | 'mars-base'

export interface LiftoffShowProps {
  rocket: RocketClass
  /** Shown in the caption bar, e.g. "Moon landing" */
  missionName: string
  /** The launch vehicle fails during ascent (outcome sim decided it): the show ends in an explosion */
  launchFails?: boolean
  onDone: () => void
}

export interface PayoffShowProps {
  kind: PayoffKind
  outcome: Outcome
  /** Why a failed flight ended (the flight's own ending); the ice map's last line names it */
  cause?: string
  onDone: () => void
}
