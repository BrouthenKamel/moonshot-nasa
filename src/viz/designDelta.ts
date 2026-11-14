import type { Budgets } from '../sim/types'

export interface DeltaLine {
  key: keyof Budgets
  label: string
  unit: string
  before: number
  after: number
  diff: number
  betterWhenHigher: boolean
}

const TRACKED: { key: keyof Budgets; label: string; unit: string; betterWhenHigher: boolean }[] = [
  { key: 'totalMass', label: 'Mass', unit: 'kg', betterWhenHigher: false },
  { key: 'totalVolume', label: 'Volume', unit: 'U', betterWhenHigher: false },
  { key: 'powerMargin', label: 'Power margin', unit: 'W', betterWhenHigher: true },
  { key: 'batteryMarginMinutes', label: 'Eclipse margin', unit: 'min', betterWhenHigher: true },
  { key: 'totalCost', label: 'Cost', unit: '$M', betterWhenHigher: false },
  { key: 'deltaVMargin', label: 'Delta-v margin', unit: 'm/s', betterWhenHigher: true },
  { key: 'dataMarginPerTurn', label: 'Data margin', unit: 'GB/turn', betterWhenHigher: true },
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
