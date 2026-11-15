import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { difficultyPresets } from '../../data/brief'
import { getGroundStationById } from '../../data/ground'
import { getOrbitById } from '../../data/orbits'
import { getPartById } from '../../data/parts'
import { canUseWebGL } from '../../scene/webgl'
import { computeBudgets } from '../../sim/budgets'
import { COVERAGE_TARGET } from '../../sim/evaluate'
import { isSimComplete } from '../../sim/simulate'
import { craftWasLost, failedLabel } from '../../sim/evaluate'
import type { SimState, TurnLog } from '../../sim/types'
import { LAUNCH, useUiStore, type FlightCamMode } from '../../state/uiStore'
import { flightShot, type FlightShot } from '../../viz/flight/flightDirector'
import type { FlightTimeline } from '../../scene/flight/FlightView'
import { useWorldStore } from '../../state/worldStore'
import { DAYS_PER_TURN } from '../../game/world'
import { audio } from '../../assets/audio'
import { prefersReducedMotion, useGraphics } from '../../scene/space/quality'
import { Eng, Flap, Sheet } from '../kit'
import { EventCard } from './EventCard'
import { FlightControls } from './FlightControls'
import { FirstMappingPass } from '../../minigames/iceMapper'

const FlightView = lazy(() => import('../../scene/flight/FlightView').then((m) => ({ default: m.FlightView })))
const LaunchDayGame = lazy(() => import('../../minigames/launchDay').then((m) => ({ default: m.LaunchDayGame })))

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

/** A flown month's tick on the strip: a hairline, taller and status-tinted when something happened */
const TICK_STYLE: Record<ReturnType<typeof pipStatus>, string> = {
  clean: 'h-2 w-px bg-paper-dim',
  milestone: 'h-3 w-px bg-paper',
  anomaly: 'h-3 w-0.5 bg-caution',
  failed: 'h-3 w-0.5 bg-nogo',
}

const PHASE_WORD: Record<SimState['phase'], string> = {
  build: 'Building',
  test: 'Testing',
  wait: 'On the pad',
  transfer: 'To the Moon',
  capture: 'Capture',
  orbit: 'Mapping',
  complete: 'Mission over',
  failed: 'Failed',
}

type SegState = 'done' | 'active' | 'upcoming'
interface Segment {
  label: string
  state: SegState
  /** First and last month of the segment, inclusive; last < first means no months */
  first: number
  last: number
}

/** One word for how the craft is doing */
function health(sim: SimState): { word: string; tone: 'go' | 'caution' | 'nogo' } {
  const f = sim.flight
  if (sim.phase === 'failed' || !f.alive) return { word: craftWasLost(f.end) ? 'Lost' : 'Stopped', tone: 'nogo' }
  const last = sim.turnLogs[sim.turnLogs.length - 1]
  if (f.reserve < 0 || (f.launchedTurn !== null && f.dvLeft <= 0)) return { word: 'Strained', tone: 'nogo' }
  if ((last && last.events.length > 0) || f.scienceFactor < 1) return { word: 'Watch', tone: 'caution' }
  return { word: 'Nominal', tone: 'go' }
}

const TONE_TEXT = { go: 'text-go', caution: 'text-caution', nogo: 'text-nogo' } as const

/** A ruled readout: label, a split-flap value, and an optional hairline scale with a target tick */
function Readout({
  label,
  value,
  className = 'text-paper',
  scale,
}: {
  label: string
  value: string
  className?: string
  scale?: { value: number; limit: number; target?: number; color: string }
}) {
  const pct = (n: number) => (scale && scale.limit > 0 ? Math.max(0, Math.min(1, n / scale.limit)) * 100 : 0)
  return (
    <div className="min-w-0">
      <div className="fp-label truncate text-[0.62rem] leading-none">{label}</div>
      <Flap value={value} className={`mt-1 block truncate text-sm font-semibold leading-none ${className}`} />
      {scale && (
        <div className="relative mt-1 h-2" aria-hidden="true">
          <div className="absolute inset-x-0 top-1 h-px bg-rule-strong" />
          <div className="absolute top-[3px] h-[3px]" style={{ left: 0, width: `${pct(scale.value)}%`, background: scale.color }} />
          {scale.target != null && <div className="absolute top-0 h-2 w-px bg-paper-dim" style={{ left: `${pct(scale.target)}%` }} />}
        </div>
      )}
    </div>
  )
}

