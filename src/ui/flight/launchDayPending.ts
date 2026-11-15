/**
 * "Launch Day is still to be flown for this flight", kept across a reload (Integration review, 15 Nov:
 * a reload during Launch Day, from a Vite re-optimise or a visitor's refresh, skipped on into the flight
 * and lost the ride). The flight itself is saved with the game (gameStore persists simState); the launch
 * show is not, so this marks it: set at liftoff, cleared only when Launch Day's onDone fires.
 * Keyed by the flight's seed, so a marker left from an older flight never reopens the game on a new one.
 */

import type { SimState } from '../../sim/types'
import { liftoffReached } from './launchOrder'

const KEY = 'moonshot:launch-day-pending'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function markLaunchDayPending(seed: number) {
  try {
    storage()?.setItem(KEY, String(seed))
  } catch {
    // Blocked storage: the ride still plays now, it just cannot resume after a reload
  }
}

export function clearLaunchDayPending() {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // Nothing to clear
  }
}

/** Was Launch Day left unfinished for the flight with this seed? */
export function isLaunchDayPending(seed: number): boolean {
  try {
    return storage()?.getItem(KEY) === String(seed)
  } catch {
    return false
  }
}

/** On load: has this saved flight lifted off with Launch Day still unflown? Then the game resumes at its briefing. */
export function resumeLaunchDay(sim: Pick<SimState, 'seed' | 'flight' | 'pendingDecision'>): boolean {
  return liftoffReached(sim) && isLaunchDayPending(sim.seed)
}

/**
 * Is a campaign layer over the base (a mission's brief or flow, the ladder, a payoff show)? Launch Day
 * belongs to the main flight screen: while one is up it waits, still pending, instead of drawing on top
 * with no way to close it (Integration review, 16 Nov: it covered the Moon landing brief).
 */
export function campaignCoversFlight(c: { active: unknown; ladderOpen: boolean; pendingPayoff: unknown }): boolean {
  return c.active !== null || c.ladderOpen || c.pendingPayoff !== null
}
