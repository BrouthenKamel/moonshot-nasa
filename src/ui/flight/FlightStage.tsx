import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getGroundStationById } from '../../data/ground'
import { getOrbitById } from '../../data/orbits'
import { getPartById } from '../../data/parts'
import { canUseWebGL } from '../../scene/webgl'
import { isSimComplete } from '../../sim/simulate'
import type { SimState, TurnLog } from '../../sim/types'
import { LAUNCH, useUiStore, type FlightCamMode } from '../../state/uiStore'
import { flightShot, type FlightShot } from '../../viz/flight/flightDirector'
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

function pipStatus(log: TurnLog): 'failed' | 'anomaly' | 'milestone' | 'clean' {
  if (log.phase === 'failed' || log.notes.some((n) => /lost contact|ran out|not enough|closed/i.test(n))) return 'failed'
  if (log.events.length > 0) return 'anomaly'
  if (log.notes.some((n) => /^(Launched|Capture burn successful|All requirements met|Primary mission done)/.test(n))) return 'milestone'
  return 'clean'
}

const PIP_STYLE: Record<ReturnType<typeof pipStatus>, string> = {
  clean: 'bg-emerald-400/80 shadow-[0_0_6px_rgba(52,211,153,0.55)]',
  milestone: 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.95)] ring-1 ring-white/60',
  anomaly: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
  failed: 'bg-rose-500 shadow-[0_0_9px_rgba(244,63,94,0.95)]',
}

function MissionPhaseTimeline({ sim }: { sim: SimState }) {
  const [hoveredTurn, setHoveredTurn] = useState<number | null>(null)
  const f = sim.flight
  const launched = f.launchedTurn !== null
  const isLaunchTurn = launched && sim.currentTurn === f.launchedTurn
  const isCaptureTurn = f.captured && sim.currentTurn === f.captureTurn
  const extendedActive =
    f.captured && (f.scienceTurns > 12 || sim.turnLogs.some((l) => l.notes.some((n) => /extended mission begins/i.test(n))))
  const complete = isSimComplete(sim)

  const stages: { label: string; state: 'done' | 'active' | 'upcoming' }[] = [
    { label: 'Build & Test', state: launched ? 'done' : complete ? 'upcoming' : 'active' },
    {
      label: `Launch M${f.launchedTurn ?? f.launchTurn}`,
      state: launched ? (isLaunchTurn && !complete ? 'active' : 'done') : !complete && sim.phase === 'wait' ? 'active' : 'upcoming',
    },
    { label: 'Transfer', state: f.captured ? 'done' : launched && !isLaunchTurn && !complete ? 'active' : 'upcoming' },
    { label: 'Capture', state: f.captured ? (isCaptureTurn && !complete ? 'active' : 'done') : sim.phase === 'capture' ? 'active' : 'upcoming' },
    { label: '12m Science', state: f.scienceTurns >= 12 ? 'done' : f.captured && !isCaptureTurn && !complete ? 'active' : 'upcoming' },
    { label: 'Extended', state: extendedActive ? (complete ? 'done' : 'active') : 'upcoming' },
  ]

  const hoveredLog = hoveredTurn !== null ? sim.turnLogs.find((l) => l.turn === hoveredTurn) : undefined

  return (
    <div className="hud-panel pointer-events-auto relative rounded-xl px-3 py-1.5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
          {stages.map((st, idx) => (
            <span key={st.label} className="inline-flex items-center gap-1">
              {idx > 0 && <span className="text-slate-600" aria-hidden="true">→</span>}
              <span
                className={`rounded-md px-1.5 py-0.5 transition ${
                  st.state === 'active'
                    ? 'bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/50'
                    : st.state === 'done'
                      ? 'text-emerald-300'
                      : 'text-slate-500'
                }`}
              >
                {st.label}
              </span>
            </span>
          ))}
        </div>
        {sim.turnLogs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" aria-label="Monthly mission timeline">
            {sim.turnLogs.map((log) => {
              const status = pipStatus(log)
              const noteText = log.notes.join(' ') || log.phase
              return (
                <button
                  key={log.turn}
                  type="button"
                  title={`Month ${log.turn}: ${noteText}`}
                  aria-label={`Month ${log.turn}: ${noteText}`}
                  onMouseEnter={() => setHoveredTurn(log.turn)}
                  onMouseLeave={() => setHoveredTurn((cur) => (cur === log.turn ? null : cur))}
                  onFocus={() => setHoveredTurn(log.turn)}
                  onBlur={() => setHoveredTurn((cur) => (cur === log.turn ? null : cur))}
                  className={`h-2.5 w-2.5 rounded-full transition hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${PIP_STYLE[status]}`}
                />
              )
            })}
          </div>
        )}
      </div>
      {hoveredLog && (
        <div className="mt-1 border-t border-white/10 pt-1 font-mono text-[10px] text-slate-200">
          <span className="font-bold text-sky-300">M{hoveredLog.turn}</span> · {hoveredLog.notes.join(' ') || hoveredLog.phase}
        </div>
      )}
    </div>
  )
}

