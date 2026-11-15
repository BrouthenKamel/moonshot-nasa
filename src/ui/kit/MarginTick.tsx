import type { BarStatus } from '../../sim/types'

const TONE: Record<string, string> = {
  green: 'var(--color-go)',
  yellow: 'var(--color-caution)',
  red: 'var(--color-nogo)',
}

function pct(value: number, limit: number) {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 0
  return Math.max(0, Math.min(1, value / limit)) * 100
}

/**
 * One resource as a needle on a ruled scale: the limit is the end of the scale.
 * Story view shows the needle and a word; the numbers sit in the title and in Engineer view.
 * A what-if preview draws a ghost needle where the hovered choice would put it.
 */
export function MarginTick({
  label,
  value,
  limit,
  unit,
  status,
  preview,
  invert = false,
}: {
  label: string
  value: number
  limit: number
  unit: string
  status: BarStatus
  preview?: { value: number; status: BarStatus } | null
  /** true when more is better (e.g. Δv available vs needed is drawn as needed/available) */
  invert?: boolean
}) {
  const p = pct(value, limit)
  const g = preview ? pct(preview.value, limit) : null
  const color = TONE[status] ?? 'var(--color-paper-dim)'
  const word = status === 'red' ? 'over' : status === 'yellow' ? 'tight' : 'ok'
  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1))
  return (
    <div className="min-w-0" title={`${label}: ${fmt(value)} of ${fmt(limit)} ${unit}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="fp-label text-[0.68rem]">{label}</span>
        <span className="fp-data text-[11px]" style={{ color }}>
          <span className="story-only">{word}</span>
          <span className="eng-only">
            {fmt(value)}/{fmt(limit)} {unit}
          </span>
        </span>
      </div>
      <div className="relative mt-1 h-3" aria-hidden="true">
        {/* ruled scale */}
        <div className="absolute inset-x-0 top-1.5 h-px bg-rule-strong" />
        {[0, 25, 50, 75, 100].map((t) => (
          <div key={t} className="absolute top-0.5 h-2 w-px bg-rule-strong" style={{ left: `${t}%` }} />
        ))}
        <div className="absolute top-1 h-1 bg-current opacity-30" style={{ left: 0, width: `${p}%`, color }} />
        {g != null && Math.abs(g - p) > 0.5 && (
          <div className="fp-ghost absolute -top-0.5 h-4 w-0.5 bg-paper" style={{ left: `calc(${g}% - 1px)` }} />
        )}
        <div className="absolute -top-0.5 h-4 w-[3px]" style={{ left: `calc(${p}% - 1.5px)`, background: color }} />
      </div>
      {invert && <span className="sr-only">more margin is better</span>}
    </div>
  )
}
