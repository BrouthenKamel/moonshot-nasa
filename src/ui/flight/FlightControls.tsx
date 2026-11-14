import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useGameStore } from '../../state/gameStore'
import { isSimComplete } from '../../sim/simulate'
import { monthOptions } from '../../sim/ops'
import type { SimState } from '../../sim/types'

/** One turn every half second while the flight plays (Jakob, 14 Nov) */
export const AUTO_FLY_MS = 500

/**
 * F3 (Jakob, 14 Nov): how the craft works in the coming science months. The
 * choice holds for every turn after it, auto-fly included, until changed.
 */
function ThisMonth({ simState, compact }: { simState: SimState; compact: boolean }) {
  const action = useGameStore((s) => s.pendingAction)
  const setAction = useGameStore((s) => s.setAction)
  const radios = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const o = monthOptions(simState)
  const selected = Math.max(0, o.modes.findIndex((m) => m.mode === action.mode))

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
    <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/90 p-3">
      <div id={`${id}-title`} className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        This month
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-title`} className="mt-2 space-y-1" onKeyDown={onKeyDown}>
        {o.modes.map((m, i) => {
          const on = i === selected
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
              className={`w-full rounded-md border px-3 py-2 text-left ${text} ${
                on ? 'border-blue-500 bg-blue-950 text-white' : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <span id={`${id}-${m.mode}-label`} className="font-medium">
                {m.label}
              </span>
              <span id={`${id}-${m.mode}`} className="block text-xs text-slate-400">
                {m.effect}
              </span>
            </button>
          )
        })}
      </div>
      <label className={`mt-2 flex items-start gap-2 ${text} text-slate-200`}>
        <input
          type="checkbox"
          className="mt-1"
          checked={action.buyExtraPass}
          disabled={!o.extraPass.affordable && !action.buyExtraPass}
          onChange={(e) => setAction({ buyExtraPass: e.target.checked })}
          aria-describedby={`${id}-pass`}
        />
        <span>
          <span className="font-medium">{o.extraPass.label}</span>
          <span id={`${id}-pass`} className="block text-xs text-slate-400">
            {o.extraPass.effect}
          </span>
        </span>
      </label>
      <div className="mt-2 text-xs text-slate-500">Applies from the next month until you change it.</div>
    </div>
  )
}

/** Turn buttons during the flight; "See report" once it is over. Hidden while an event card waits. */
export function FlightControls({ compact = false }: { compact?: boolean }) {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const autoFly = useGameStore((s) => s.autoFly)
  const startAutoFly = useGameStore((s) => s.startAutoFly)
  const stopAutoFly = useGameStore((s) => s.stopAutoFly)
  const showReport = useGameStore((s) => s.showReport)

  // Play the flight turn by turn; the store switches it off at the next milestone
  useEffect(() => {
    if (!autoFly) return
    const id = setInterval(() => useGameStore.getState().autoFlyTick(), AUTO_FLY_MS)
    return () => clearInterval(id)
  }, [autoFly])

  if (!simState) return null
  const pad = compact ? 'py-2 text-sm' : 'py-3'

  if (isSimComplete(simState)) {
    return (
      <button
        onClick={() => showReport()}
        className={`w-full rounded-lg bg-green-600 font-medium text-white hover:bg-green-500 ${pad}`}
      >
        See report
      </button>
    )
  }
  if (simState.pendingDecision) return null
  return (
    <div>
      {simState.phase === 'orbit' && <ThisMonth simState={simState} compact={compact} />}
      <div className="flex gap-3">
        <button
          onClick={() => advanceTurn()}
          disabled={autoFly}
          className={`flex-1 rounded-lg bg-slate-700 font-medium text-white hover:bg-slate-600 disabled:opacity-50 ${pad}`}
        >
          Advance one month
        </button>
        {autoFly ? (
          <button onClick={() => stopAutoFly()} className={`flex-1 rounded-lg bg-amber-600 font-medium text-white hover:bg-amber-500 ${pad}`}>
            Pause
          </button>
        ) : (
          <button onClick={() => startAutoFly()} className={`flex-1 rounded-lg bg-blue-600 font-medium text-white hover:bg-blue-500 ${pad}`}>
            Fly until something happens
          </button>
        )}
      </div>
    </div>
  )
}
