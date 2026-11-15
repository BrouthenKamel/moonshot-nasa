import { useMemo } from 'react'
import { useGameStore } from '../state/gameStore'
import { computeDesignDelta, formatDelta, type DeltaLine } from './designDelta'
import { computeSynergies, type SynergyTone } from './synergies'
import { glossaryKeyForLabel } from '../data/glossary'
import { Tooltip } from '../ui/Tooltip'
import { useDesignPreview } from '../ui/useDesignPreview'
import { Eng, Story, Tag, type TagTone } from '../ui/kit'
import type { DesignStep } from '../sim/types'

const PANEL_STYLE = 'mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-rule pt-2 text-xs'

const isGood = (line: DeltaLine) => (line.betterWhenHigher ? line.diff > 0 : line.diff < 0)

/** The plain-words version: what got better and what it cost */
function storyPhrase(lines: DeltaLine[]): string {
  const name = (l: DeltaLine) => l.label.toLowerCase()
  const helps = lines.filter(isGood).map(name)
  const costs = lines.filter((l) => !isGood(l)).map(name)
  const parts: string[] = []
  if (helps.length) parts.push(`Helps ${helps.join(', ')}`)
  if (costs.length) parts.push(`costs ${costs.join(', ')}`)
  const s = parts.join('; ')
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}.` : ''
}

/** "What this choice changed": the live hover delta when previewing, else the before/after of the player's last edit. */
export function DesignDeltaLine({ className = PANEL_STYLE }: { className?: string }) {
  const previousBudgets = useGameStore((s) => s.previousBudgets)
  const { budgets, deltas: previewDeltas, isPreviewing } = useDesignPreview()

  const activeDeltas = isPreviewing ? previewDeltas : previousBudgets ? computeDesignDelta(previousBudgets, budgets) : []

  if (activeDeltas.length === 0) return null

  return (
    <div className={className} aria-live="polite">
      <span className="fp-label text-[0.65rem]">{isPreviewing ? 'Preview impact:' : 'What this choice changed:'}</span>
      <Story className="text-paper">{storyPhrase(activeDeltas)}</Story>
      {activeDeltas.map((line) => (
        <Eng key={line.key} className={`fp-data font-semibold ${isGood(line) ? 'text-go' : 'text-caution'}`}>
          <Tooltip term={glossaryKeyForLabel(line.label) ?? ''}>{formatDelta(line)}</Tooltip>
        </Eng>
      ))}
    </div>
  )
}

const SYNERGY_TONE: Record<SynergyTone, { rule: string; tag: TagTone; word: string }> = {
  synergy: { rule: 'border-l-go', tag: 'go', word: 'Works well' },
  warning: { rule: 'border-l-caution', tag: 'caution', word: 'Watch' },
  conflict: { rule: 'border-l-nogo', tag: 'nogo', word: 'Conflict' },
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

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {badges.map((b) => (
          <Tag key={b.id} tone={SYNERGY_TONE[b.tone].tag} title={b.detail}>
            {b.title}
          </Tag>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {badges.map((b) => {
        const s = SYNERGY_TONE[b.tone]
        return (
          <div key={b.id} className={`fp-sheet border-l-[3px] px-3 py-2 text-xs ${s.rule}`} data-tone="flat">
            <div className="flex items-baseline justify-between gap-2">
              <span className="fp-label text-paper">{b.title}</span>
              <Tag tone={s.tag}>{s.word}</Tag>
            </div>
            <div className="mt-1 leading-snug text-paper-dim">{b.detail}</div>
          </div>
        )
      })}
    </div>
  )
}
