import { deltaVNeed } from '../sim/checks'
import type { Budgets } from '../sim/types'

/**
 * The few numbers several screens show, formatted once so they always agree (QC batch 4, 16 Nov).
 */

/** Trip time from the sim (transferTurns / transferDays): days under 2 months, then months */
export function tripTime(b: Pick<Budgets, 'transferTurns' | 'transferDays'>): string {
  if (b.transferTurns === null || b.transferDays === null) return 'no way to the Moon'
  if (b.transferTurns < 2) return `${b.transferDays} day${b.transferDays === 1 ? '' : 's'}`
  return `${b.transferTurns} months`
}

/** The trip time split for a headline: value "5" and unit "days to the Moon" */
export function tripParts(b: Pick<Budgets, 'transferTurns' | 'transferDays'>): { value: string; unit: string } {
  const t = tripTime(b)
  if (b.transferTurns === null || b.transferDays === null) return { value: '—', unit: t }
  const [value, unit] = t.split(' ')
  return { value, unit: `${unit} to the Moon` }
}

/** "capture 476 + station-keeping 94 = 570 m/s": what the Delta-v check needs, in its parts */
export function deltaVNeedText(b: Budgets): string {
  const n = deltaVNeed(b)
  return `capture ${Math.round(n.capture)} + station-keeping ${Math.round(n.keeping)} = ${Math.round(n.total)} m/s`
}

/** The label for the capture burn, the same on the Trip and Go screens */
export const CAPTURE_LABEL = 'Capture burn'

/** Money left, signed with a true minus: "$2.0M", "−$1.5M" */
export function moneyLeft(m: number): string {
  const r = Math.round(m * 10) / 10
  return `${r < 0 ? '−' : ''}$${Math.abs(r).toFixed(1)}M`
}

/** Budget left on the same base as the Budget check: spendable (cap − reserve) − cost */
export function budgetLeft(b: Pick<Budgets, 'spendable' | 'totalCost'>): number {
  return b.spendable - b.totalCost
}
