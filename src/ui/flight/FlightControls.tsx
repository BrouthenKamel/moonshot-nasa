import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from 'react'
import { getOrbitById } from '../../data/orbits'
import { computeBudgets } from '../../sim/budgets'
import { EXTRA_PASS_LINK, monthOptions } from '../../sim/ops'
import { isSimComplete } from '../../sim/simulate'
import type { OperatingMode, SimState } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { Eng, Story } from '../kit'

/** One month every half second while the flight plays at 1x speed (Jakob, 14 Nov) */
export const AUTO_FLY_MS = 500

/** The plain consequence of each mode, for Story view */
const MODE_STORY: Record<OperatingMode, string> = {
  'full-science': 'Most science and the fastest ice map.',
  reduced: 'Half the science, easier on the battery.',
  'safe-mode': 'No science; the craft rests and sends what it has stored.',
}

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
      const warn = eclipseHours > 0 && needWh > usableWh
      return { primary: `+${made} MB`, secondary: `${overflow}${bat}`, warn, story: warn ? 'Battery runs short in eclipse' : made > activeLink ? 'Fills the buffer' : 'Link keeps up' }
    }
    if (mode === 'reduced') {
      return { primary: `+${Math.round(made / 2)} MB`, secondary: '50% duty · slower ice map', warn: false, story: 'Slower ice map' }
    }
    const drain = Math.min(stored, activeLink)
    return {
      primary: '+0 MB',
      secondary: drain > 0 ? `Drain -${drain} MB backlog` : 'Bus only · idle',
      warn: false,
      story: drain > 0 ? 'Empties the buffer' : 'Idle',
    }
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
    <div className="fp-sheet mb-2.5 p-3 text-paper" data-tone="raised">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-1">
        <div id={`${id}-title`} className="fp-display text-sm text-paper">
          This month
        </div>
        <div className="fp-data text-[10px] text-paper-dim">
          BUFFER {stored} / {capacity} MB
        </div>
      </div>

      <div role="radiogroup" aria-labelledby={`${id}-title`} className="mt-1" onKeyDown={onKeyDown}>
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
              className={`block w-full border-b border-l-[3px] border-b-rule px-2.5 py-1.5 text-left transition-colors ${text} ${
                on ? 'border-l-kapton bg-ink-3 text-paper' : 'border-l-transparent text-paper-dim hover:bg-ink-3/60 hover:text-paper'
              }`}
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="inline-flex items-baseline gap-2">
                  <span aria-hidden="true" className={`fp-data text-[10px] ${on ? 'text-kapton' : 'text-paper-faint'}`}>
                    {on ? '■' : '□'}
                  </span>
                  <span id={`${id}-${m.mode}-label`} className="fp-label text-[0.75rem] text-current">
                    {m.label}
                  </span>
                </span>
                <span className="inline-flex items-baseline gap-1.5 text-[10px]">
                  <Eng className={`fp-data font-semibold ${on ? 'text-paper' : 'text-paper-dim'}`}>{badge.primary}</Eng>
                  <Eng className={`fp-data ${badge.warn ? 'text-caution' : 'text-paper-faint'}`}>{badge.secondary}</Eng>
                  <Story className={`fp-label text-[0.62rem] ${badge.warn ? 'text-caution' : 'text-paper-faint'}`}>{badge.story}</Story>
                </span>
              </span>
              <span id={`${id}-${m.mode}`} className="mt-0.5 block pl-5 text-[11px] leading-snug text-paper-dim">
                <Story>{MODE_STORY[m.mode]}</Story>
                <Eng>{m.effect}</Eng>
              </span>
            </button>
          )
        })}
      </div>

      <label
        className={`mt-2 flex cursor-pointer items-start gap-2.5 border px-2.5 py-1.5 transition-colors ${text} ${
          action.buyExtraPass ? 'border-kapton bg-ink-3 text-paper' : 'border-rule text-paper-dim hover:border-rule-strong'
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--color-kapton)]"
          checked={action.buyExtraPass}
          disabled={!o.extraPass.affordable && !action.buyExtraPass}
          onChange={(e) => setAction({ buyExtraPass: e.target.checked })}
          aria-describedby={`${id}-pass`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold">{o.extraPass.label}</span>
            <Eng className="fp-data text-[10px] text-paper">
              {baseLink} → {boostedLink} MB/mo
            </Eng>
          </span>
          <span id={`${id}-pass`} className="mt-0.5 block text-[11px] text-paper-dim">
            <Story>More data sent home this month, for a little money.</Story>
            <Eng>{o.extraPass.effect}</Eng>
          </span>
        </span>
      </label>
      <div className="mt-1.5 fp-label text-[0.62rem] text-paper-faint">Applies from the next month until you change it.</div>
    </div>
  )
}

/** The skip button names where it jumps to: the end of the phase the flight is in */
function skipLabel(phase: string): string {
  switch (phase) {
    case 'build':
      return 'Skip to end of building'
    case 'test':
      return 'Skip to end of testing'
    case 'wait':
      return 'Skip to launch'
    case 'transfer':
      return 'Skip to arrival at the Moon'
    case 'capture':
      return 'Skip to the science orbit'
    case 'orbit':
      return 'Skip to the end of the mission'
    default:
      return 'Skip to end of this phase'
  }
}

/**
 * Month buttons during the flight; "See report" once it is over. Hidden while an event card waits.
 * `monthPlan` shows the in-orbit "This month" science chooser above the buttons (off on the base map:
 * the craft keeps the last choice, full science by default).
 */
export function FlightControls({ compact = false, monthPlan = true }: { compact?: boolean; monthPlan?: boolean }) {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const autoFly = useGameStore((s) => s.autoFly)
  const skipPhase = useGameStore((s) => s.skipPhase)
  const showReport = useGameStore((s) => s.showReport)
  const autoFlySpeed = useUiStore((s) => s.autoFlySpeed)

  // Play the flight month by month; the store switches it off at the next milestone
  const intervalMs = autoFlySpeed === 2 ? AUTO_FLY_MS / 2 : AUTO_FLY_MS
  useEffect(() => {
    if (!autoFly) return
    const id = setInterval(() => useGameStore.getState().autoFlyTick(), intervalMs)
    return () => clearInterval(id)
  }, [autoFly, intervalMs])

  if (!simState) return null
  const pad = compact ? 'py-2' : 'py-3'

  if (isSimComplete(simState)) {
    return (
      <button type="button" onClick={() => showReport()} className={`fp-btn-primary w-full justify-center ${pad}`}>
        See report
      </button>
    )
  }
  if (simState.pendingDecision) return null
  return (
    <div>
      {monthPlan && simState.phase === 'orbit' && <ThisMonth simState={simState} compact={compact} />}
      <div className="flex flex-wrap items-stretch gap-2">
        <button
          type="button"
          onClick={() => advanceTurn()}
          disabled={autoFly}
          className={`fp-btn-primary flex-1 justify-center whitespace-nowrap ${pad}`}
        >
          Advance one month
        </button>
        <button
          type="button"
          onClick={() => (autoFly ? useGameStore.getState().stopAutoFly() : skipPhase())}
          aria-pressed={autoFly}
          title="Jump to the end of this phase. An event card still stops the flight for your answer."
          className={`fp-btn-secondary flex-1 justify-center whitespace-nowrap ${pad}`}
        >
          {autoFly ? 'Pause' : skipLabel(simState.phase)}
        </button>
      </div>
    </div>
  )
}
