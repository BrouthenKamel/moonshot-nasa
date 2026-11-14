import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { canUseWebGL } from '../../scene/webgl'
import { isSimComplete } from '../../sim/simulate'
import type { SimState } from '../../sim/types'
import { LAUNCH, useUiStore } from '../../state/uiStore'
import { flightShot, type FlightShot } from '../../viz/flight/flightDirector'
import type { SpaceView } from '../../scene/flight/FlightView'
import { useWorldStore } from '../../state/worldStore'
import { DAYS_PER_TURN } from '../../game/world'
import { EventCard } from './EventCard'
import { FlightControls } from './FlightControls'

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

/**
 * Switch between the space view and the agency island, once the craft has launched.
 * Shown in the base's mission panel, not over the view.
 */
export function FlightViewToggle({ sim }: { sim: SimState }) {
  const view = useUiStore((s) => s.flightView)
  const setView = useUiStore((s) => s.setFlightView)
  const launching = useUiStore((s) => s.launchAt !== null)
  const webgl = useMemo(() => canUseWebGL(), [])
  if (launching || !webgl || sim.flight.launchedTurn === null) return null
  return (
    <div className="flex rounded-full border border-white/15 bg-white/5 p-0.5 text-xs font-semibold text-white" role="radiogroup" aria-label="View">
      {(['space', 'island'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => setView(v)}
          className={`flex-1 rounded-full px-3 py-1 ${view === v ? 'bg-orange-500' : 'text-slate-300 hover:bg-white/10'}`}
        >
          {v === 'space' ? 'Space' : 'Agency'}
        </button>
      ))}
    </div>
  )
}

/** True while the space view fills the base (launched, launch animation over, Space chosen) */
export function useSpaceShowing(sim: SimState | null): boolean {
  const view = useUiStore((s) => s.flightView)
  const launchAt = useUiStore((s) => s.launchAt)
  const webgl = useMemo(() => canUseWebGL(), [])
  return !!sim && webgl && sim.flight.launchedTurn !== null && launchAt === null && view === 'space'
}

/** How far the agency clock is into the flight's next month, 0..1 (in steps of 1%, so it re-renders gently) */
function useMonthFraction(sim: SimState): number {
  return useWorldStore((s) => {
    if (!s.mission || s.mission.seed !== sim.seed || isSimComplete(sim)) return 0
    const into = (s.day - (s.mission.approvedDay + sim.currentTurn * DAYS_PER_TURN)) / DAYS_PER_TURN
    return Math.round(Math.min(0.99, Math.max(0, into)) * 100) / 100
  })
}

const CAMERAS: [SpaceView, string][] = [
  ['overview', 'Overview'],
  ['moon', 'Moon'],
  ['earth', 'Earth'],
]

/** Over the space view: back to the agency, the three camera views, and where the craft is */
function SpaceBar({
  sim,
  shot,
  monthFraction,
  camera,
  onCamera,
}: {
  sim: SimState
  shot: FlightShot
  monthFraction: number
  camera: SpaceView
  onCamera: (v: SpaceView) => void
}) {
  const setView = useUiStore((s) => s.setFlightView)
  const left = sim.flight.transferLeft
  const daysToGo = typeof left === 'number' ? Math.max(0, Math.round((left - monthFraction) * DAYS_PER_TURN)) : null
  const caption =
    shot.stage === 'transfer'
      ? `On the way to the Moon · ${Math.round(shot.transferT * 100)}%${daysToGo !== null ? ` · about ${daysToGo} days to go` : ''}`
      : shot.stage === 'orbit'
        ? `In lunar orbit · ice ${Math.round(shot.coverage * 100)}% mapped`
        : ''
  const pill = 'rounded-full border border-white/15 bg-[#0b1226]/75 text-white shadow-lg backdrop-blur-md'
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
      <button
        type="button"
        onClick={() => setView('island')}
        className={`${pill} pointer-events-auto px-4 py-2 font-display text-sm font-bold hover:bg-orange-500`}
      >
        ← Back to agency
      </button>
      <div className="flex flex-col items-center gap-2">
        <div className={`${pill} pointer-events-auto flex p-1 text-xs font-semibold`} role="radiogroup" aria-label="Camera">
          {CAMERAS.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={camera === id}
              onClick={() => onCamera(id)}
              className={`rounded-full px-3.5 py-1.5 ${camera === id ? 'bg-orange-500' : 'text-slate-300 hover:bg-white/10'}`}
            >
              {name}
            </button>
          ))}
        </div>
        {caption && <div className={`${pill} px-3 py-1 text-xs tabular-nums text-slate-200`}>{caption}</div>}
      </div>
      {/* Keeps the camera switch centred */}
      <div className="invisible px-4 py-2 font-display text-sm font-bold" aria-hidden>
        ← Back to agency
      </div>
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
  const launchAt = useUiStore((s) => s.launchAt)
  const startLaunch = useUiStore((s) => s.startLaunch)
  const endLaunch = useUiStore((s) => s.endLaunch)
  const launched = sim.flight.launchedTurn !== null

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
  const monthFraction = useMonthFraction(sim)
  const shot = useMemo(
    () => flightShot(sim.design, sim.turnLogs, sim.turnLogs.length - 1, { terminal, transferLeft: sim.flight.transferLeft, monthFraction }),
    [sim, terminal, monthFraction],
  )
  const showSpace = useSpaceShowing(sim)
  const [camera, setCamera] = useState<SpaceView>('overview')

  return (
    <>
      {showSpace ? (
        <div className="absolute inset-0 bg-black">
          <ViewBoundary fallback={island}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Pointing the telescope…</div>}>
              <FlightView design={sim.design} shot={shot} view={camera} />
            </Suspense>
          </ViewBoundary>
        </div>
      ) : (
        island
      )}
      {showSpace && <SpaceBar sim={sim} shot={shot} monthFraction={monthFraction} camera={camera} onCamera={setCamera} />}
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
