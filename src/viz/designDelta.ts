import type { Budgets } from '../sim/types'

/** Budget fields that are plain numbers */
export type NumericBudgetKey = { [K in keyof Budgets]: Budgets[K] extends number ? K : never }[keyof Budgets]

export interface DeltaLine {
  key: NumericBudgetKey
  label: string
  unit: string
  before: number
  after: number
  diff: number
  betterWhenHigher: boolean
}

const TRACKED: { key: NumericBudgetKey; label: string; unit: string; betterWhenHigher: boolean }[] = [
  { key: 'totalMass', label: 'Mass', unit: 'kg', betterWhenHigher: false },
  { key: 'totalVolume', label: 'Volume', unit: 'U', betterWhenHigher: false },
  { key: 'powerMargin', label: 'Power margin', unit: 'W', betterWhenHigher: true },
  { key: 'batteryMarginMinutes', label: 'Eclipse margin', unit: 'min', betterWhenHigher: true },
  // The whole plan's cost (parts, build time, transfer and operations), not just the part's price
  { key: 'totalCost', label: 'Mission cost', unit: '$M', betterWhenHigher: false },
  { key: 'deltaVMargin', label: 'Delta-v margin', unit: 'm/s', betterWhenHigher: true },
  { key: 'dataMarginPerTurn', label: 'Data margin', unit: 'MB/turn', betterWhenHigher: true },
  { key: 'projectedCoverage', label: 'Projected ice coverage', unit: '%', betterWhenHigher: true },
  { key: 'timeMarginTurns', label: 'Time margin', unit: 'turns', betterWhenHigher: true },
]

/** Budget numbers that differ between two designs, in a fixed order. */
export function computeDesignDelta(before: Budgets, after: Budgets): DeltaLine[] {
  const lines: DeltaLine[] = []
  for (const t of TRACKED) {
    const b = before[t.key]
    const a = after[t.key]
    if (typeof a !== 'number' || typeof b !== 'number') continue
    const diff = a - b
    if (!Number.isFinite(diff) || Math.abs(diff) <= 1e-9) continue
    lines.push({ ...t, before: b, after: a, diff })
  }
  return lines
}

/** e.g. "Mass +1.2 kg" */
export function formatDelta(line: DeltaLine): string {
  const sign = line.diff < 0 ? '-' : '+'
  return `${line.label} ${sign}${Math.abs(line.diff).toFixed(1)} ${line.unit}`
}
