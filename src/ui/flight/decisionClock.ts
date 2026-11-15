/** Pure timing helpers for the 30 s CAPCOM decision clock in flight events. */

export const DECISION_CLOCK_MS = 30_000

export interface DecisionClockCondition {
  reducedMotion: boolean
  blurred: boolean
  hasDecision: boolean
}

export function shouldPauseDecisionClock(cond: DecisionClockCondition): boolean {
  return !cond.hasDecision || cond.reducedMotion || cond.blurred
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
