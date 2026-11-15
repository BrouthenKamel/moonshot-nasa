import type { SimState } from '../sim/types'

/**
 * When a waiting event card happens, in words for the top bar (QC, 15 Nov). A card raised in the launch
 * month comes from the state before that month ran: the craft has not counted as launched yet, so the
 * mission panel still says "Building" while the card says the craft is lost after deployment. The label
 * says which day it is. Null when the card needs no such note (a build delay during the build, a card
 * in transfer or in orbit, where the panel already reads right).
 */
export function decisionTiming(sim: SimState | null): string | null {
  const d = sim?.pendingDecision
  if (!sim || !d) return null
  if (sim.flight.launchedTurn === null && d.turn >= sim.flight.launchTurn) return 'Deployment day'
  return null
}
