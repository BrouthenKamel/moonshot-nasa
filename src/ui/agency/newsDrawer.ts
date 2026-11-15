/**
 * The notifications drawer stays folded until the player opens it. The one automatic opening is
 * an event card that needs an answer: the news tells what happened and where to answer.
 * (Choosing a mission or starting to plan must not open it: it covers the Communications Center,
 * the building the "Next" cue points at.)
 */
export function newsDrawerOpen({ openedByPlayer, decisionWaiting }: { openedByPlayer: boolean; decisionWaiting: boolean }): boolean {
  return openedByPlayer || decisionWaiting
}
