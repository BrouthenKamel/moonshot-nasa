import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { useDesignPreview } from '../useDesignPreview'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { canUseWebGL } from '../../scene/webgl'
import { lunarOrbits } from '../../data/orbits'
import { OrbitCardTray } from './launch/OrbitCards'
import { playPick } from './launch/radioKeys'
import type { LapseClock } from '../../scene/OrbitView'
import {
  buildOrbitView,
  coverageAt,
  COVERAGE_GOAL,
  MISSION_MONTHS,
  type OrbitCheck,
  type OrbitOption,
  type Tone,
  upkeepLine,
} from '../../viz/orbit/orbitView'

const OrbitScene = lazy(() => import('../../scene/OrbitView').then((m) => ({ default: m.OrbitScene })))

const ACCENT = '#f97316' // Launch Site role colour
const LAPSE_MS = 14000
const HOLD_MS = 3500
const MIN_SCENE_WIDTH = 900
const MIN_SIDE_WIDTH = 1000
const READOUT_W = 290
const CARDS_MAX_W = 600
/** Below this width the orbit cards are not centred under the Moon, so they can stay wide enough */
const CARDS_CENTRED_MIN = 1200

const TONE_TEXT: Record<Tone, string> = { good: 'text-green-400', warn: 'text-amber-400', bad: 'text-red-400' }
const TONE_CHIP: Record<Tone, string> = {
  good: 'border-green-400/40 bg-green-500/15 text-green-400',
  warn: 'border-amber-400/40 bg-amber-500/15 text-amber-400',
  bad: 'border-red-400/45 bg-red-500/15 text-red-400',
}
const DOT: Record<OrbitCheck['status'], string> = { green: 'bg-green-400', yellow: 'bg-amber-400', red: 'bg-red-400' }
const PANEL = 'hud-panel backdrop-blur-md'

function hoveredChoiceId(target: EventTarget | null): string | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-choice-id]')?.dataset.choiceId ?? null : null
}

/* ------------------------------------------------------------------ */
/* Plain screen: used without 3D, in tests, and in narrow columns      */
/* ------------------------------------------------------------------ */

function CheckRows({ checks }: { checks: OrbitCheck[] }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.resource} className="text-xs leading-snug">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
            <span className="font-semibold text-slate-200">{c.resource}</span>
            <span className="sr-only">{c.status}</span>
          </div>
          {c.status !== 'green' && <p className="mt-0.5 pl-[18px] text-slate-400">{c.reason}</p>}
        </li>
      ))}
    </ul>
  )
}

function StepButtons({ overlay }: { overlay: boolean }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const back = (
    <button
      type="button"
      onClick={() => setDesignStep('spacecraft')}
      className="tactical-btn-back"
    >
      ← Back
    </button>
  )
  const next = (
    <button
      type="button"
      onClick={() => setDesignStep('ride')}
      className="tactical-btn-next"
    >
      Choose Ride →
    </button>
  )
  if (overlay)
    return (
      <>
        <div className="pointer-events-auto absolute top-3 left-3">{back}</div>
        <div className="pointer-events-auto absolute top-3 right-3">{next}</div>
      </>
    )
  return (
    <div className="flex justify-between">
      {back}
      {next}
    </div>
  )
}

