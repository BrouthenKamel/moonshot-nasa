import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from 'react'
import { getOrbitById } from '../../data/orbits'
import { computeBudgets } from '../../sim/budgets'
import { EXTRA_PASS_LINK, monthOptions } from '../../sim/ops'
import { isSimComplete } from '../../sim/simulate'
import type { OperatingMode, SimState } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'

/** One month every half second while the flight plays at 1x speed (Jakob, 14 Nov) */
export const AUTO_FLY_MS = 500

/**
 * F3 (Jakob, 14 Nov): how the craft works in the coming science months. The
 * choice holds for every month after it, auto-fly included, until changed.
 */
function ThisMonth({ simState, compact }: { simState: SimState; compact: boolean }) {
  const action = useGameStore((s) => s.pendingAction)
  const setAction = useGameStore((s) => s.setAction)
  const radios = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const o = useMemo(() => monthOptions(simState), [simState])
  const budgets = useMemo(() => computeBudgets(simState.design, simState.difficulty), [simState.design, simState.difficulty])
  const selected = Math.max(0, o.modes.findIndex((m) => m.mode === action.mode))

  const f = simState.flight
  const made = Math.round(budgets.dataPerTurn * f.scienceFactor)
  const baseLink = Math.round(budgets.downlinkPerTurn)
  const boostedLink = Math.round(budgets.downlinkPerTurn * EXTRA_PASS_LINK)
  const activeLink = action.buyExtraPass ? boostedLink : baseLink
  const stored = Math.round(f.science.stored)
  const capacity = Math.round(budgets.storageCapacity)
  const eclipseHours = getOrbitById(simState.design.orbit)?.eclipseHours ?? 0
  const usableWh = Math.round(budgets.batteryUsableWh)

  const badgeFor = (mode: OperatingMode) => {
    if (mode === 'full-science') {
      const needWh = Math.round((budgets.busPower + budgets.instrumentPower) * eclipseHours)
      const overflow = made > activeLink ? `+${made - activeLink} MB buf` : 'Downlink OK'
      const bat = eclipseHours > 0 ? ` · ${needWh}/${usableWh} Wh` : ''
      return { primary: `+${made} MB`, secondary: `${overflow}${bat}`, warn: eclipseHours > 0 && needWh > usableWh }
    }
    if (mode === 'reduced') {
      return { primary: `+${Math.round(made / 2)} MB`, secondary: '50% duty · slower ice map', warn: false }
    }
    const drain = Math.min(stored, activeLink)
    return { primary: '+0 MB', secondary: drain > 0 ? `Drain -${drain} MB backlog` : 'Bus only · idle', warn: false }
  }

  // Arrow keys move the choice, as in any radio group
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (selected + step + o.modes.length) % o.modes.length
    setAction({ mode: o.modes[next].mode })
    radios.current[next]?.focus()
  }

  const text = compact ? 'text-xs' : 'text-sm'
  return (
    <div className="hud-panel mb-2.5 rounded-xl p-3 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]" aria-hidden="true" />
          <div id={`${id}-title`} className="font-mono text-xs font-bold tracking-wider text-slate-200 uppercase">
            This month
          </div>
        </div>
        <div className="font-mono text-[10px] tabular-nums text-slate-400">
          BUFFER {stored} / {capacity} MB
        </div>
      </div>

      <div role="radiogroup" aria-labelledby={`${id}-title`} className="mt-2 space-y-1.5" onKeyDown={onKeyDown}>
        {o.modes.map((m, i) => {
          const on = i === selected
          const badge = badgeFor(m.mode)
          return (
            <button
              key={m.mode}
              ref={(el) => {
                radios.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-labelledby={`${id}-${m.mode}-label`}
              aria-describedby={`${id}-${m.mode}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setAction({ mode: m.mode })}
              className={`w-full rounded-lg border px-3 py-2 text-left transition ${text} ${
                on
                  ? 'border-blue-400/70 bg-blue-950/75 text-white shadow-[0_0_16px_rgba(59,130,246,0.22)]'
                  : 'border-white/10 bg-slate-900/70 text-slate-200 hover:border-white/25 hover:bg-slate-800/80'
              }`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full transition ${
                      on ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : 'bg-slate-600'
                    }`}
                  />
                  <span id={`${id}-${m.mode}-label`} className="font-semibold">
                    {m.label}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
                  <span className={`rounded px-1.5 py-0.5 font-bold ${on ? 'bg-blue-500/25 text-blue-200' : 'bg-white/5 text-slate-300'}`}>
                    {badge.primary}
                  </span>
                  <span className={badge.warn ? 'text-amber-300' : 'text-slate-400'}>{badge.secondary}</span>
                </span>
              </span>
              <span id={`${id}-${m.mode}`} className="mt-1 block text-[11px] leading-snug text-slate-300">
                {m.effect}
              </span>
            </button>
          )
        })}
      </div>

      <label
        className={`mt-2 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition ${text} ${
          action.buyExtraPass
            ? 'border-amber-400/60 bg-amber-950/35 text-amber-50'
            : 'border-white/10 bg-slate-900/60 text-slate-200 hover:border-white/20'
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-amber-400"
          checked={action.buyExtraPass}
          disabled={!o.extraPass.affordable && !action.buyExtraPass}
          onChange={(e) => setAction({ buyExtraPass: e.target.checked })}
          aria-describedby={`${id}-pass`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{o.extraPass.label}</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-emerald-300">
              {baseLink} → {boostedLink} MB/mo
            </span>
          </span>
          <span id={`${id}-pass`} className="mt-0.5 block text-[11px] text-slate-300">
            {o.extraPass.effect}
          </span>
        </span>
      </label>
      <div className="mt-1.5 text-[11px] text-slate-400">Applies from the next month until you change it.</div>
    </div>
  )
}

/** Month buttons during the flight; "See report" once it is over. Hidden while an event card waits. */
export function FlightControls({ compact = false }: { compact?: boolean }) {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const autoFly = useGameStore((s) => s.autoFly)
  const startAutoFly = useGameStore((s) => s.startAutoFly)
  const stopAutoFly = useGameStore((s) => s.stopAutoFly)
  const showReport = useGameStore((s) => s.showReport)
  const autoFlySpeed = useUiStore((s) => s.autoFlySpeed)
  const setAutoFlySpeed = useUiStore((s) => s.setAutoFlySpeed)

  // Play the flight month by month; the store switches it off at the next milestone
  const intervalMs = autoFlySpeed === 2 ? AUTO_FLY_MS / 2 : AUTO_FLY_MS
  useEffect(() => {
    if (!autoFly) return
    const id = setInterval(() => useGameStore.getState().autoFlyTick(), intervalMs)
    return () => clearInterval(id)
  }, [autoFly, intervalMs])

  if (!simState) return null
  const pad = compact ? 'py-2 text-sm' : 'py-3'

  if (isSimComplete(simState)) {
    return (
      <button
        type="button"
        onClick={() => showReport()}
        className={`w-full rounded-xl bg-emerald-600 font-display font-bold text-white shadow-lg transition hover:bg-emerald-500 ${pad}`}
      >
        See report
      </button>
    )
  }
  if (simState.pendingDecision) return null
  return (
    <div>
      {simState.phase === 'orbit' && <ThisMonth simState={simState} compact={compact} />}
      <div className="flex flex-wrap items-stretch gap-2">
        <button
          type="button"
          onClick={() => advanceTurn()}
          disabled={autoFly}
          className={`flex-1 rounded-xl border border-white/15 bg-slate-800/95 px-3 font-medium text-white shadow transition hover:bg-slate-700 disabled:opacity-50 ${pad}`}
        >
          Advance one month
        </button>
        {autoFly ? (
          <button
            type="button"
            onClick={() => stopAutoFly()}
            className={`flex-1 rounded-xl bg-amber-600 px-3 font-medium text-white shadow transition hover:bg-amber-500 ${pad}`}
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startAutoFly()}
            className={`flex-1 rounded-xl bg-blue-600 px-3 font-medium text-white shadow transition hover:bg-blue-500 ${pad}`}
          >
            Fly until something happens
          </button>
        )}
        <div
          className="hud-panel flex items-center rounded-xl p-1 font-mono text-xs font-bold"
          aria-label="Auto-fly speed"
        >
          {([1, 2] as const).map((spd) => (
            <button
              key={spd}
              type="button"
              aria-pressed={autoFlySpeed === spd}
              aria-label={`Auto-fly speed ${spd}x`}
              onClick={() => setAutoFlySpeed(spd)}
              className={`rounded-lg px-2.5 py-1.5 transition ${
                autoFlySpeed === spd ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
