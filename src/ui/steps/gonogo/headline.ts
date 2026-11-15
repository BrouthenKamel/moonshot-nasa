import type { CheckResult, GoNoGoResult } from '../../../sim/types'

/**
 * Honest Go/No-Go wording, pure. Ported from the Launch Director's logic (PR 60) so main's
 * step screen can use it. It only WORDS a check; it never decides whether a check is GO,
 * CAUTION or NO-GO (that stays in src/sim/checks).
 */

function fmt(n: number): string {
  const a = Math.abs(n)
  return a >= 10 || Number.isInteger(a) ? a.toFixed(0) : a.toFixed(1)
}

function unitText(unit: string, n: number): string {
  if (unit === 'month') return Math.abs(n) === 1 ? 'month' : 'months'
  if (unit === '$M') return 'M'
  return unit
}

/** One line per check, in its real numbers: "Power: 20 W over the limit" */
export function headline(c: CheckResult): string {
  if (c.status === 'green') return `${c.resource}: OK`
  // Science counts up toward a target (its margin is coverage minus target)
  if (c.resource === 'Science') {
    return c.margin < 0 ? `Science: ${fmt(c.value)}% of the ${fmt(c.limit)}% ice target` : 'Science: short of the data target'
  }
  if (c.resource === 'Comms' && c.value === c.limit) {
    // The Comms check has no real limit number: the reason is what matters
    return c.status === 'red' ? 'Comms: no link home' : 'Comms: the radio cannot use the whole pass'
  }
  const over = c.value - c.limit
  if (over > 0) return `${c.resource}: ${fmt(over)} ${unitText(c.unit, over)} over the limit`
  // Budget's limit is the whole budget; red under it means the reserve leaves too little to spend
  if (c.status === 'red' && c.resource === 'Budget') return 'Budget: more than you can spend'
  if (c.status === 'red') return `${c.resource}: blocked`
  return `${c.resource}: only ${fmt(-over)} ${unitText(c.unit, -over)} to spare`
}

export interface GoCall {
  /** GO, GO, OVER A LIMIT, GO, BELOW TARGET, GO WITH CAUTION or NO-GO */
  label: string
  /** The caution check the label is about, worded with headline(); null when there is none */
  reason: string | null
}

/** The overall call for a set of checks. Over a limit is not "a little to spare": say so. */
export function goCall(result: Pick<GoNoGoResult, 'canGo' | 'checks'>): GoCall {
  if (!result.canGo) return { label: 'NO-GO', reason: null }
  const cautions = result.checks.filter((c) => c.status === 'yellow')
  if (cautions.length === 0) return { label: 'GO', reason: null }
  const over = cautions.find((c) => headline(c).includes('over the limit'))
  if (over) return { label: 'GO, OVER A LIMIT', reason: headline(over) }
  const science = cautions.find((c) => c.resource === 'Science')
  if (science) return { label: 'GO, BELOW TARGET', reason: headline(science) }
  return { label: 'GO WITH CAUTION', reason: headline(cautions[0]) }
}
