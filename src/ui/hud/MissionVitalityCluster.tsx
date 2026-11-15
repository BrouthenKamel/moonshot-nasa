import { useEffect, useMemo } from 'react'
import { useDesignPreview } from '../useDesignPreview'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { audio } from '../../assets/audio'
import { fixLocation } from '../../viz/missionMap'
import type { DesignStep } from '../../sim/types'

function GaugeArc({
  label,
  value,
  max,
  unit,
  previewValue,
  warningThreshold = 0.9,
  criticalThreshold = 1.0,
  inverse = false,
  detail,
}: {
  label: string
  value: number
  max: number
  unit: string
  previewValue?: number | null
  warningThreshold?: number
  criticalThreshold?: number
  inverse?: boolean
  detail?: string
}) {
  const currentVal = previewValue !== null && previewValue !== undefined ? previewValue : value
  const ratio = max > 0 ? Math.min(1.2, Math.max(0, currentVal / max)) : 0
  const pct = Math.min(100, Math.round(ratio * 100))

  let tone = 'text-go'
  let strokeColor = '#6faf7a'

  const isOver = inverse ? ratio < (1 - criticalThreshold) : ratio > criticalThreshold
  const isWarn = inverse ? ratio < (1 - warningThreshold) : ratio > warningThreshold

  if (isOver) {
    tone = 'text-nogo'
    strokeColor = '#d0533f'
  } else if (isWarn) {
    tone = 'text-caution'
    strokeColor = '#d9b23f'
  }

  const isGhosting = previewValue !== null && previewValue !== undefined && previewValue !== value
  const delta = isGhosting ? previewValue - value : 0

  return (
    <div
      className="group relative flex flex-col items-center justify-center p-3 rounded-xl bg-ink-2/70 border border-rule/60 hover:border-rule-strong hover:bg-ink-2/90 transition-all duration-200"
      title={detail}
    >
      <div className="flex items-center justify-between w-full px-1 text-[11px] uppercase font-mono tracking-wider text-paper-dim">
        <span>{label}</span>
        {isGhosting && (
          <span className={`text-[10px] font-semibold ${delta > 0 ? (inverse ? 'text-go' : 'text-nogo') : inverse ? 'text-nogo' : 'text-go'}`}>
            {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
          </span>
        )}
      </div>

      <div className="relative mt-2 flex items-baseline gap-1.5">
        <span className={`fp-display text-2xl font-bold tracking-tight transition-colors duration-200 ${tone}`}>
          {currentVal.toFixed(currentVal >= 100 ? 0 : 1)}
        </span>
        <span className="text-[11px] font-mono text-paper-faint">/ {max} {unit}</span>
      </div>

      {/* Sleek gauge fill bar */}
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-0/90 border border-rule/50">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(100, pct)}%`,
            backgroundColor: strokeColor,
            boxShadow: `0 0 10px ${strokeColor}60`,
          }}
        />
      </div>

      {detail && (
        <div className="mt-1.5 text-[10px] font-mono text-paper-faint truncate max-w-[120px]">
          {detail}
        </div>
      )}
    </div>
  )
}

/**
 * Compact telemetry summary designed to sit permanently in the top Header bar.
 * Gives real-time Go/No-Go status and vital metrics without taking any canvas space.
 */
