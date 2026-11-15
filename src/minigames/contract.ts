import type { FC } from 'react'
import type { Difficulty } from '../data/brief'
import type { Design } from '../sim/types'
import type { RoomId } from '../world/rooms/ids'

/**
 * The shared contract for every Ice Hunters mini game (see docs/design/ICE-HUNTERS-VISION.md §4).
 *
 * A mini game reads numbers from src/sim and src/data, never invents physics, and
 * hands back only a design patch plus the Insights the debrief will quote.
 */

/** A measured fact the player discovered in an experiment, quoted back in flight and debrief */
export interface Insight {
  /** Stable id, e.g. 'eclipse-min-charge' (one per kind; a replay overwrites it) */
  id: string
  room: RoomId
  /** Plain English, one sentence: "The laser found ice in the dark at 2 W." */
  text: string
  metric: { label: string; value: number; unit: string }
}

export interface MinigameResult {
  patch: Partial<Design>
  insights: Insight[]
  /** Seconds the player spent (telemetry for the 90 s budget) */
  durationS: number
}

export interface MinigameProps {
  design: Design
  difficulty: Difficulty
  onComplete: (result: MinigameResult) => void
  /** Leave without changing anything */
  onExit: () => void
  /** True when this room was finished before: show the skip button */
  replay?: boolean
}

export interface MinigameDef {
  id: string
  room: RoomId
  title: string
  component: FC<MinigameProps>
}
