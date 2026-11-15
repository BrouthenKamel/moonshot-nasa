import { useMemo } from 'react'
import { useDesignPreview } from '../useDesignPreview'

/**
 * The permanent header readout: the Go / No-Go verdict (blockers, risks or all clear) and the
 * mission's resource strip (mass, power, delta-v, cost). Plain text, nothing to click: the numbers
 * are the budgets the checklist asks the player to keep in view. While a card is hovered the
 * strip shows the what-if values with their change.
 */
export function ResourceStrip() {
  const { budgets, checks, previewBudgets, isPreviewing } = useDesignPreview()

  const activeBudgets = previewBudgets ?? budgets
  const blockers = checks.blockers
  const warnings = checks.warnings

  const statusVerdict = useMemo(() => {
    if (blockers.length > 0) {
      return {
        label: `${blockers.length} BLOCKER${blockers.length > 1 ? 'S' : ''}`,
        tone: 'bg-nogo/20 text-nogo border-nogo/60',
        dot: 'bg-nogo animate-pulse',
      }
    }
    if (warnings.length > 0) {
      return {
        label: `${warnings.length} RISK${warnings.length > 1 ? 'S' : ''}`,
        tone: 'bg-caution/20 text-caution border-caution/60',
        dot: 'bg-caution',
      }
    }
    return {
      label: 'ALL SYSTEMS GO',
      tone: 'bg-go/20 text-go border-go/60',
      dot: 'bg-go',
    }
  }, [blockers, warnings])

  const massDelta = previewBudgets ? previewBudgets.totalMass - budgets.totalMass : 0
  const powerDelta = previewBudgets ? previewBudgets.powerConsumed - budgets.powerConsumed : 0

  return (
    <div className="flex items-center gap-2">
      {/* Go / No-Go verdict */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-bold tracking-wider shadow-sm ${statusVerdict.tone}`}
      >
        <span className={`h-2 w-2 rounded-full ${statusVerdict.dot}`} />
        <span>{statusVerdict.label}</span>
      </div>

      {/* Key numbers (desktop only) */}
      <div className="hidden lg:flex items-center gap-3 px-2 py-0.5 rounded-md bg-ink-2/60 border border-rule/50 text-[11px] font-mono text-paper-dim">
        <span className="flex items-center gap-1" title="Craft total mass / launch limit">
          <span className="text-paper-faint">M:</span>
          <span className={activeBudgets.massMargin < 0 ? 'text-nogo font-bold' : 'text-paper'}>
            {activeBudgets.totalMass.toFixed(1)}/{activeBudgets.massLimit.toFixed(0)}kg
          </span>
          {isPreviewing && massDelta !== 0 && (
            <span className={`text-[10px] ${massDelta > 0 ? 'text-nogo' : 'text-go'}`}>
              ({massDelta > 0 ? `+${massDelta.toFixed(1)}` : massDelta.toFixed(1)})
            </span>
          )}
        </span>

        <span className="flex items-center gap-1" title="Consumed power / generated solar">
          <span className="text-paper-faint">P:</span>
          <span className={activeBudgets.powerMargin < 0 ? 'text-nogo font-bold' : 'text-paper'}>
            {activeBudgets.powerConsumed.toFixed(0)}/{activeBudgets.powerGenerated.toFixed(0)}W
          </span>
          {isPreviewing && powerDelta !== 0 && (
            <span className={`text-[10px] ${powerDelta > 0 ? 'text-nogo' : 'text-go'}`}>
              ({powerDelta > 0 ? `+${powerDelta.toFixed(0)}` : powerDelta.toFixed(0)})
            </span>
          )}
        </span>

        <span className="flex items-center gap-1" title="Total delta-v for trajectory & capture">
          <span className="text-paper-faint">Δv:</span>
          <span className={activeBudgets.deltaVMargin < 0 ? 'text-nogo font-bold' : 'text-paper'}>
            {activeBudgets.deltaVTotal.toFixed(0)}m/s
          </span>
        </span>

        <span className="flex items-center gap-1" title="Remaining mission budget">
          <span className="text-paper-faint">$$:</span>
          <span className={activeBudgets.budgetMargin < 0 ? 'text-nogo font-bold' : 'text-paper'}>
            ${activeBudgets.totalCost.toFixed(1)}M
          </span>
        </span>
      </div>
    </div>
  )
}
