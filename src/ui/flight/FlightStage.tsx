import { Component, lazy, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { difficultyPresets } from '../../data/brief'
import { canUseWebGL } from '../../scene/webgl'
import { isSimComplete } from '../../sim/simulate'
import type { SimState } from '../../sim/types'
import { LAUNCH, useUiStore } from '../../state/uiStore'
import { flightShot } from '../../viz/flight/flightDirector'
import { missionClockLabel } from '../../viz/missionMap'
import { EventCard } from './EventCard'
import { FlightControls } from './FlightControls'
import { Tooltip } from '../Tooltip'

const FlightView = lazy(() => import('../../scene/flight/FlightView').then((m) => ({ default: m.FlightView })))

class ViewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const PHASE_TEXT: Record<SimState['phase'], string> = {
  build: 'Building in the Factory',
  test: 'Testing in the Factory',
  wait: 'Ready, waiting for the ride',
  transfer: 'On the way to the Moon',
  capture: 'Capture burn',
  orbit: 'Mapping the south pole',
  complete: 'Mission over',
  failed: 'Mission lost',
}

function Gauge({ label, value, sub, fill, color, term }: { label: string; value: string; sub?: string; fill: number; color: string; term?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{term ? <Tooltip term={term}>{label}</Tooltip> : label}</span>
        <span className="font-display text-sm font-bold tabular-nums text-white">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, fill * 100))}%`, background: color }} />
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}

/** Live mission numbers over the view. Every number is the core's flight state. */
function Hud({ sim }: { sim: SimState }) {
  const f = sim.flight
  const target = difficultyPresets[sim.difficulty]?.dataTarget ?? 300
  return (
    <div className="pointer-events-none absolute left-3 top-3 w-[min(92%,300px)] lg:left-[19.5rem] rounded-2xl border border-white/10 bg-[#0b1226]/80 p-3 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="font-display text-sm font-bold">🛰️ Lunar Ice Mapper</div>
        <div className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums">{missionClockLabel(sim.currentTurn).replace(/^m/, 'M')}</div>
      </div>
      <div className="mb-2.5 text-xs text-slate-300">{PHASE_TEXT[sim.phase]}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Gauge term="coverage" label="Ice mapped" value={`${f.coverage.toFixed(1)}%`} sub="needs 70%, data home" fill={f.coverage / 70} color="#22d3ee" />
        <Gauge term="downlink" label="Science home" value={`${f.data.toFixed(0)} MB`} sub={`needs ${target} MB`} fill={f.data / target} color="#4ade80" />
        <Gauge term="delta-v" label="Delta-v left" value={`${Math.max(0, f.dvLeft).toFixed(0)} m/s`} fill={f.dvLeft / Math.max(1, sim.turnLogs[0]?.fuelRemaining ?? f.dvLeft)} color="#fb923c" />
        <Gauge
          term="reserve"
          label="Money"
          value={`${f.main.toFixed(1)} M`}
          sub={f.reserve < 0 ? `reserve overdrawn ${(-f.reserve).toFixed(1)} M` : `+ ${f.reserve.toFixed(1)} M reserve`}
          fill={(f.main + Math.max(0, f.reserve)) / 25}
          color={f.reserve < 0 ? '#f87171' : '#a78bfa'}
        />
      </div>
      {f.captured && (
        <div className="mt-2.5 text-[10px] text-slate-400">
          Science month {f.scienceTurns} of 12 · {f.science.stored >= 1 ? `${f.science.stored.toFixed(0)} MB waiting on board` : 'nothing waiting on board'}
        </div>
      )}
    </div>
  )
}

function ViewToggle() {
  const view = useUiStore((s) => s.flightView)
  const setView = useUiStore((s) => s.setFlightView)
  const launching = useUiStore((s) => s.launchAt !== null)
  if (launching) return null
  return (
    <div className="pointer-events-auto absolute right-3 top-3 lg:right-[19.5rem] flex rounded-full border border-white/15 bg-[#0b1226]/80 p-1 text-xs font-semibold text-white backdrop-blur-md" role="radiogroup" aria-label="View">
      {(['space', 'island'] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={view === v}
          onClick={() => setView(v)}
          className={`rounded-full px-3 py-1 ${view === v ? 'bg-orange-500' : 'hover:bg-white/10'}`}
        >
          {v === 'space' ? '🌙 Space' : '🏝️ Agency'}
        </button>
      ))}
    </div>
  )
}

/** Countdown numbers over the island while the rocket waits on the pad */
function Countdown() {
  const launchAt = useUiStore((s) => s.launchAt)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (launchAt === null) return
    let raf = 0
    const tick = () => {
      const t = (performance.now() - launchAt) / 1000
      const left = Math.ceil(LAUNCH.ignitionS - t)
      if (ref.current) ref.current.textContent = t < LAUNCH.ignitionS ? (left > 5 ? '' : String(Math.max(1, left))) : t < LAUNCH.ignitionS + 2.5 ? 'LIFTOFF' : ''
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [launchAt])
  if (launchAt === null) return null
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-[18%] text-center font-display text-7xl font-bold tracking-widest text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]"
    />
  )
}

/**
 * The flight in the base's centre panel: before launch the island (the craft is built in the
 * Factory), the launch on the island's pad, then the space view, with a toggle back to the island.
 */
export function FlightStage({ sim, island }: { sim: SimState; island: ReactNode }) {
  const view = useUiStore((s) => s.flightView)
  const launchAt = useUiStore((s) => s.launchAt)
  const startLaunch = useUiStore((s) => s.startLaunch)
  const endLaunch = useUiStore((s) => s.endLaunch)
  const launched = sim.flight.launchedTurn !== null
  const webgl = useMemo(() => canUseWebGL(), [])

  // The launch plays once, when the core reports liftoff
  const wasLaunched = useRef(launched)
  useEffect(() => {
    if (launched && !wasLaunched.current) startLaunch()
    wasLaunched.current = launched
  }, [launched, startLaunch])
  useEffect(() => {
    if (launchAt === null) return
    const id = window.setTimeout(endLaunch, Math.max(0, LAUNCH.durationS * 1000 - (performance.now() - launchAt)))
    return () => window.clearTimeout(id)
  }, [launchAt, endLaunch])

  const terminal = isSimComplete(sim) ? (sim.phase === 'failed' ? 'failed' : 'complete') : undefined
  const shot = useMemo(
    () => flightShot(sim.design, sim.turnLogs, sim.turnLogs.length - 1, { terminal, transferLeft: sim.flight.transferLeft }),
    [sim, terminal],
  )
  const showSpace = webgl && launched && launchAt === null && view === 'space'

  return (
    <>
      {showSpace ? (
        <div className="absolute inset-0 bg-black">
          <ViewBoundary fallback={island}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Pointing the telescope…</div>}>
              <FlightView design={sim.design} shot={shot} />
            </Suspense>
          </ViewBoundary>
        </div>
      ) : (
        island
      )}
      <Hud sim={sim} />
      {launched && webgl && <ViewToggle />}
      <Countdown />
      {sim.pendingDecision && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
          <div className="w-[min(100%,560px)]">
            <EventCard />
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-3 bottom-10 flex flex-col items-center gap-2">
        <div className="pointer-events-auto w-[min(100%,520px)]">
          <FlightControls compact />
        </div>
      </div>
    </>
  )
}