interface FlightAlert {
  key: string
  tone: 'amber' | 'rose' | 'emerald'
  title: string
  impact: string
  cause: string
}

function latestFlightAlert(sim: SimState): FlightAlert | null {
  const log = sim.turnLogs[sim.turnLogs.length - 1]
  if (!log) return null

  const orbitalPriority = ['instrument-degrades', 'long-eclipse', 'radiation-reset', 'station-outage'] as const
  const ev = orbitalPriority.map((id) => log.events.find((e) => e.eventId === id)).find(Boolean)
  if (ev) {
    if (ev.eventId === 'radiation-reset') {
      const radHard = sim.design.computer === 'computer-redundant'
      return {
        key: `${log.turn}-radiation-reset`,
        tone: 'amber',
        title: 'Radiation Reset',
        impact: 'Safe mode · 0 MB science recorded this month',
        cause: radHard
          ? 'Radiation-Hard Redundant Computer cut reset risk by 70%, though a rare particle hit still occurred.'
          : 'Basic Flight Computer runs at 1x reset risk. Radiation-Hard Computer cuts resets by 70%.',
      }
    }
    if (ev.eventId === 'long-eclipse') {
      const bat = getPartById(sim.design.battery)?.name ?? 'Battery'
      return {
        key: `${log.turn}-long-eclipse`,
        tone: 'amber',
        title: 'Long Eclipse Drain',
        impact: 'Battery drained in Earth shadow · 0 MB science this month',
        cause: `${bat} lacked 3h survival margin. The Large Battery Pack (80 Wh) rides out long eclipses.`,
      }
    }
    if (ev.eventId === 'instrument-degrades') {
      const t = sim.flight.testTurns
      return {
        key: `${log.turn}-instrument-degrades`,
        tone: 'rose',
        title: 'Instrument Degradation',
        impact: `Science sensitivity -20% · now at ${Math.round(sim.flight.scienceFactor * 100)}% output`,
        cause:
          t < 2
            ? `Flown with ${t} test month${t === 1 ? '' : 's'} (x${sim.flight.testFactor} failure odds). 2+ test months lower aging risk.`
            : `${t} test months reduced odds, though deep-space radiation still aged the detector.`,
      }
    }
    if (ev.eventId === 'station-outage') {
      const station = getGroundStationById(sim.design.groundStation)?.name ?? 'Ground station'
      return {
        key: `${log.turn}-station-outage`,
        tone: 'amber',
        title: 'Ground Station Outage',
        impact: `Contact time halved · ${log.dataSent.toFixed(0)} MB downlinked this month`,
        cause: `${station} dropped offline mid-month. Deep Space Network cuts outage odds to 2%.`,
      }
    }
  }

  if (log.notes.some((n) => n.startsWith('Capture burn successful'))) {
    const orbitName = getOrbitById(sim.design.orbit)?.name ?? 'science orbit'
    const propName = getPartById(sim.design.propulsion)?.name.replace(/\s*\(.*\)/, '') ?? 'Propulsion'
    return {
      key: `${log.turn}-capture`,
      tone: 'emerald',
      title: 'Capture Burn Complete',
      impact: `Entered ${orbitName} · ${Math.max(0, sim.flight.dvLeft).toFixed(0)} m/s delta-v remaining`,
      cause: `${propName} completed lunar orbit insertion.`,
    }
  }
  if (log.notes.some((n) => n.startsWith('All requirements met'))) {
    return {
      key: `${log.turn}-complete`,
      tone: 'emerald',
      title: 'All Requirements Met',
      impact: `${sim.flight.coverage.toFixed(1)}% ice mapped · ${sim.flight.data.toFixed(0)} MB science home`,
      cause: 'Spacecraft, polar orbit, and downlink architecture satisfied every brief requirement.',
    }
  }
  if (log.notes.some((n) => n.startsWith('Primary mission done'))) {
    return {
      key: `${log.turn}-extended`,
      tone: 'amber',
      title: 'Primary 12-Month Ops Complete',
      impact: `${sim.flight.coverage.toFixed(1)}% ice mapped · ${sim.flight.data.toFixed(0)} MB home — extending ops`,
      cause: 'Targets not yet met at month 12; extending science operations while fuel and budget remain.',
    }
  }
  return null
}

