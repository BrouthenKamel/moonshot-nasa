import { useMemo } from 'react'
import { useGameStore } from '../state/gameStore'
import { computeDesignDelta, formatDelta } from './designDelta'
import { computeSynergies, type SynergyTone } from './synergies'
import { glossaryKeyForLabel } from '../data/glossary'
import { Tooltip } from '../ui/Tooltip'
import { useDesignPreview } from '../ui/useDesignPreview'
import type { DesignStep } from '../sim/types'

const PANEL_STYLE = 'mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-2 font-mono text-xs tabular-nums'

/** "What this choice changed": the live hover delta when previewing, else the before/after of the player's last edit. */
export function DesignDeltaLine({ className = PANEL_STYLE }: { className?: string }) {
  const previousBudgets = useGameStore((s) => s.previousBudgets)
  const { budgets, deltas: previewDeltas, isPreviewing } = useDesignPreview()

  const activeDeltas = isPreviewing
    ? previewDeltas
    : previousBudgets
      ? computeDesignDelta(previousBudgets, budgets)
      : []

  if (activeDeltas.length === 0) return null

  return (
    <div className={className} aria-live="polite">
      <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
        {isPreviewing ? 'Preview impact:' : 'What this choice changed:'}
      </span>
      {activeDeltas.map((line) => {
        const good = line.betterWhenHigher ? line.diff > 0 : line.diff < 0
        return (
          <span
            key={line.key}
            className={`font-mono font-semibold tabular-nums ${good ? 'text-emerald-300' : 'text-orange-300'}`}
          >
            <Tooltip term={glossaryKeyForLabel(line.label) ?? ''}>{formatDelta(line)}</Tooltip>
          </span>
        )
      })}
    </div>
  )
}

const SYNERGY_STYLE: Record<SynergyTone, { box: string; dot: string; tag: string }> = {
  synergy: {
    box: 'border-emerald-400/35 bg-emerald-950/35 text-emerald-200',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]',
    tag: 'text-emerald-300',
  },
  warning: {
    box: 'border-amber-400/35 bg-amber-950/35 text-amber-200',
    dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]',
    tag: 'text-amber-300',
  },
  conflict: {
    box: 'border-rose-400/40 bg-rose-950/40 text-rose-200',
    dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.85)]',
    tag: 'text-rose-300',
  },
}

/** Active cross-subsystem synergy / warning / conflict callouts for a step (reacts to hover preview). */
export function SynergyStrip({ step, compact = false }: { step: DesignStep; compact?: boolean }) {
  const design = useGameStore((s) => s.design)
  const { budgets, previewBudgets, previewPatch, isPreviewing } = useDesignPreview()

  const badges = useMemo(() => {
    const activeDesign = isPreviewing && previewPatch ? { ...design, ...previewPatch } : design
    const activeBudgets = isPreviewing && previewBudgets ? previewBudgets : budgets
    return computeSynergies(activeDesign, activeBudgets).filter((b) => b.steps.includes(step))
  }, [design, budgets, previewBudgets, previewPatch, isPreviewing, step])

  if (badges.length === 0) return null

  return (
    <div className={compact ? 'flex flex-wrap gap-1.5' : 'grid gap-2 sm:grid-cols-2'}>
      {badges.map((b) => {
        const s = SYNERGY_STYLE[b.tone]
        return (
          <div
            key={b.id}
            className={`hud-panel flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${s.box} ${
              compact ? 'py-1 px-2.5' : ''
            }`}
          >
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden="true" />
            <div className="min-w-0">
              <div className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${s.tag}`}>{b.title}</div>
              {!compact && <div className="mt-0.5 leading-snug text-slate-200/90">{b.detail}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
