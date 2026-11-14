import { useGameStore } from '../state/gameStore'
import { computeDesignDelta, formatDelta } from './designDelta'
import { glossaryKeyForLabel } from '../data/glossary'
import { Tooltip } from '../ui/Tooltip'

const PANEL_STYLE = 'mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-xs'

/** "What this choice changed": the before/after of the player's last edit. Nothing when there is none. */
export function DesignDeltaLine({ className = PANEL_STYLE }: { className?: string }) {
  const previousBudgets = useGameStore((s) => s.previousBudgets)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const deltas = previousBudgets ? computeDesignDelta(previousBudgets, getBudgets()) : []
  if (deltas.length === 0) return null
  return (
    <div className={className}>
      <span className="text-slate-500">What this choice changed:</span>
      {deltas.map((line) => {
        const good = line.betterWhenHigher ? line.diff > 0 : line.diff < 0
        return (
          <span key={line.key} className={good ? 'text-green-400' : 'text-orange-400'}>
            <Tooltip term={glossaryKeyForLabel(line.label) ?? ''}>{formatDelta(line)}</Tooltip>
          </span>
        )
      })}
    </div>
  )
}
