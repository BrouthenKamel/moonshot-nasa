/** Pure timing helpers for the 30 s CAPCOM decision clock in flight events. */

export const DECISION_CLOCK_MS = 30_000

export interface DecisionClockCondition {
  reducedMotion: boolean
  blurred: boolean
  hasDecision: boolean
  /**
   * The player has acted since the card appeared (a click, a key, or the pointer leaving the
   * card). Until then the clock does not start: someone reading the card and its real-mission
   * note never runs out of time and gets the standing order by default.
   */
  armed?: boolean
  /** The pointer is on the card, or the player moved keyboard focus inside it: reading */
  reading?: boolean
}

export function shouldPauseDecisionClock(cond: DecisionClockCondition): boolean {
  return !cond.hasDecision || cond.reducedMotion || cond.blurred || cond.armed === false || !!cond.reading
}

/** The words next to the seconds: why the clock is not counting, or nothing when it counts */
export function decisionClockNote(cond: DecisionClockCondition): string | null {
  if (!cond.hasDecision) return null
  if (cond.armed === false) return 'Starts when you act'
  if (cond.reducedMotion || cond.blurred || cond.reading) return 'Paused'
  return null
}

/** 1..0 remaining fraction for the ruled decision bar (clamped). */
export function decisionClockFraction(elapsedMs: number, totalMs = DECISION_CLOCK_MS): number {
  const denom = Math.max(1, totalMs)
  const used = Math.min(1, Math.max(0, elapsedMs / denom))
  return 1 - used
}

/** Standing order is always the first option on the flight note. */
export function standingOrderOptionId(decision: { options: ReadonlyArray<{ id: string }> } | null | undefined): string | null {
  return decision?.options[0]?.id ?? null
}