function PlainOrbit() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const { budgets, previewBudgets } = useDesignPreview()
  const activeBudgets = previewBudgets ?? budgets
  const [scrubMonth, setScrubMonth] = useState(MISSION_MONTHS)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setScrubMonth((m) => (m >= MISSION_MONTHS ? 1 : m + 1))
    }, 850)
    return () => window.clearInterval(timer)
  }, [playing])

  const view = useMemo(() => buildOrbitView(design, difficulty), [design, difficulty])
  const instruments = design.instruments
    .map((id) => getPartById(id) as InstrumentPart | undefined)
    .filter((i): i is InstrumentPart => !!i)
  const scrubbedCoverage = Math.round(coverageAt(view.selected, scrubMonth))

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="hud-step-header">
          <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
            LAUNCH SITE · LUNAR ICE MAPPER · ORBIT
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">4. Orbit Selection</h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Only a polar orbit passes over the south pole. More and lower passes map faster, but the orbit costs more to
            reach and to hold. The ice instruments only work close to the surface.
          </p>
        </header>

        <div className="hud-panel border-[var(--role-border)] bg-[var(--role-surface)] p-4 text-sm">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--role-accent)]">
            This orbit with your design
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-4 font-mono text-xs tabular-nums text-orange-100">
            <div>
              Projected ice coverage in 12 clean months:{' '}
              <span className={activeBudgets.projectedCoverage >= COVERAGE_GOAL ? 'font-bold text-[#22d3ee]' : 'font-bold text-rose-400'}>
                {activeBudgets.projectedCoverage.toFixed(0)}%
              </span>{' '}
              (need {COVERAGE_GOAL}%)
            </div>
            <div>
              Instruments can run:{' '}
              <span className={activeBudgets.scienceDuty >= 1 ? 'font-bold text-emerald-400' : 'font-bold text-orange-300'}>
                {Math.round(activeBudgets.scienceDuty * 100)}% of the time
              </span>
            </div>
            <div>
              Eclipse needs <span className="text-orange-300">{activeBudgets.batteryNeedWh.toFixed(0)} Wh</span>; battery gives{' '}
              <span className={activeBudgets.batteryOk ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
                {activeBudgets.batteryUsableWh.toFixed(0)} Wh
              </span>
            </div>
            <div>
              {activeBudgets.captureDeltaV === null ? (
                <>
                  Holding the orbit: <span className="text-orange-300">{activeBudgets.deltaVStationKeeping} m/s a month</span>
                </>
              ) : (
                <span className={activeBudgets.upkeepTurns < MISSION_MONTHS ? 'text-rose-400' : undefined}>
                  {upkeepLine({ upkeepTurns: activeBudgets.upkeepTurns, holdDeltaV: activeBudgets.deltaVStationKeeping })}
                </span>
              )}
            </div>
          </div>
          {instruments.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-orange-100/80">
              {instruments.map((i) => (
                <li key={i.id}>
                  {i.name}: works at <span className="font-mono tabular-nums">{Math.round((activeBudgets.quality[i.id] ?? 0) * 100)}%</span> quality here
                  {!i.seesShadow && ' (cannot see into shadow: does not count as ice coverage)'}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hud-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="orbit-timelapse-plain" className="font-mono text-xs uppercase tracking-[0.18em] text-slate-300">
              Time-Lapse Scrubber · Month <span className="font-bold tabular-nums text-cyan-300">{scrubMonth}</span> / {MISSION_MONTHS}
            </label>
            <div className="flex items-center gap-3">
              <span className={`font-mono text-xs font-bold tabular-nums ${scrubbedCoverage >= COVERAGE_GOAL ? 'text-[#22d3ee]' : 'text-amber-300'}`}>
                {scrubbedCoverage}% mapped
              </span>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="rounded border border-slate-600/80 bg-slate-900 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-200 hover:border-slate-400"
              >
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
            </div>
          </div>
          <input
            id="orbit-timelapse-plain"
            type="range"
            min={1}
            max={MISSION_MONTHS}
            step={1}
            value={scrubMonth}
            onChange={(e) => {
              setPlaying(false)
              setScrubMonth(Number(e.target.value))
            }}
            className="tactical-range mt-2"
          />
          <div className="relative mt-2 h-2.5 overflow-hidden rounded bg-slate-950">
            <div
              className={`h-full transition-all duration-200 ${scrubbedCoverage >= COVERAGE_GOAL ? 'bg-[#22d3ee]' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, scrubbedCoverage)}%` }}
            />
            <div className="absolute inset-y-0 w-0.5 bg-[#22d3ee] shadow-[0_0_6px_#22d3ee]" style={{ left: `${COVERAGE_GOAL}%` }} />
          </div>
        </div>

        <div className="hud-panel p-4" aria-live="polite">
          <div className={`mb-2 font-mono text-sm font-bold tracking-wider ${TONE_TEXT[view.selected.verdict.tone]}`}>
            {view.selected.verdictCheck && (
              <span className="font-semibold text-slate-400">Worst check, {view.selected.verdictCheck}: </span>
            )}
            {view.selected.verdict.text}
          </div>
          <CheckRows checks={view.selected.checks} />
        </div>

        <SynergyStrip step="orbit" />
        <DesignDeltaLine />

        <div
          onMouseOver={(e) => {
            const id = hoveredChoiceId(e.target)
            setPreviewPatch(id ? { orbit: id } : null)
          }}
          onMouseLeave={() => setPreviewPatch(null)}
          onFocus={(e) => {
            const id = hoveredChoiceId(e.target)
            if (id) setPreviewPatch({ orbit: id })
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPreviewPatch(null)
          }}
        >
          <OrbitCardTray
            options={view.options}
            selectedId={view.selectedId}
            onPick={(id, fromKeyboard) => {
              if (fromKeyboard) playPick(id)
              if (id !== design.orbit) updateDesign({ orbit: id })
            }}
            full
          />
          <p className="mt-3 text-sm leading-snug text-slate-300">
            <b className="font-semibold" style={{ color: view.selected.color }}>
              {view.selected.shortName}.
            </b>{' '}
            {view.selected.description}
          </p>
        </div>

        <StepButtons overlay={false} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene overlays                                                       */
/* ------------------------------------------------------------------ */

function Bar({ pct, color, tick }: { pct: number; color: string; tick?: number }) {
  return (
    <div className="relative mt-1.5 h-2.5 rounded-full bg-slate-400/20">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      {tick !== undefined && <div className="absolute -inset-y-1 w-0.5 bg-slate-200" style={{ left: `${tick}%` }} />}
    </div>
  )
}

function Row({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="mt-3 text-xs">
      <div className="flex justify-between text-slate-400">
        <span>{label}</span>
        <b className="font-mono text-slate-100 tabular-nums">{value}</b>
      </div>
      {children}
    </div>
  )
}

function ReadoutPanel({ o, months }: { o: OrbitOption; months: number }) {
  const now = coverageAt(o, months)
  const final = coverageAt(o, MISSION_MONTHS)
  const numberColour = now >= COVERAGE_GOAL ? 'text-[#22d3ee]' : final <= 0 ? 'text-amber-400' : 'text-slate-100'
  const cap = o.captureDeltaV
  const fits = cap !== null && o.deltaVAvailable >= cap
  return (
    <div className={`${PANEL} pointer-events-auto absolute top-16 right-3 bottom-3 w-[290px] overflow-y-auto p-3.5`}>
      {o.verdictCheck && (
        <div aria-hidden="true" className="mb-1 text-center font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Worst check: {o.verdictCheck}
        </div>
      )}
      <div aria-live="polite" className={`rounded-lg border px-2.5 py-1.5 text-center font-mono text-[13px] font-bold tracking-wider ${TONE_CHIP[o.verdict.tone]}`}>
        {o.verdictCheck && <span className="sr-only">Worst check, {o.verdictCheck}: </span>}
        {o.verdict.text}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className={`font-mono text-[38px] leading-none font-extrabold tabular-nums ${numberColour}`}>{Math.round(now)}%</div>
        <div className="text-right font-mono text-xs leading-snug tabular-nums text-slate-400">
          of the polar ice mapped
          <br />
          {Math.round(final)}% after 12 months
        </div>
      </div>
      <Bar pct={now} color={now >= COVERAGE_GOAL ? '#22d3ee' : '#fb923c'} tick={COVERAGE_GOAL} />
      <div className="mt-1 text-right font-mono text-[11px] tabular-nums text-slate-500">goal {COVERAGE_GOAL}%</div>

      <div className="mt-1 rounded-lg border border-slate-700/60 bg-slate-900/60 p-2.5">
        <div className="mb-1.5 font-mono text-[11px] font-semibold tracking-widest" style={{ color: ACCENT }}>
          GO / NO-GO
        </div>
        <CheckRows checks={o.checks} />
      </div>

      <div className="mt-3 font-mono text-[11px] font-semibold tracking-widest" style={{ color: ACCENT }}>
        THIS ORBIT
      </div>
      <p className="mt-1 text-xs leading-snug text-slate-300">
        <b className="font-semibold" style={{ color: o.color }}>
          {o.shortName}.
        </b>{' '}
        {o.description}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">Flown by: {lunarOrbits.find((x) => x.id === o.id)?.flownBy}</p>

      <Row label="Passes over the pole" value={`${o.passesPerTurn} a month`}>
        <p className="mt-0.5 text-slate-500">{o.passesLine}</p>
      </Row>
      <div className="grid grid-cols-2 gap-x-3">
        <Row label="In sunlight" value={`${o.sunlitPct}%`}>
          <Bar pct={o.sunlitPct} color="#fbbf24" />
        </Row>
        <Row label="Earth in view" value={`${o.earthPct}%`}>
          <Bar pct={o.earthPct} color="#60a5fa" />
        </Row>
      </div>
      <p className={`mt-1 text-xs ${o.batteryOk ? 'text-slate-500' : 'text-red-400'}`}>
        {o.eclipseHours > 0
          ? `Longest shadow ${o.eclipseHours} h per orbit: needs ${o.batteryNeedWh.toFixed(0)} Wh, battery gives ${o.batteryUsableWh.toFixed(0)} Wh.`
          : 'Never in the Moon’s shadow.'}
      </p>
      <Row label="Fuel to get in" value={cap === null ? 'not possible' : `${Math.round(cap).toLocaleString()} of ${Math.round(o.deltaVAvailable).toLocaleString()} m/s`}>
        <Bar pct={cap === null || o.deltaVAvailable <= 0 ? 100 : (cap / o.deltaVAvailable) * 100} color={fits ? '#4ade80' : '#f87171'} />
        <p className={`mt-1 ${fits ? 'text-slate-500' : 'text-red-400'}`}>
          {cap === null
            ? 'This engine cannot get into this orbit.'
            : !fits
              ? `Short by ${Math.round(cap - o.deltaVAvailable).toLocaleString()} m/s.`
              : upkeepLine(o)}
        </p>
      </Row>

    </div>
  )
}

function SidePanel({ o }: { o: OrbitOption }) {
  const yOf = (km: number) => 128 - km * 1.05
  const ice = o.iceInstruments
  const limits = ice.map((i) => i.maxAltitudeKm).filter((x): x is number => x !== null)
  const top = limits.length ? Math.max(...limits) : 25
  const low = limits.length ? Math.min(...limits) : 20
  const label = !ice.length
    ? 'ice instruments work up to 20 to 25 km'
    : low === top
      ? `ice instruments work up to ${top} km`
      : `ice instruments work up to ${low} to ${top} km`
  const band = ice.length ? '#22d3ee' : '#94a3b8'
  const inRange = o.iceInRange
  const beam = !ice.length ? '#94a3b8' : inRange ? '#22d3ee' : '#fbbf24'
  const y = yOf(Math.min(o.altitudeKm, 110))
  return (
    <div className={`${PANEL} pointer-events-auto absolute top-16 left-3 w-[270px] p-3`}>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest" style={{ color: ACCENT }}>
        THE POLE PASS, SEEN FROM THE SIDE
      </h3>
      <svg viewBox="0 0 246 150" width="246" height="150" role="img" aria-label={`Pass height ${o.altitudeKm} km; ${label}`}>
        <rect x="0" y={yOf(top)} width="246" height={yOf(0) - yOf(top)} fill={band} fillOpacity={0.1} />
        <rect x="0" y={yOf(low)} width="246" height={yOf(0) - yOf(low)} fill={band} fillOpacity={0.13} />
        <line x1="0" x2="246" y1={yOf(top)} y2={yOf(top)} stroke={band} strokeDasharray="4 4" />
        <text x="242" y={yOf(top) - 4} fill={ice.length ? '#67e8f9' : '#94a3b8'} fontSize="11" textAnchor="end">
          {label}
        </text>
        <path d="M0 128 L60 128 Q78 128 86 140 L128 140 Q136 128 154 128 L246 128 L246 150 L0 150 Z" fill="#6b7280" />
        <path d="M86 140 L128 140 L128 150 L86 150 Z" fill="#0b1226" />
        <text x="107" y="148" fill="#e0fbff" fontSize="10" textAnchor="middle">
          ice?
        </text>
        <line x1="107" x2="107" y1={y + 6} y2="138" stroke={beam} strokeWidth="2" strokeDasharray={inRange ? undefined : '3 4'} />
        <line x1="20" x2="226" y1={y} y2={y} stroke={o.color} strokeWidth="2" />
        <rect x="100" y={y - 5} width="14" height="10" rx="2" fill="#fff" />
        <text x="22" y={y - 6} fill={o.color} fontSize="12" fontWeight="700">
          {o.altitudeKm} km
        </text>
      </svg>
      <p className="mt-1.5 text-xs leading-snug text-slate-300">
        {!ice.length ? (
          'No ice instrument on board: nothing here can see into the dark craters.'
        ) : inRange ? (
          <>
            <span className="text-green-400">Close enough.</span> At {o.altitudeKm} km the ice instruments read the crater floor.
          </>
        ) : (
          <>
            <span className="text-amber-400">Too high.</span> At {o.altitudeKm} km the ice signal is lost: this orbit maps no ice.
          </>
        )}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** The 12-month time-lapse: 14 s, a 3.5 s hold, plus manual scrubber & Play/Pause control. */
function useLapse(
  resetKey: string,
  reduced: boolean,
): {
  clock: RefObject<LapseClock>
  shownMonths: number
  playing: boolean
  togglePlay: () => void
  scrub: (months: number) => void
} {
  const clock = useRef<LapseClock>({ months: reduced ? MISSION_MONTHS : 0 })
  const [shownMonths, setShown] = useState(reduced ? MISSION_MONTHS : 0)
  const [playing, setPlaying] = useState(!reduced)

  useEffect(() => {
    clock.current.months = reduced || !playing ? MISSION_MONTHS : 0
    setShown(clock.current.months)
  }, [resetKey, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (reduced || !playing) return
    const resumeOffsetMs = (Math.min(MISSION_MONTHS, Math.max(0, clock.current.months)) / MISSION_MONTHS) * LAPSE_MS
    const start = performance.now() - resumeOffsetMs
    let tenth = -1
    let raf = 0
    const tick = (now: number) => {
      const el = (now - start) % (LAPSE_MS + HOLD_MS)
      const months = Math.min(1, el / LAPSE_MS) * MISSION_MONTHS
      clock.current.months = months
      const t = Math.floor(months * 10)
      if (t !== tenth) {
        tenth = t
        setShown(months)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [resetKey, reduced, playing])

  const scrub = useCallback((m: number) => {
    const clamped = Math.max(0, Math.min(MISSION_MONTHS, m))
    setPlaying(false)
    clock.current.months = clamped
    setShown(clamped)
  }, [])

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && clock.current.months >= MISSION_MONTHS - 0.05) {
        clock.current.months = 0
        setShown(0)
      }
      return !p
    })
  }, [])

  return { clock, shownMonths, playing, togglePlay, scrub }
}

function useWidth(ref: RefObject<HTMLDivElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/**
 * How far to end the 3D scene above the bottom edge so the Moon's south pole stays above the card
 * row. The camera frames the Moon by height: its bottom edge sits at about POLE_AT of the scene's
 * height (with the idle sway), so ending the scene earlier lifts and shrinks the Moon.
 */
const POLE_AT = 0.72
const POLE_GAP = 16
function useSceneLift(box: HTMLElement | null, cards: HTMLElement | null): number {
  const [lift, setLift] = useState(0)
  useEffect(() => {
    if (!box || !cards) return
    const read = () => {
      const h = box.clientHeight
      const free = h - (cards.offsetHeight + 12) - POLE_GAP
      setLift(Math.max(0, Math.round(h - free / POLE_AT)))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(box)
    ro.observe(cards)
    return () => ro.disconnect()
  }, [box, cards])
  return lift
}

/** Falls back to the plain screen if the 3D scene throws. */
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/* ------------------------------------------------------------------ */

function OrbitStage({ onSceneError, width }: { onSceneError: () => void; width: number | null }) {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const view = useMemo(() => buildOrbitView(design, difficulty), [design, difficulty])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const { clock, shownMonths, playing, togglePlay, scrub } = useLapse(
    `${view.selectedId}|${design.instruments.join(',')}|${design.propulsion}`,
    reduced,
  )
  // Cards play their own pick sound; arrow keys and clicks in the 3D scene play it here
  const pick = (id: string, quiet = false) => {
    if (id === useGameStore.getState().design.orbit) return
    if (!quiet) playPick(id)
    updateDesign({ orbit: id })
  }
  const o = view.selected
  const months = Math.min(MISSION_MONTHS, Math.floor(shownMonths) + 1)
  const side = width === null || width >= MIN_SIDE_WIDTH
  const [stageEl, setSceneEl] = useState<HTMLDivElement | null>(null)
  const [cardsEl, setCardsEl] = useState<HTMLDivElement | null>(null)
  // Wide: centred under the Moon. Narrower: grown to the left (the pole-pass panel sits at the top),
  // clear of the commander's speech bubble, so the chips keep one line each
  const cardsLeft = !side ? 12 : width !== null && width < CARDS_CENTRED_MIN ? 190 : READOUT_W + 24
  const lift = useSceneLift(stageEl?.parentElement ?? null, cardsEl)

  return (
    <>
      {/* On short screens the scene ends above part of the card row, so the Moon's south pole (where
          the ice is) stays clear of the cards; the edge fades into the background. */}
      <div
        ref={setSceneEl}
        className="absolute inset-x-0 top-0"
        style={{
          bottom: lift,
          maskImage: lift > 0 ? 'linear-gradient(to bottom, #000 calc(100% - 48px), transparent)' : undefined,
        }}
      >
        <SceneBoundary onError={onSceneError}>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Pointing the telescope…</div>}>
            <OrbitScene view={view} lapse={clock} reduced={reduced} onPick={pick} />
          </Suspense>
        </SceneBoundary>
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center">
          <div className="font-mono text-xs font-semibold tracking-[0.2em] whitespace-nowrap" style={{ color: ACCENT }}>
            LAUNCH SITE · LUNAR ICE MAPPER · ORBIT
          </div>
          <div className={`${PANEL} pointer-events-auto mt-1.5 inline-flex flex-col items-center gap-1.5 px-3.5 py-2 font-mono text-xs tracking-widest whitespace-nowrap text-slate-300`}>
            {o.reachable ? (
              <>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}
                    className="rounded border border-slate-600/80 bg-slate-900/90 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-400/60"
                  >
                    {playing ? '❚❚ PAUSE' : '▶ PLAY'}
                  </button>
                  <span>
                    TIME-LAPSE · MONTH <b className="text-slate-50 tabular-nums">{months}</b> OF 12
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Time-lapse month scrubber"
                  min={0}
                  max={MISSION_MONTHS}
                  step={0.25}
                  value={shownMonths}
                  onChange={(e) => scrub(Number(e.target.value))}
                  className="tactical-range w-52"
                />
              </>
            ) : (
              <span className="text-rose-400">THE CRAFT NEVER ARRIVES IN THIS ORBIT</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Drag to look around, scroll to zoom. Heights are exaggerated.</div>
        </div>
        <ReadoutPanel o={o} months={shownMonths} />
        {side && <SidePanel o={o} />}
        <div
          ref={setCardsEl}
          className="pointer-events-auto absolute bottom-3 space-y-1.5"
          style={{ left: cardsLeft, right: READOUT_W + 24, maxWidth: CARDS_MAX_W, marginInline: 'auto' }}
          onMouseOver={(e) => {
            const id = hoveredChoiceId(e.target)
            setPreviewPatch(id ? { orbit: id } : null)
          }}
          onMouseLeave={() => setPreviewPatch(null)}
          onFocus={(e) => {
            const id = hoveredChoiceId(e.target)
            if (id) setPreviewPatch({ orbit: id })
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPreviewPatch(null)
          }}
        >
          <SynergyStrip step="orbit" compact />
          <DesignDeltaLine />
          <OrbitCardTray options={view.options} selectedId={view.selectedId} onPick={(id, fromKeyboard) => pick(id, !fromKeyboard)} />
        </div>
        <StepButtons overlay />
      </div>
    </>
  )
}

/** A saved design may name an orbit that no longer exists: store the orbit the screen shows, once. */
function useKnownOrbit() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  useEffect(() => {
    const view = buildOrbitView(design, difficulty)
    if (!view.storedIsKnown) updateDesign({ orbit: view.selectedId })
  }, [design, difficulty, updateDesign])
}

export function OrbitScreen() {
  useKnownOrbit()
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  useEffect(() => () => setPreviewPatch(null), [setPreviewPatch])
  // The 3D scene starts only in a browser with WebGL; server rendering and tests take the plain path
  const [scene, setScene] = useState(canUseWebGL)
  const wrap = useRef<HTMLDivElement>(null)
  const width = useWidth(wrap)
  const wide = width === null || width >= MIN_SCENE_WIDTH

  return (
    <div ref={wrap} className="relative h-full min-h-[520px] w-full overflow-hidden bg-[#03050a]">
      {scene && wide ? <OrbitStage onSceneError={() => setScene(false)} width={width} /> : <PlainOrbit />}
    </div>
  )
}