const ALERT_TONE: Record<FlightAlert['tone'], string> = {
  amber: 'border-amber-400/50 border-l-amber-400 text-amber-100',
  rose: 'border-rose-400/50 border-l-rose-500 text-rose-100',
  emerald: 'border-emerald-400/50 border-l-emerald-400 text-emerald-100',
}

function FlightAlertBanner({ sim }: { sim: SimState }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const alert = useMemo(() => latestFlightAlert(sim), [sim])
  if (!alert || dismissedKey === alert.key) return null

  return (
    <div
      role="status"
      className={`hud-panel pointer-events-auto w-[min(100%,340px)] rounded-xl border-l-4 p-2.5 text-xs shadow-xl ${ALERT_TONE[alert.tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] font-bold uppercase tracking-wider opacity-85">Live Orbital Telemetry</div>
          <div className="font-display text-sm font-bold text-white">{alert.title}</div>
        </div>
        <button
          type="button"
          onClick={() => setDismissedKey(alert.key)}
          aria-label="Dismiss telemetry alert"
          className="rounded px-1.5 py-0.5 text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="mt-1 font-mono text-[11px] font-semibold tabular-nums text-white">{alert.impact}</div>
      <div className="mt-1 text-[11px] leading-snug text-slate-300">{alert.cause}</div>
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

/** The three space-view cameras on the base */
const CAMERAS: [FlightCamMode, string][] = [
  ['overview', 'Overview'],
  ['moon', 'Moon'],
  ['earth', 'Earth'],
]

/** Over the space view: back to the agency, the three cameras, and where the craft is */
function SpaceBar({ sim, shot, monthFraction }: { sim: SimState; shot: FlightShot; monthFraction: number }) {
  const setView = useUiStore((s) => s.setFlightView)
  const camera = useUiStore((s) => s.flightCam)
  const setCamera = useUiStore((s) => s.setFlightCam)
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
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
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
              onClick={() => setCamera(id)}
              className={`rounded-full px-3.5 py-1.5 ${camera === id ? 'bg-orange-500' : 'text-slate-300 hover:bg-white/10'}`}
            >
              {name}
            </button>
          ))}
        </div>
        {caption && <div className={`${pill} px-3 py-1 text-xs tabular-nums text-slate-200`}>{caption}</div>}
        <div className="text-[10px] text-white/60 drop-shadow">Drag to look around · scroll to zoom</div>
      </div>
      {/* Keeps the camera switch centred */}
      <div className="invisible px-4 py-2 font-display text-sm font-bold" aria-hidden>
        ← Back to agency
      </div>
    </div>
  )
}

/**
 * The flight in the base's centre panel: before launch the island (the craft is built in the
 * Factory), the launch on the island's pad, then the space view.
 * Space view: the scene, its cameras and Back to agency, nothing else.
 * Agency view: the island, with the phase timeline and the latest telemetry alert between the side panels.
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
  // Between the side panels on wide screens (agency view): left panel 18rem, right panel 20rem
  const between = 'lg:left-[19.5rem] lg:right-[21.5rem]'

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
      {showSpace ? (
        <SpaceBar sim={sim} shot={shot} monthFraction={monthFraction} />
      ) : (
        <div className={`pointer-events-none absolute inset-x-3 ${between} top-3 z-10 flex flex-col items-center gap-2`}>
          <MissionPhaseTimeline sim={sim} />
          <FlightAlertBanner sim={sim} />
        </div>
      )}
      <Countdown />
      {sim.pendingDecision && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
          <div className="w-[min(100%,560px)]">
            <EventCard />
          </div>
        </div>
      )}
      <div className={`pointer-events-none absolute inset-x-3 ${showSpace ? '' : between} bottom-10 z-10 flex flex-col items-center gap-2`}>
        <div className="pointer-events-auto w-[min(100%,540px)]">
          <FlightControls compact />
        </div>
      </div>
    </>
  )
}
