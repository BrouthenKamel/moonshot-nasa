import { useEffect, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import type { BarStatus } from '../sim/types'
import { checkFigures, marginLine } from '../viz/checkMargin'
import { glossaryKeyForLabel } from '../data/glossary'
import { Tooltip } from './Tooltip'
import { fixLocation } from '../viz/missionMap'

interface ResourceBarProps {
  label: string
  value: number
  limit: number
  unit: string
  status: BarStatus
  showMargin?: boolean
  previous?: number
  /** The check's reason: a red bar shows it instead of a margin */
  reason?: string
  /** The margin line when it is not plain limit minus value (the budget) */
  marginText?: string
  note?: string
}

function ResourceBar({ label, value, limit, unit, status, showMargin = true, previous, reason = '', marginText, note }: ResourceBarProps) {
  const [settledValue, setSettledValue] = useState<number | null>(null)
  const changed = previous !== undefined && Math.abs(value - previous) > 1e-9
  const flash = changed && settledValue !== value
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setSettledValue(value), 800)
    return () => clearTimeout(t)
  }, [flash, value])

  const percent = limit > 0 ? Math.min(100, (value / limit) * 100) : 0
  const margin = limit - value

  const barColor = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }[status]

  const textColor = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  }[status]

  return (
    <div
      className={`space-y-1 rounded transition-shadow duration-500 ${
        flash ? 'ring-2 ring-blue-400/70' : 'ring-0 ring-transparent'
      }`}
    >
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">
          <Tooltip term={glossaryKeyForLabel(label) ?? ''}>{label}</Tooltip>
        </span>
        <span className={textColor}>
          {value.toFixed(1)} / {limit.toFixed(1)} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {showMargin && (
        <div className={`text-xs ${status !== 'red' ? 'text-slate-500' : 'text-red-400'}`}>
          {marginText ?? marginLine(status, margin, unit, reason)}
        </div>
      )}
      {note && <div className="text-xs text-slate-500">{note}</div>}
    </div>
  )
}

export function Dashboard() {
  const getBudgets = useGameStore((s) => s.getBudgets)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  const previous = useGameStore((s) => s.previousBudgets)

  const budgets = getBudgets()
  const goNoGo = getGoNoGo()

  // Get status for each resource
  const getStatus = (resource: string): BarStatus => {
    const check = goNoGo.checks.find((c: { resource: string }) => c.resource === resource)
    return check?.status ?? 'green'
  }
  const getReason = (resource: string) => goNoGo.checks.find((c) => c.resource === resource)?.reason ?? ''
  const budgetCheck = goNoGo.checks.find((c) => c.resource === 'Budget')
  const budgetFig = budgetCheck ? checkFigures(budgetCheck, budgets) : undefined

  return (
    <aside className="w-64 border-l border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-4 text-sm font-semibold text-slate-300">Resource Dashboard</h2>

      <div className="space-y-4">
        <ResourceBar
          label="Mass"
          value={budgets.totalMass}
          limit={budgets.massLimit}
          unit="kg"
          status={getStatus('Mass')}
          reason={getReason('Mass')}
          previous={previous?.totalMass}
        />

        <ResourceBar
          label="Volume"
          value={budgets.totalVolume}
          limit={budgets.volumeLimit}
          unit="U"
          status={getStatus('Volume')}
          reason={getReason('Volume')}
          previous={previous?.totalVolume}
        />

        <ResourceBar
          label="Power"
          value={budgets.powerConsumed}
          limit={budgets.powerGenerated}
          unit="W"
          status={getStatus('Power')}
          reason={getReason('Power')}
          previous={previous?.powerConsumed}
        />

        <ResourceBar
          label="Budget (spendable)"
          value={budgets.totalCost}
          limit={budgets.spendable}
          unit="$M"
          status={getStatus('Budget')}
          previous={previous?.totalCost}
          marginText={budgetFig?.margin}
          note={budgetFig?.note}
        />

        <ResourceBar
          label="Delta-v"
          value={budgets.deltaVTotal}
          limit={budgets.deltaVAvailable}
          unit="m/s"
          status={getStatus('Delta-v')}
          reason={getReason('Delta-v')}
          previous={previous?.deltaVTotal}
        />

        <ResourceBar
          label="Data Link"
          value={budgets.dataPerTurn}
          limit={budgets.downlinkPerTurn}
          unit="MB/turn"
          status={getStatus('Data Link')}
          reason={getReason('Data Link')}
          previous={previous?.dataPerTurn}
        />
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Go/No-Go Status</span>
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${
              goNoGo.canGo
                ? goNoGo.warnings.length > 0
                  ? 'bg-yellow-900 text-yellow-300'
                  : 'bg-green-900 text-green-300'
                : 'bg-red-900 text-red-300'
            }`}
          >
            {goNoGo.canGo
              ? goNoGo.warnings.length > 0
                ? 'Go (with warnings)'
                : 'Go'
              : 'No-Go'}
          </span>
        </div>

        {goNoGo.blockers.length > 0 && (
          <div className="mt-2 space-y-1">
            {goNoGo.blockers.map((b, i) => (
              <div key={i} className="text-xs text-red-400">
                {b.resource}: {b.reason.split('. ')[0].replace(/\.$/, '')}
                {b.fixStep ? ` (fix at ${fixLocation(b.fixStep)})` : ''}.
              </div>
            ))}
          </div>
        )}

        {goNoGo.warnings.length > 0 && goNoGo.blockers.length === 0 && (
          <div className="mt-2 space-y-1">
            {goNoGo.warnings.map((w: { resource: string; reason: string }, i: number) => (
              <div key={i} className="text-xs text-yellow-400">
                {w.resource}: {w.reason.split('. ')[0].replace(/\.$/, '')}.
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-800 pt-4 text-xs text-slate-500">
        <div className="flex justify-between">
          <span>Ready turn:</span>
          <span>{budgets.readyTurn}</span>
        </div>
        <div className="flex justify-between">
          <span>Ride turn:</span>
          <span>{budgets.rideTurn}</span>
        </div>
        <div className="flex justify-between">
          <span>Arrival turn:</span>
          <span>{budgets.arrivalTurn ?? '-'}</span>
        </div>
        <div className="flex justify-between">
          <span>Reserve:</span>
          <span>${budgets.reserveAmount.toFixed(1)}M</span>
        </div>
        <div className="flex justify-between">
          <span>Projected ice coverage:</span>
          <span className={budgets.projectedCoverage >= 70 ? 'text-green-400' : 'text-orange-400'}>
            {budgets.projectedCoverage.toFixed(0)}%
          </span>
        </div>
      </div>
    </aside>
  )
}