export function MissionVitalityPill() {
  const { budgets, checks, previewBudgets, isPreviewing } = useDesignPreview()
  const toggleHudModal = useUiStore((s) => s.toggleHudModal)
  const hudModalOpen = useUiStore((s) => s.hudModalOpen)

  const activeBudgets = previewBudgets ?? budgets
  const blockers = checks.blockers
  const warnings = checks.warnings

  const statusVerdict = useMemo(() => {
    if (blockers.length > 0) {
      return {
        label: `${blockers.length} BLOCKER${blockers.length > 1 ? 'S' : ''}`,
        tone: 'bg-nogo/20 text-nogo border-nogo/60 hover:bg-nogo/30',
        dot: 'bg-nogo animate-pulse',
      }
    }
    if (warnings.length > 0) {
      return {
        label: `${warnings.length} RISK${warnings.length > 1 ? 'S' : ''}`,
        tone: 'bg-caution/20 text-caution border-caution/60 hover:bg-caution/30',
        dot: 'bg-caution',
      }
    }
    return {
      label: 'ALL SYSTEMS GO',
      tone: 'bg-go/20 text-go border-go/60 hover:bg-go/30',
      dot: 'bg-go',
    }
  }, [blockers, warnings])

  const massDelta = previewBudgets ? previewBudgets.totalMass - budgets.totalMass : 0
  const powerDelta = previewBudgets ? previewBudgets.powerConsumed - budgets.powerConsumed : 0

  return (
    <div className="flex items-center gap-2">
      {/* Go / No-Go Pill */}
      <button
        type="button"
        onClick={() => {
          audio.play('sfx.click')
          toggleHudModal()
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-bold tracking-wider transition-all shadow-sm ${statusVerdict.tone}`}
        title="Toggle Mission Vitality HUD"
      >
        <span className={`h-2 w-2 rounded-full ${statusVerdict.dot}`} />
        <span>{statusVerdict.label}</span>
      </button>

      {/* Key Numbers (Desktop only) */}
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

      {/* HUD Toggle Trigger */}
      <button
        type="button"
        onClick={() => {
          audio.play('sfx.click')
          toggleHudModal()
        }}
        className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-mono tracking-wide transition-all ${
          hudModalOpen
            ? 'bg-kapton text-ink-0 border-kapton font-bold shadow-md'
            : 'bg-ink-2/80 text-paper hover:text-kapton hover:border-rule-strong border-rule/60'
        }`}
        title="Toggle Full Vitality HUD (Shortcut: H)"
      >
        <span>📊</span>
        <span>HUD</span>
      </button>
    </div>
  )
}

/**
 * Full-fidelity Mission Vitality HUD Modal.
 * Renders as a backdrop-blurred aerospace overlay dialog when hudModalOpen is true.
 */
export function MissionVitalityCluster() {
  const { budgets, checks, previewBudgets, isPreviewing } = useDesignPreview()
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const hudModalOpen = useUiStore((s) => s.hudModalOpen)
  const setHudModalOpen = useUiStore((s) => s.setHudModalOpen)

  const activeBudgets = previewBudgets ?? budgets
  const blockers = checks.blockers
  const warnings = checks.warnings

  // Keyboard shortcut listener (Esc to close)
  useEffect(() => {
    if (!hudModalOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        audio.play('sfx.click')
        setHudModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hudModalOpen, setHudModalOpen])

  const statusVerdict = useMemo(() => {
    if (blockers.length > 0) {
      return {
        label: `${blockers.length} BLOCKER${blockers.length > 1 ? 'S' : ''}`,
        tone: 'bg-nogo/20 text-nogo border-nogo/60 shadow-nogo/20',
        dot: 'bg-nogo animate-pulse',
        desc: blockers[0]?.reason ?? 'Systems over constraint',
        fixStep: blockers[0]?.fixStep,
      }
    }
    if (warnings.length > 0) {
      return {
        label: `${warnings.length} RISK${warnings.length > 1 ? 'S' : ''}`,
        tone: 'bg-caution/20 text-caution border-caution/60 shadow-caution/20',
        dot: 'bg-caution',
        desc: warnings[0]?.reason ?? 'Marginal operations expected',
        fixStep: warnings[0]?.fixStep,
      }
    }
    return {
      label: 'ALL SYSTEMS GO',
      tone: 'bg-go/20 text-go border-go/60 shadow-go/20',
      dot: 'bg-go',
      desc: 'Flight envelope fully satisfied',
      fixStep: 'go-nogo' as DesignStep,
    }
  }, [blockers, warnings])

  if (!hudModalOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mission Vitality Telemetry Cluster"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-0/70 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          audio.play('sfx.click')
          setHudModalOpen(false)
        }
      }}
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-rule/80 bg-ink-1/95 p-6 shadow-2xl backdrop-blur-xl">
        {/* Top Header Bar inside Modal */}
        <div className="flex items-center justify-between border-b border-rule/60 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <span className={`h-3 w-3 rounded-full ${statusVerdict.dot}`} />
            <span className="font-mono text-sm font-bold tracking-wider text-paper uppercase">
              Mission Vitality Telemetry
            </span>
            {isPreviewing && (
              <span className="rounded bg-kapton/20 px-2 py-0.5 text-[10px] font-mono font-bold text-kapton border border-kapton/40 animate-pulse">
                PREVIEWING SELECTION
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              audio.play('sfx.click')
              setHudModalOpen(false)
            }}
            className="rounded-lg p-1 text-paper-dim hover:text-paper hover:bg-ink-2 font-mono text-sm transition-colors"
            title="Close HUD (Esc)"
          >
            ✕
          </button>
        </div>

        {/* 4 Core Instrumentation Dials */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <GaugeArc
            label="Mass"
            value={budgets.totalMass}
            max={budgets.massLimit}
            unit="kg"
            previewValue={previewBudgets?.totalMass}
            detail={`${activeBudgets.massMargin >= 0 ? '+' : ''}${activeBudgets.massMargin.toFixed(1)}kg rem.`}
          />
          <GaugeArc
            label="Power"
            value={budgets.powerConsumed}
            max={budgets.powerGenerated}
            unit="W"
            previewValue={previewBudgets ? previewBudgets.powerConsumed : null}
            detail={`${activeBudgets.batteryCapacity.toFixed(0)}Wh bat.`}
          />
          <GaugeArc
            label="Delta-v"
            value={budgets.deltaVTotal}
            max={Math.max(budgets.deltaVTotal, (budgets.captureDeltaV ?? 280) + (budgets.deltaVStationKeeping ?? 30))}
            unit="m/s"
            previewValue={previewBudgets?.deltaVTotal}
            warningThreshold={0.7}
            criticalThreshold={0.5}
            inverse={true}
            detail={`+${activeBudgets.deltaVMargin.toFixed(0)}m/s margin`}
          />
          <GaugeArc
            label="Budget"
            value={budgets.totalCost}
            max={budgets.budgetCap}
            unit="M"
            previewValue={previewBudgets?.totalCost}
            detail={`$${activeBudgets.budgetMargin.toFixed(1)}M left`}
          />
        </div>

        {/* Mission Status Annunciator Ribbon */}
        <div
          onClick={() => {
            if (statusVerdict.fixStep) {
              audio.play('sfx.select')
              setHudModalOpen(false)
              setDesignStep(statusVerdict.fixStep)
            }
          }}
          className={`mt-4 flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-all duration-200 hover:brightness-110 ${statusVerdict.tone}`}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider">
              <span>{statusVerdict.label}</span>
              {statusVerdict.fixStep && statusVerdict.fixStep !== 'go-nogo' && (
                <span className="text-[11px] text-paper-dim font-normal">
                  · Fix at {fixLocation(statusVerdict.fixStep)} →
                </span>
              )}
            </div>
            <div className="truncate text-xs text-paper-dim mt-0.5">
              {statusVerdict.desc}
            </div>
          </div>

          <div className="shrink-0 font-mono text-xs font-bold underline underline-offset-2">
            {statusVerdict.fixStep === 'go-nogo' ? 'LAUNCH POLL →' : 'RESOLVE →'}
          </div>
        </div>

        {/* Engineering Telemetry Breakdown */}
        <div className="mt-4 border-t border-rule/60 pt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs text-paper-dim">
          <div className="flex justify-between">
            <span>Eclipse Power Drain:</span>
            <span className="text-paper font-semibold">{activeBudgets.eclipsePowerConsumed.toFixed(1)} W</span>
          </div>
          <div className="flex justify-between">
            <span>Battery Margin in Eclipse:</span>
            <span className={activeBudgets.batteryMarginMinutes < 0 ? 'text-nogo font-bold' : 'text-paper font-semibold'}>
              {activeBudgets.batteryMarginMinutes.toFixed(0)} min
            </span>
          </div>
          <div className="flex justify-between">
            <span>Projected Ice Coverage:</span>
            <span className="text-ice font-bold">{activeBudgets.projectedCoverage.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Contingency Reserve:</span>
            <span className="text-paper font-semibold">${activeBudgets.reserveAmount.toFixed(2)}M</span>
          </div>
        </div>

        {/* Blocker & Warning Diagnostics */}
        {(blockers.length > 0 || warnings.length > 0) && (
          <div className="mt-4 rounded-xl bg-ink-2/80 border border-rule/60 p-3.5 text-xs">
            <span className="font-mono font-bold text-paper">Diagnostic Remediation Actions:</span>
            <ul className="mt-2 space-y-1.5 font-mono">
              {blockers.map((b, i) => (
                <li key={`blocker-${i}`} className="flex items-center justify-between text-nogo gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-nogo shrink-0" />
                    <span>{b.reason}</span>
                  </span>
                  {b.fixStep && (
                    <button
                      type="button"
                      onClick={() => {
                        setHudModalOpen(false)
                        setDesignStep(b.fixStep!)
                      }}
                      className="px-2 py-0.5 rounded bg-nogo/20 hover:bg-nogo/30 border border-nogo/40 underline font-bold shrink-0"
                    >
                      Fix at {fixLocation(b.fixStep)}
                    </button>
                  )}
                </li>
              ))}
              {warnings.map((w, i) => (
                <li key={`warning-${i}`} className="flex items-center justify-between text-caution gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-caution shrink-0" />
                    <span>{w.reason}</span>
                  </span>
                  {w.fixStep && (
                    <button
                      type="button"
                      onClick={() => {
                        setHudModalOpen(false)
                        setDesignStep(w.fixStep!)
                      }}
                      className="px-2 py-0.5 rounded bg-caution/20 hover:bg-caution/30 border border-caution/40 underline font-bold shrink-0"
                    >
                      Fix at {fixLocation(w.fixStep)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
