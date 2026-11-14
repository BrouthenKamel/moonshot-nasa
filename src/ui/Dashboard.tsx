import { useEffect, useState } from 'react'
import { useGameStore } from '../state/gameStore'
import type { BarStatus } from '../sim/types'
import { checkFigures, marginLine } from '../viz/checkMargin'
import { glossaryKeyForLabel } from '../data/glossary'
import { Tooltip } from './Tooltip'
import { fixLocation } from '../viz/missionMap'
import { useDesignPreview } from './useDesignPreview'

interface ResourceBarProps {
  label: string
  value: number
  limit: number
  unit: string
  status: BarStatus
  previewValue?: number
  previewLimit?: number
  previewStatus?: BarStatus
  thresholdPct?: number
  showMargin?: boolean
  previous?: number
  /** The check's reason: a red bar shows it instead of a margin */
  reason?: string
  /** The margin line when it is not plain limit minus value (the budget) */
  marginText?: string
  note?: string
}

function formatDeltaBadge(diff: number, unit: string): string {
  const sign = diff > 0 ? '+' : '-'
  const abs = Math.abs(diff)
  const num = abs >= 100 ? Math.round(abs).toString() : abs.toFixed(1).replace(/\.0$/, '')
  return unit === '$M' ? `${sign}$${num}M` : `${sign}${num} ${unit}`
}