/**
 * The flight plan as a ruled strip: phases as labelled segments, a tick per month (flown months
 * tinted by what happened), the current month in Kapton; under it the readouts.
 */
function MissionPhaseTimeline({ sim }: { sim: SimState }) {
  const [hoveredTurn, setHoveredTurn] = useState<number | null>(null)
  const budgets = useMemo(() => computeBudgets(sim.design, sim.difficulty), [sim.design, sim.difficulty])
  const logByTurn = useMemo(() => new Map(sim.turnLogs.map((l) => [l.turn, l])), [sim.turnLogs])
  const f = sim.flight
  const launched = f.launchedTurn !== null
  const isLaunchTurn = launched && sim.currentTurn === f.launchedTurn
  const isCaptureTurn = f.captured && sim.currentTurn === f.captureTurn
  const extendedActive =
    f.captured && (f.scienceTurns > 12 || sim.turnLogs.some((l) => l.notes.some((n) => /extended mission begins/i.test(n))))
  const complete = isSimComplete(sim)

  // Month boundaries: what happened where it has, the plan where it has not yet
  const L = Math.max(1, f.launchedTurn ?? f.launchTurn)
  const C = Math.max(L + 1, f.captureTurn ?? budgets.arrivalTurn ?? L + 1)
  const lastLogged = sim.turnLogs[sim.turnLogs.length - 1]?.turn ?? 0
  const E = Math.max(C + 14, sim.currentTurn, lastLogged)

  const segments: Segment[] = [
    { label: 'Build & Test', first: 1, last: L - 1, state: launched ? 'done' : complete ? 'upcoming' : 'active' },
    {
      label: `Launch M${L}`,
      first: L,
      last: L,
      state: launched ? (isLaunchTurn && !complete ? 'active' : 'done') : !complete && sim.phase === 'wait' ? 'active' : 'upcoming',
    },
    { label: 'Transfer', first: L + 1, last: C - 1, state: f.captured ? 'done' : launched && !isLaunchTurn && !complete ? 'active' : 'upcoming' },
    { label: 'Capture', first: C, last: C, state: f.captured ? (isCaptureTurn && !complete ? 'active' : 'done') : sim.phase === 'capture' ? 'active' : 'upcoming' },
    {
      label: '12m Science',
      first: C + 1,
      last: C + 12,
      state: f.scienceTurns >= 12 ? 'done' : f.captured && !isCaptureTurn && !complete ? 'active' : 'upcoming',
    },
    { label: 'Extended', first: C + 13, last: E, state: extendedActive ? (complete ? 'done' : 'active') : 'upcoming' },
  ]

  const hoveredLog = hoveredTurn !== null ? logByTurn.get(hoveredTurn) : undefined
  const dataTarget = difficultyPresets[sim.difficulty]?.dataTarget ?? 300
  const h = health(sim)
  const ice = sim.coveragePercent
  const dataHome = sim.totalDataReturned

  return (
    <Sheet tone="raised" className="pointer-events-auto w-full max-w-[46rem] px-3 pb-2 pt-1.5 text-paper">
      <div className="flex items-baseline justify-between gap-3">
        <span className="fp-label text-[0.62rem]">Flight plan</span>
        <span className="fp-data text-[11px] text-kapton">
          MONTH <Flap value={String(sim.currentTurn).padStart(2, '0')} />
        </span>
      </div>
      <div className="mt-1 flex items-stretch" aria-label="Monthly mission timeline">
        {segments.map((seg) => {
          const months = Math.max(0, seg.last - seg.first + 1)
          const list = Array.from({ length: months }, (_, k) => seg.first + k)
          return (
            <div
              key={seg.label}
              className="border-l border-rule-strong pl-1 first:border-l-0 first:pl-0"
              style={{ flexGrow: Math.max(months, 1), flexBasis: 0 }}
              data-state={seg.state}
            >
              <div
                className={`fp-label whitespace-nowrap pr-1 text-[0.6rem] leading-none ${
                  seg.state === 'active' ? 'text-kapton' : seg.state === 'done' ? 'text-paper-dim' : 'text-paper-faint'
                }`}
              >
                {seg.label}
              </div>
              <div className={`relative mt-1 h-4 border-t ${seg.state === 'active' ? 'border-kapton' : 'border-rule-strong'}`}>
                {list.map((m, k) => {
                  const log = logByTurn.get(m)
                  const left = `${((k + 0.5) / months) * 100}%`
                  const now = m === sim.currentTurn
                  if (!log) {
                    return <span key={m} aria-hidden="true" className="absolute top-0 h-1.5 w-px bg-rule-strong" style={{ left }} />
                  }
                  const status = pipStatus(log)
                  const noteText = log.notes.join(' ') || log.phase
                  return (
                    <button
                      key={m}
                      type="button"
                      title={`Month ${log.turn}: ${noteText}`}
                      aria-label={`Month ${log.turn}: ${noteText}`}
                      onMouseEnter={() => setHoveredTurn(log.turn)}
                      onMouseLeave={() => setHoveredTurn((cur) => (cur === log.turn ? null : cur))}
                      onFocus={() => setHoveredTurn(log.turn)}
                      onBlur={() => setHoveredTurn((cur) => (cur === log.turn ? null : cur))}
                      className="absolute -top-px flex h-4 w-2 -translate-x-1/2 justify-center focus-visible:outline focus-visible:outline-1 focus-visible:outline-paper"
                      style={{ left }}
                    >
                      <span className={now ? 'h-4 w-[3px] bg-kapton' : TICK_STYLE[status]} />
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="h-4 truncate border-b border-rule fp-data text-[10px] leading-4 text-paper-dim">
        {hoveredLog ? (
          <>
            <span className="text-kapton">MONTH {hoveredLog.turn}</span> · {hoveredLog.notes.join(' ') || hoveredLog.phase}
          </>
        ) : (
          <span className="text-paper-faint">Point at a month for its log entry</span>
        )}
      </div>

      <div className="mt-1.5 grid grid-cols-4 gap-x-4">
        <Readout label="Phase" value={sim.phase === 'failed' ? failedLabel(sim.flight.end) : (PHASE_WORD[sim.phase] ?? sim.phase)} />
        <Readout
          label="Ice mapped"
          value={`${ice.toFixed(1)}%`}
          className="text-ice"
          scale={{ value: ice, limit: 100, target: 70, color: 'var(--color-ice)' }}
        />
        <Readout
          label="Data home"
          value={`${Math.round(dataHome)} MB`}
          scale={{ value: dataHome, limit: Math.max(dataTarget * 1.25, dataHome), target: dataTarget, color: 'var(--color-paper-dim)' }}
        />
        <Readout label="Health" value={h.word} className={TONE_TEXT[h.tone]} />
      </div>
      <Eng as="div" className="mt-1.5 grid grid-cols-4 gap-x-4 border-t border-rule pt-1.5">
        <Readout
          label="Δv left"
          value={`${Math.max(0, f.dvLeft).toFixed(0)} m/s`}
          className={launched && f.dvLeft < budgets.deltaVStationKeeping * 2 ? 'text-caution' : 'text-paper'}
        />
        <Readout label="Main budget" value={`$${f.main.toFixed(1)}M`} />
        <Readout label="Reserve" value={`$${f.reserve.toFixed(2)}M`} className={f.reserve < 0 ? 'text-nogo' : 'text-paper'} />
        <Readout label="Science" value={`${Math.round(f.scienceFactor * 100)}% · ${Math.round(f.science.stored)} MB aboard`} />
      </Eng>
    </Sheet>
  )
}

interface FlightAlert {
  key: string
  tone: 'caution' | 'nogo' | 'go'
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
        tone: 'caution',
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
        tone: 'caution',
        title: 'Long Eclipse Drain',
        impact: 'Battery drained in Earth shadow · 0 MB science this month',
        cause: `${bat} lacked 3h survival margin. The Large Battery Pack (80 Wh) rides out long eclipses.`,
      }
    }
    if (ev.eventId === 'instrument-degrades') {
      const t = sim.flight.testTurns
      return {
        key: `${log.turn}-instrument-degrades`,
        tone: 'nogo',
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
        tone: 'caution',
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
      tone: 'go',
      title: 'Capture Burn Complete',
      impact: `Entered ${orbitName} · ${Math.max(0, sim.flight.dvLeft).toFixed(0)} m/s delta-v remaining`,
      cause: `${propName} completed lunar orbit insertion.`,
    }
  }
  if (log.notes.some((n) => n.startsWith('All requirements met'))) {
    return {
      key: `${log.turn}-complete`,
      tone: 'go',
      title: 'All Requirements Met',
      impact: `${sim.flight.coverage.toFixed(1)}% ice mapped · ${sim.flight.data.toFixed(0)} MB science home`,
      cause: 'Spacecraft, polar orbit, and downlink architecture satisfied every brief requirement.',
    }
  }
  if (log.notes.some((n) => n.startsWith('Primary mission done'))) {
    return {
      key: `${log.turn}-extended`,
      tone: 'caution',
      title: 'Primary 12-Month Ops Complete',
      impact: `${sim.flight.coverage.toFixed(1)}% ice mapped · ${sim.flight.data.toFixed(0)} MB home — extending ops`,
      cause: 'Targets not yet met at month 12; extending science operations while fuel and budget remain.',
    }
  }
  return null
}

const ALERT_RULE: Record<FlightAlert['tone'], string> = {
  caution: 'border-l-caution',
  nogo: 'border-l-nogo',
  go: 'border-l-go',
}
const ALERT_TEXT: Record<FlightAlert['tone'], string> = {
  caution: 'text-caution',
  nogo: 'text-nogo',
  go: 'text-go',
}

/** The latest telemetry as a ruled slip, its left rule in the status colour */
function FlightAlertBanner({ sim }: { sim: SimState }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const alert = useMemo(() => latestFlightAlert(sim), [sim])
  if (!alert || dismissedKey === alert.key) return null

  return (
    <div
      role="status"
      className={`fp-sheet pointer-events-auto w-[min(100%,360px)] border-l-[3px] px-3 py-2 text-xs ${ALERT_RULE[alert.tone]}`}
      data-tone="raised"
    >
      <div className="flex items-start justify-between gap-2 border-b border-rule pb-1">
        <div className="min-w-0">
          <div className={`fp-label text-[0.62rem] ${ALERT_TEXT[alert.tone]}`}>Live orbital telemetry</div>
          <div className="fp-display text-sm text-paper">{alert.title}</div>
        </div>
        <button
          type="button"
          onClick={() => setDismissedKey(alert.key)}
          aria-label="Dismiss telemetry alert"
          className="fp-btn-ghost px-1.5 py-0.5"
        >
          ✕
        </button>
      </div>
      <div className="mt-1 fp-data text-[11px] text-paper">{alert.impact}</div>
      <div className="mt-1 text-[11px] leading-snug text-paper-dim">{alert.cause}</div>
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
  return <div ref={ref} className="fp-display pointer-events-none absolute inset-x-0 top-[18%] text-center text-7xl tracking-widest text-paper" />
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
 * The space view's clock: the agency day, read live, and the transfer's launch and arrival days,
 * so the Moon, Earth and the craft move with the mission's days. Undefined before the agency
 * has booked this flight.
 */
function useFlightTimeline(sim: SimState): FlightTimeline | undefined {
  const approvedDay = useWorldStore((s) => (s.mission && s.mission.seed === sim.seed ? s.mission.approvedDay : null))
  const f = sim.flight
  return useMemo(() => {
    if (approvedDay === null || f.launchedTurn === null) return undefined
    const months = f.captureTurn !== null ? f.captureTurn - f.launchedTurn : sim.currentTurn - f.launchedTurn + (f.transferLeft ?? 0)
    const launchDay = approvedDay + f.launchedTurn * DAYS_PER_TURN
    return {
      getDay: () => useWorldStore.getState().day,
      launchDay,
      arrivalDay: launchDay + Math.max(1, months) * DAYS_PER_TURN,
    }
  }, [approvedDay, f.launchedTurn, f.captureTurn, f.transferLeft, sim.currentTurn])
}

/** A segmented switch: flat ghost buttons on one hairline, the chosen one underlined in Kapton */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`flex border border-rule-strong bg-ink-1 ${className}`} role="radiogroup" aria-label={label}>
      {options.map(([id, name], i) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`fp-btn-ghost flex-1 justify-center rounded-none border-b-2 ${i > 0 ? 'border-l border-l-rule' : ''} ${
            value === id ? 'border-b-kapton text-paper' : 'border-b-transparent'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

const VIEWS = [
  ['space', 'Space'],
  ['island', 'Agency'],
] as const

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
  return <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
}

/** Watches lunar orbit capture burn phase for audio tension + subtle hairline burn indicator */
function CaptureBurnWatch({ phase }: { phase: SimState['phase'] }) {
  const { quality } = useGraphics()
  const reduced = prefersReducedMotion()
  const capturing = phase === 'capture'

  useEffect(() => {
    if (!capturing) return
    audio.play('sfx.burn')
    audio.play('sfx.capture')
    audio.duckMusic(true)
    return () => {
      audio.duckMusic(false)
    }
  }, [capturing])

  if (!capturing) return null
  const animatePulse = quality !== 'low' && !reduced
  return (
    <div data-testid="capture-burn" aria-live="polite" className="pointer-events-none absolute inset-0 z-[5]">
      {animatePulse && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse border border-kapton/40"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 66%, rgba(12, 16, 22, 0.36) 88%, rgba(244, 174, 64, 0.14) 100%)',
          }}
        />
      )}
      <div className="absolute inset-x-0 bottom-[5.25rem] flex justify-center">
        <div className="flex items-center gap-2 border border-kapton bg-ink-1/90 px-3 py-1 fp-label text-kapton">
          <span aria-hidden="true" className="h-1.5 w-1.5 bg-kapton" />
          <span>LOI capture burn · telemetry live</span>
        </div>
      </div>
    </div>
  )
}

function IceStrikeWatch({ coverage }: { coverage: number }) {
  const prev = useRef(coverage)
  useEffect(() => {
    if (prev.current === 0 && coverage > 0) {
      audio.say('voice.ice-first')
      audio.play('sfx.capture')
    } else if (prev.current < COVERAGE_TARGET && coverage >= COVERAGE_TARGET) {
      audio.say('voice.ice-70')
      audio.play('sfx.go')
    }
    prev.current = coverage
  }, [coverage])
  return null
}

/** The three space-view cameras on the base */
const CAMERAS: readonly (readonly [FlightCamMode, string])[] = [
  ['overview', 'CAM 1 · WIDE'],
  ['earth', 'CAM 2 · CRAFT'],
  ['moon', 'CAM 3 · MOON'],
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
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
      <button type="button" onClick={() => setView('island')} className="fp-btn-secondary pointer-events-auto bg-ink-1">
        ← Back to agency
      </button>
      <div className="flex flex-col items-center gap-1.5">
        <div
          data-testid="capcom-cams"
          data-active-cam={camera}
          className="pointer-events-auto flex items-center gap-2 border border-rule bg-ink-1/95 px-2 py-1"
        >
          <span
            aria-hidden="true"
            title="Live camera feed"
            className="h-2 w-2 shrink-0 border border-kapton bg-kapton"
          />
          <Segmented label="Camera" options={CAMERAS} value={camera} onChange={setCamera} className="min-w-[22rem]" />
        </div>
        {caption && (
          <div className="border border-rule bg-ink-1 px-3 py-1 fp-data text-xs text-paper">
            {shot.stage === 'orbit' ? (
              <>
                In lunar orbit · ice <span className="text-ice">{Math.round(shot.coverage * 100)}%</span> mapped
              </>
            ) : (
              caption
            )}
          </div>
        )}
        <div className="fp-label text-[0.6rem] text-paper-dim">Drag to look around · scroll to zoom</div>
      </div>
      {/* Keeps the camera switch centred */}
      <div className="fp-btn-secondary invisible" aria-hidden>
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
  // Launch Day: the player flies the ride to orbit once, when the core reports liftoff
  const [flyingLaunch, setFlyingLaunch] = useState(false)

  const wasLaunched = useRef(launched)
  useEffect(() => {
    if (launched && !wasLaunched.current) {
      startLaunch()
      setFlyingLaunch(true)
    }
    wasLaunched.current = launched
  }, [launched, startLaunch])
  // Nothing should strand the flight on the pad: if the game is not up, the countdown still ends on its own
  useEffect(() => {
    if (launchAt === null || flyingLaunch) return
    const id = window.setTimeout(endLaunch, Math.max(0, LAUNCH.durationS * 1000 - (performance.now() - launchAt)))
    return () => window.clearTimeout(id)
  }, [launchAt, endLaunch, flyingLaunch])

  const terminal = isSimComplete(sim) ? (sim.phase === 'failed' ? 'failed' : 'complete') : undefined
  const monthFraction = useMonthFraction(sim)
  const timeline = useFlightTimeline(sim)
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
        <div className="absolute inset-0 bg-ink-0">
          <ViewBoundary fallback={island}>
            <Suspense fallback={<div className="flex h-full items-center justify-center fp-label">Pointing the telescope…</div>}>
              <FlightView design={sim.design} shot={shot} timeline={timeline} />
            </Suspense>
          </ViewBoundary>
        </div>
      ) : (
        island
      )}
      <CaptureBurnWatch phase={sim.phase} />
      <IceStrikeWatch coverage={sim.coveragePercent} />
      <FirstMappingPass key={sim.seed} sim={sim} />
      {showSpace ? (
        <SpaceBar sim={sim} shot={shot} monthFraction={monthFraction} />
      ) : (
        <div className={`pointer-events-none absolute inset-x-3 ${between} top-3 z-10 flex flex-col items-center gap-2`}>
          <MissionPhaseTimeline sim={sim} />
          <FlightAlertBanner sim={sim} />
        </div>
      )}
      <Countdown />
      {/* The launch itself, played. Finishing it ends the launch, which opens the space view. */}
      {flyingLaunch && (
        <ViewBoundary fallback={null}>
          <Suspense fallback={null}>
            <LaunchDayGame
              design={sim.design}
              onDone={() => {
                setFlyingLaunch(false)
                endLaunch()
              }}
            />
          </Suspense>
        </ViewBoundary>
      )}
      {sim.pendingDecision && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-0/70 p-4">
          <div className="w-[min(100%,560px)]">
            <EventCard />
          </div>
        </div>
      )}
      <div className={`pointer-events-none absolute inset-x-3 ${showSpace ? '' : between} bottom-10 z-10 flex flex-col items-center gap-2`}>
        <div className="pointer-events-auto w-[min(100%,540px)]">
          <FlightControls compact monthPlan={false} />
        </div>
      </div>
    </>
  )
}
