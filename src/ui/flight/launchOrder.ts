import type { SimState } from '../../sim/types'

/**
 * Events the launch month raises after the rocket has flown: the deployment itself (see `launch()` in
 * src/sim/simulate.ts). They come from the same step as liftoff, so the core hands them back with the
 * month unfinished and `launchedTurn` still unset.
 */
export const DEPLOYMENT_EVENTS: ReadonlySet<string> = new Set(['no-signal'])

/**
 * Has the rocket left? True once the core records liftoff, and also while the launch month waits on a
 * deployment event. Integration review, 15 Nov: "No signal after deployment" came up before the player
 * had flown the ride; with this, Launch Day plays first and the card waits until it is over.
 */
export function liftoffReached(sim: Pick<SimState, 'flight' | 'pendingDecision'>): boolean {
  if (sim.flight.launchedTurn !== null) return true
  const d = sim.pendingDecision
  return !!d && DEPLOYMENT_EVENTS.has(d.key) && d.turn === sim.flight.launchTurn
}