function ResourceBar({
  label,
  value,
  limit,
  unit,
  status,
  previewValue,
  previewLimit,
  previewStatus,
  thresholdPct,
  showMargin = true,
  previous,
  reason = '',
  marginText,
  note,
}: ResourceBarProps) {
  const [settledValue, setSettledValue] = useState<number | null>(null)
  const changed = previous !== undefined && Math.abs(value - previous) > 1e-9
  const flash = changed && settledValue !== value
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setSettledValue(value), 800)
    return () => clearTimeout(t)
  }, [flash, value])

  const percent = limit > 0 ? Math.min(100, Math.max(0, (value / limit) * 100)) : value > 0 ? 100 : 0
  const margin = limit - value

  const hasPreview = previewValue !== undefined && previewLimit !== undefined
  const nextPercent = hasPreview
    ? previewLimit > 0
      ? Math.min(100, Math.max(0, (previewValue / previewLimit) * 100))
      : previewValue > 0
        ? 100
        : 0
    : percent
  const valDiff = hasPreview ? previewValue - value : 0
  const limDiff = hasPreview ? previewLimit - limit : 0
  const marginDelta = hasPreview ? previewLimit - previewValue - (limit - value) : 0
  const showDeltaBadge = hasPreview && (Math.abs(valDiff) > 0.05 || Math.abs(limDiff) > 0.05)

  const badgeText =
    Math.abs(valDiff) > 0.05
      ? formatDeltaBadge(valDiff, unit)
      : Math.abs(limDiff) > 0.05
        ? `cap ${formatDeltaBadge(limDiff, unit)}`
        : ''
  const badgeGood = marginDelta > 0.05

  const barColor = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-400',
    red: 'bg-rose-500',
  }[status]

  const textColor = {
    green: 'text-emerald-300',
    yellow: 'text-amber-300',
    red: 'text-rose-300',
  }[status]

  const ghostTone =
    previewStatus === 'red'
      ? 'rgba(244, 63, 94, 0.72)'
      : previewStatus === 'yellow'
        ? 'rgba(251, 191, 36, 0.72)'
        : 'rgba(34, 211, 238, 0.72)'

  const growing = hasPreview && nextPercent > percent + 0.5
  const shrinking = hasPreview && nextPercent < percent - 0.5

  return (
    <div
      className={`space-y-1 rounded-lg px-1.5 py-1 transition-shadow duration-500 ${
        flash ? 'ring-2 ring-blue-400/70' : showDeltaBadge ? 'bg-white/[0.03] ring-1 ring-white/10' : 'ring-0 ring-transparent'
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-slate-300">
          <Tooltip term={glossaryKeyForLabel(label) ?? ''}>{label}</Tooltip>
        </span>
        <div className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
          {showDeltaBadge && (
            <span
              className={`rounded border px-1 py-px text-[10px] font-semibold ${
                badgeGood
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-rose-400/40 bg-rose-500/15 text-rose-300'
              }`}
            >
              {badgeText}
            </span>
          )}
          <span className={textColor}>
            {value.toFixed(1)} / {limit.toFixed(1)} {unit}
          </span>
        </div>
      </div>

      {/* Dual-Layer Ghost Telemetry Gauge */}
      <div className="relative h-2.5 overflow-hidden rounded-full border border-white/10 bg-[#03050a]">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
        {growing && (
          <div
            aria-hidden="true"
            className="animate-pulse absolute inset-y-0"
            style={{
              left: `${percent}%`,
              width: `${Math.min(100 - percent, nextPercent - percent)}%`,
              backgroundImage: `repeating-linear-gradient(45deg, ${ghostTone} 0px, ${ghostTone} 3px, transparent 3px, transparent 6px)`,
            }}
          />
        )}
        {shrinking && (
          <>
            <div
              aria-hidden="true"
              className="animate-pulse absolute inset-y-0"
              style={{
                left: `${nextPercent}%`,
                width: `${percent - nextPercent}%`,
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(52, 211, 153, 0.7) 0px, rgba(52, 211, 153, 0.7) 3px, rgba(3, 5, 10, 0.4) 3px, rgba(3, 5, 10, 0.4) 6px)',
              }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-0.5 bg-emerald-200 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
              style={{ left: `${nextPercent}%` }}
            />
          </>
        )}
        <div aria-hidden="true" className="hud-bar-segments pointer-events-none absolute inset-0" />
        {thresholdPct !== undefined && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/55"
            style={{ left: `${thresholdPct}%` }}
          />
        )}
      </div>

      {showMargin && (
        <div className={`font-mono text-[11px] tabular-nums ${status !== 'red' ? 'text-slate-400' : 'text-rose-300'}`}>
          {marginText ?? marginLine(status, margin, unit, reason)}
        </div>
      )}
      {note && <div className="font-mono text-[10px] text-slate-400">{note}</div>}
    </div>
  )
}

export function Dashboard() {
  const previous = useGameStore((s) => s.previousBudgets)
  const { budgets, checks: goNoGo, previewBudgets, previewChecks, isPreviewing } = useDesignPreview()

  const getStatus = (resource: string, src = goNoGo): BarStatus => {
    const check = src.checks.find((c: { resource: string }) => c.resource === resource)
    return check?.status ?? 'green'
  }
  const getReason = (resource: string) => goNoGo.checks.find((c) => c.resource === resource)?.reason ?? ''
  const budgetCheck = goNoGo.checks.find((c) => c.resource === 'Budget')
  const budgetFig = budgetCheck ? checkFigures(budgetCheck, budgets) : undefined

  const activeCoverage = isPreviewing && previewBudgets ? previewBudgets.projectedCoverage : budgets.projectedCoverage
  const coverageChanged =
    isPreviewing && previewBudgets && Math.abs(previewBudgets.projectedCoverage - budgets.projectedCoverage) > 0.5
  const readyChanged = isPreviewing && previewBudgets && previewBudgets.readyTurn !== budgets.readyTurn

  const goLamp = goNoGo.canGo
    ? goNoGo.warnings.length > 0
      ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]'
      : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
    : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)]'

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[#070c18]/95 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
          Resource Dashboard
        </h2>
        {isPreviewing && (
          <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-cyan-300">
            Preview
          </span>
        )}
      </div>

      <div className="space-y-3">
        <ResourceBar
          label="Mass"
          value={budgets.totalMass}
          limit={budgets.massLimit}
          unit="kg"
          status={getStatus('Mass')}
          previewValue={previewBudgets?.totalMass}
          previewLimit={previewBudgets?.massLimit}
          previewStatus={previewChecks ? getStatus('Mass', previewChecks) : undefined}
          thresholdPct={92}
          reason={getReason('Mass')}
          previous={previous?.totalMass}
        />

        <ResourceBar
          label="Volume"
          value={budgets.totalVolume}
          limit={budgets.volumeLimit}
          unit="U"
          status={getStatus('Volume')}
          previewValue={previewBudgets?.totalVolume}
          previewLimit={previewBudgets?.volumeLimit}
          previewStatus={previewChecks ? getStatus('Volume', previewChecks) : undefined}
          thresholdPct={85}
          reason={getReason('Volume')}
          previous={previous?.totalVolume}
        />

        <ResourceBar
          label="Power"
          value={budgets.powerConsumed}
          limit={budgets.powerGenerated}
          unit="W"
          status={getStatus('Power')}
          previewValue={previewBudgets?.powerConsumed}
          previewLimit={previewBudgets?.powerGenerated}
          previewStatus={previewChecks ? getStatus('Power', previewChecks) : undefined}
          thresholdPct={100}
          reason={getReason('Power')}
          previous={previous?.powerConsumed}
        />

        <ResourceBar
          label="Budget (spendable)"
          value={budgets.totalCost}
          limit={budgets.spendable}
          unit="$M"
          status={getStatus('Budget')}
          previewValue={previewBudgets?.totalCost}
          previewLimit={previewBudgets?.spendable}
          previewStatus={previewChecks ? getStatus('Budget', previewChecks) : undefined}
          thresholdPct={100}
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
          previewValue={previewBudgets?.deltaVTotal}
          previewLimit={previewBudgets?.deltaVAvailable}
          previewStatus={previewChecks ? getStatus('Delta-v', previewChecks) : undefined}
          thresholdPct={85}
          reason={getReason('Delta-v')}
          previous={previous?.deltaVTotal}
        />

        <ResourceBar
          label="Data Link"
          value={budgets.dataPerTurn}
          limit={budgets.downlinkPerTurn}
          unit="MB/month"
          status={getStatus('Data Link')}
          previewValue={previewBudgets?.dataPerTurn}
          previewLimit={previewBudgets?.downlinkPerTurn}
          previewStatus={previewChecks ? getStatus('Data Link', previewChecks) : undefined}
          thresholdPct={85}
          reason={getReason('Data Link')}
          previous={previous?.dataPerTurn}
        />
      </div>

      <div className="hud-panel mt-5 rounded-xl p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-slate-300">Go/No-Go Status</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
              goNoGo.canGo
                ? goNoGo.warnings.length > 0
                  ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                  : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${goLamp}`} aria-hidden="true" />
            {goNoGo.canGo
              ? goNoGo.warnings.length > 0
                ? 'Go (with warnings)'
                : 'Go'
              : 'No-Go'}
          </span>
        </div>

        {isPreviewing && previewChecks && previewChecks.canGo !== goNoGo.canGo && (
          <div className="mt-2 rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-200">
            With hovered choice:{' '}
            <span className={previewChecks.canGo ? 'text-emerald-300' : 'text-rose-300'}>
              {previewChecks.canGo ? 'Go' : 'No-Go'}
            </span>
          </div>
        )}

        {goNoGo.blockers.length > 0 && (
          <div className="mt-2.5 space-y-1">
            {goNoGo.blockers.map((b, i) => (
              <div key={i} className="text-xs leading-snug text-rose-300">
                {b.resource}: {b.reason.split('. ')[0].replace(/\.$/, '')}
                {b.fixStep ? ` (fix at ${fixLocation(b.fixStep)})` : ''}.
              </div>
            ))}
          </div>
        )}

        {goNoGo.warnings.length > 0 && goNoGo.blockers.length === 0 && (
          <div className="mt-2.5 space-y-1">
            {goNoGo.warnings.map((w: { resource: string; reason: string }, i: number) => (
              <div key={i} className="text-xs leading-snug text-amber-300">
                {w.resource}: {w.reason.split('. ')[0].replace(/\.$/, '')}.
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hud-panel mt-3 rounded-xl p-3 font-mono text-xs tabular-nums">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Schedule &amp; Coverage
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-slate-300">
          <span className="text-slate-400">Ready in month:</span>
          <span className="text-right text-slate-100">
            {budgets.readyTurn}
            {readyChanged && previewBudgets && (
              <span className="ml-1 text-cyan-300">→ {previewBudgets.readyTurn}</span>
            )}
          </span>

          <span className="text-slate-400">Ride month:</span>
          <span className="text-right text-slate-100">{budgets.rideTurn}</span>

          <span className="text-slate-400">Arrival month:</span>
          <span className="text-right text-slate-100">{budgets.arrivalTurn ?? '-'}</span>

          <span className="text-slate-400">Reserve:</span>
          <span className="text-right text-slate-100">${budgets.reserveAmount.toFixed(1)}M</span>

          <span className="text-slate-400">Projected ice coverage:</span>
          <span
            className={`text-right font-semibold ${
              activeCoverage >= 70 ? 'text-[#22d3ee]' : 'text-orange-400'
            }`}
          >
            {budgets.projectedCoverage.toFixed(0)}%
            {coverageChanged && previewBudgets && (
              <span className={previewBudgets.projectedCoverage >= 70 ? 'ml-1 text-[#22d3ee]' : 'ml-1 text-orange-300'}>
                → {previewBudgets.projectedCoverage.toFixed(0)}%
              </span>
            )}
          </span>
        </div>
      </div>
    </aside>
  )
}
