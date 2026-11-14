import type { BarStatus, Budgets, CheckResult } from '../sim/types'

/** The first sentence of a check's reason, without its full stop */
export const firstSentence = (reason: string) => reason.split('. ')[0].replace(/\.$/, '')

/**
 * The line under a resource's numbers: its margin, or, on a red row, why it blocks.
 * A red row never shows "+ margin" (QC #12): delta-v can be red for want of power,
 * and the data link for want of data, with room left on paper.
 */
export function marginLine(status: BarStatus, margin: number, unit: string, reason: string, limitName = 'the limit'): string {
  if (margin < 0) return `${margin.toFixed(1)} ${unit} over ${limitName}`
  if (status === 'red') return `Blocked: ${firstSentence(reason)}`
  return `+${margin.toFixed(1)} ${unit} margin`
}

export interface CheckFigures {
  value: number
  limit: number
  margin: string
  /** Extra context, e.g. the reserve held back */
  note?: string
}

/**
 * The numbers a Go/No-Go row or dashboard bar shows for a check. The budget counts
 * against what is spendable, as its check does: the reserve is locked for fixes in flight (QC #1).
 */
export function checkFigures(check: CheckResult, b: Budgets): CheckFigures {
  if (check.resource === 'Budget') {
    const left = b.spendable - b.totalCost
    return {
      value: b.totalCost,
      limit: b.spendable,
      margin: left >= 0 ? `+${left.toFixed(1)} $M spendable left` : marginLine(check.status, left, '$M', check.reason, 'what is spendable'),
      note: `reserve locked: ${b.reserveAmount.toFixed(1)} M`,
    }
  }
  return { value: check.value, limit: check.limit, margin: marginLine(check.status, check.margin, check.unit, check.reason) }
}
