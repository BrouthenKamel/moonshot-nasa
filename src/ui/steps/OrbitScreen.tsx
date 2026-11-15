import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { audio } from '../../assets/audio'
import { useDragStore } from '../interaction/dragStore'
import { useDropTarget } from '../interaction/drag'
import { useDesignPreview } from '../useDesignPreview'
import { DesignDeltaLine, SynergyStrip } from '../../viz/DesignDeltaLine'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { canUseWebGL } from '../../scene/webgl'
import { lunarOrbits } from '../../data/orbits'
import { Eng, Sheet, Stamp, StepHeader, nextLabel, stepTitle, type StampVerdict } from '../kit'
import { OrbitCardTray } from './launch/OrbitCards'
import { playPick } from './launch/radioKeys'
import { SceneTitle } from './launch/SceneTitle'
import type { LapseClock } from '../../scene/OrbitView'
import { ORBIT_SNAP_STOPS, radiusForOrbit, snapOrbitByRadius } from '../../viz/orbit/orbitDraw'
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

const LAPSE_MS = 14000
const HOLD_MS = 3500
const MIN_SCENE_WIDTH = 900
const MIN_SIDE_WIDTH = 1000
const READOUT_W = 290
const CARDS_MAX_W = 600
/** Below this width the orbit cards are not centred under the Moon, so they can stay wide enough */
const CARDS_CENTRED_MIN = 1200

const STAMP: Record<Tone, StampVerdict> = { good: 'go', warn: 'caution', bad: 'nogo' }
const SWATCH: Record<OrbitCheck['status'], string> = { green: 'bg-go', yellow: 'bg-caution', red: 'bg-nogo' }
const STATUS_TEXT: Record<OrbitCheck['status'], string> = { green: 'text-paper-dim', yellow: 'text-caution', red: 'text-nogo' }

function hoveredChoiceId(target: EventTarget | null): string | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-choice-id]')?.dataset.choiceId ?? null : null
}

/** The one plain sentence under the ice number: why this orbit maps what it maps */
function iceWhy(o: OrbitOption): string {
  if (!o.reachable) return 'The craft never gets into this orbit, so nothing is mapped.'
  if (!o.iceInstruments.length) return 'No ice instrument on board: nothing here can see into the dark craters.'
  if (!o.iceInRange) return `Too high: at ${o.altitudeKm} km the ice signal is lost.`
  if (o.verdict.tone === 'bad') return 'The ice instruments reach, but something else stops the mission.'
  if (coverageAt(o, MISSION_MONTHS) < COVERAGE_GOAL) return 'Close enough to read the ice, but too few passes to map it in a year.'
  return 'Low, frequent passes over the pole map the ice in time.'
}

/* ------------------------------------------------------------------ */
/* The verdict sheet: ice %, one sentence, the Go / No-Go swatches      */
/* ------------------------------------------------------------------ */

/** Story view: a coloured swatch and the name. Engineer view adds each check's reason. */
function CheckSwatches({ checks }: { checks: OrbitCheck[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {checks.map((c) => (
        <li key={c.resource} className="text-xs leading-snug" title={c.reason}>
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 shrink-0 ${SWATCH[c.status]}`} aria-hidden />
            <span className={`fp-label text-[0.68rem] ${STATUS_TEXT[c.status]}`}>{c.resource}</span>
            <span className="sr-only">{c.status}</span>
          </span>
          {c.status !== 'green' && (
            <Eng as="p" className="mt-0.5 basis-full pl-4 text-paper-faint">
              {c.reason}
            </Eng>
          )}
        </li>
      ))}
    </ul>
  )
}

function VerdictSheet({ o, coverage, className = '' }: { o: OrbitOption; coverage: number; className?: string }) {
  const final = coverageAt(o, MISSION_MONTHS)
  return (
    <Sheet className={`p-3.5 ${className}`}>
      <div aria-live="polite" className="flex justify-center">
        <Stamp key={o.verdict.text} verdict={STAMP[o.verdict.tone]} size="sm" animate>
          {o.verdictCheck && <span className="sr-only">Worst check, {o.verdictCheck}: </span>}
          {o.verdict.text}
        </Stamp>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="fp-data text-[38px] leading-none font-semibold text-ice">{Math.round(coverage)}%</div>
        <div className="text-right text-xs leading-snug text-paper-dim">
          of the polar ice mapped
          <br />
          <span className="fp-data text-paper-faint">goal {COVERAGE_GOAL}%</span>
          <Eng className="fp-data text-paper-faint"> · {Math.round(final)}% after 12 months</Eng>
        </div>
      </div>
      <div className="relative mt-2 h-1.5 bg-ink-1" aria-hidden>
        <div className="absolute inset-y-0 left-0 bg-ice" style={{ width: `${Math.max(0, Math.min(100, coverage))}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-paper" style={{ left: `${COVERAGE_GOAL}%` }} />
      </div>
      <p className="mt-2.5 text-sm leading-snug text-paper">{iceWhy(o)}</p>
      <div className="mt-3 border-t border-rule pt-2">
        <div className="fp-label mb-1.5 text-[0.65rem] text-kapton">Go / No-Go</div>
        <CheckSwatches checks={o.checks} />
      </div>
    </Sheet>
  )
}

/** Every figure of the orbit: Engineer view only */
function OrbitFigures({ o }: { o: OrbitOption }) {
  const cap = o.captureDeltaV
  const fits = cap !== null && o.deltaVAvailable >= cap
  return (
    <Eng as="div" className="mt-2 space-y-2 border border-rule bg-ink-2 p-3 text-xs">
      <p className="leading-snug text-paper-dim">
        <b className="font-semibold text-paper">{o.shortName}.</b> {o.description}
      </p>
      <p className="text-[11px] text-paper-faint">Flown by: {lunarOrbits.find((x) => x.id === o.id)?.flownBy}</p>
      <Row label="Passes over the pole" value={`${o.passesPerTurn} a month`}>
        <p className="mt-0.5 text-paper-faint">{o.passesLine}</p>
      </Row>
      <div className="grid grid-cols-2 gap-x-3">
        <Row label="In sunlight" value={`${o.sunlitPct}%`}>
          <Bar pct={o.sunlitPct} tone="bg-paper-dim" />
        </Row>
        <Row label="Earth in view" value={`${o.earthPct}%`}>
          <Bar pct={o.earthPct} tone="bg-paper-dim" />
        </Row>
      </div>
      <p className={o.batteryOk ? 'text-paper-faint' : 'text-nogo'}>
        {o.eclipseHours > 0
          ? `Longest shadow ${o.eclipseHours} h per orbit: needs ${o.batteryNeedWh.toFixed(0)} Wh, battery gives ${o.batteryUsableWh.toFixed(0)} Wh.`
          : 'Never in the Moon’s shadow.'}
      </p>
      <Row label="Fuel to get in" value={cap === null ? 'not possible' : `${Math.round(cap).toLocaleString()} of ${Math.round(o.deltaVAvailable).toLocaleString()} m/s`}>
        <Bar pct={cap === null || o.deltaVAvailable <= 0 ? 100 : (cap / o.deltaVAvailable) * 100} tone={fits ? 'bg-go' : 'bg-nogo'} />
        <p className={`mt-1 ${fits ? 'text-paper-faint' : 'text-nogo'}`}>
          {cap === null
            ? 'This engine cannot get into this orbit.'
            : !fits
              ? `Short by ${Math.round(cap - o.deltaVAvailable).toLocaleString()} m/s.`
              : upkeepLine(o)}
        </p>
      </Row>
    </Eng>
  )
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="relative mt-1.5 h-1.5 bg-ink-1">
      <div className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

function Row({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="mt-2 text-xs">
      <div className="flex justify-between text-paper-dim">
        <span>{label}</span>
        <b className="fp-data text-paper">{value}</b>
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Plain screen: used without 3D, in tests, and in narrow columns      */
/* ------------------------------------------------------------------ */

function StepButtons({ overlay }: { overlay: boolean }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const back = (
    <button type="button" onClick={() => setDesignStep('spacecraft')} className="tactical-btn-back bg-ink-1">
      ← Back
    </button>
  )
  const next = (
    <button type="button" onClick={() => setDesignStep('ride')} className="tactical-btn-next">
      {nextLabel('orbit')}
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
      <div className="mx-auto max-w-3xl space-y-4">
        <StepHeader step="orbit" title={stepTitle('orbit')} />

        <VerdictSheet o={view.selected} coverage={coverageAt(view.selected, MISSION_MONTHS)} />

        <Eng as="div" className="block border border-rule bg-ink-2 p-4 text-sm">
          <div className="fp-label text-kapton">This orbit with your design</div>
          <div className="mt-2.5 grid grid-cols-2 gap-4 fp-data text-xs text-paper-dim">
            <div>
              Projected ice coverage in 12 clean months:{' '}
              <span className={activeBudgets.projectedCoverage >= COVERAGE_GOAL ? 'font-bold text-ice' : 'font-bold text-nogo'}>
                {activeBudgets.projectedCoverage.toFixed(0)}%
              </span>{' '}
              (need {COVERAGE_GOAL}%)
            </div>
            <div>
              Instruments can run:{' '}
              <span className={activeBudgets.scienceDuty >= 1 ? 'font-bold text-go' : 'font-bold text-caution'}>
                {Math.round(activeBudgets.scienceDuty * 100)}% of the time
              </span>
            </div>
            <div>
              Eclipse needs <span className="text-paper">{activeBudgets.batteryNeedWh.toFixed(0)} Wh</span>; battery gives{' '}
              <span className={activeBudgets.batteryOk ? 'font-bold text-go' : 'font-bold text-nogo'}>{activeBudgets.batteryUsableWh.toFixed(0)} Wh</span>
            </div>
            <div>
              {activeBudgets.captureDeltaV === null ? (
                <>
                  Holding the orbit: <span className="text-paper">{activeBudgets.deltaVStationKeeping} m/s a month</span>
                </>
              ) : (
                <span className={activeBudgets.upkeepTurns < MISSION_MONTHS ? 'text-nogo' : undefined}>
                  {upkeepLine({ upkeepTurns: activeBudgets.upkeepTurns, holdDeltaV: activeBudgets.deltaVStationKeeping })}
                </span>
              )}
            </div>
          </div>
          {instruments.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-paper-dim">
              {instruments.map((i) => (
                <li key={i.id}>
                  {i.name}: works at <span className="fp-data">{Math.round((activeBudgets.quality[i.id] ?? 0) * 100)}%</span> quality here
                  {!i.seesShadow && ' (cannot see into shadow: does not count as ice coverage)'}
                </li>
              ))}
            </ul>
          )}
        </Eng>

        <Sheet tone="flat" className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="orbit-timelapse-plain" className="fp-label text-paper-dim">
              Time-lapse · month <span className="fp-data text-paper">{scrubMonth}</span> / {MISSION_MONTHS}
            </label>
            <div className="flex items-center gap-3">
              <span className="fp-data text-xs font-semibold text-ice">{scrubbedCoverage}% mapped</span>
              <button type="button" onClick={() => setPlaying((p) => !p)} className="fp-btn-secondary !px-2.5 !py-1 text-[11px]">
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
            className="tactical-range mt-2 w-full"
          />
          <div className="relative mt-2 h-1.5 bg-ink-1">
            <div className="h-full bg-ice transition-all duration-200" style={{ width: `${Math.min(100, scrubbedCoverage)}%` }} />
            <div className="absolute -inset-y-1 w-0.5 bg-paper" style={{ left: `${COVERAGE_GOAL}%` }} />
          </div>
        </Sheet>

        <SynergyStrip step="orbit" />
        <DesignDeltaLine />

        <div
          onMouseOver={(e) => {
            if (useDragStore.getState().held) return
            const id = hoveredChoiceId(e.target)
            setPreviewPatch(id ? { orbit: id } : null)
          }}
          onMouseLeave={() => {
            if (!useDragStore.getState().held) setPreviewPatch(null)
          }}
          onFocus={(e) => {
            const id = hoveredChoiceId(e.target)
            if (id) setPreviewPatch({ orbit: id })
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !useDragStore.getState().held) setPreviewPatch(null)
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
          <OrbitFigures o={view.selected} />
        </div>

        <StepButtons overlay={false} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene overlays                                                       */
/* ------------------------------------------------------------------ */

function ReadoutPanel({ o, months }: { o: OrbitOption; months: number }) {
  return (
    <div className="pointer-events-auto absolute top-16 right-3 max-h-[calc(100%-5rem)] w-[290px] overflow-y-auto">
      <VerdictSheet o={o} coverage={coverageAt(o, months)} />
      <OrbitFigures o={o} />
    </div>
  )
}

/** The pole pass from the side: how high the craft flies against the height the ice instruments can read from */
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
  const band = ice.length ? 'var(--color-ice)' : 'var(--color-paper-faint)'
  const inRange = o.iceInRange
  const beam = !ice.length ? 'var(--color-paper-faint)' : inRange ? 'var(--color-ice)' : 'var(--color-caution)'
  const y = yOf(Math.min(o.altitudeKm, 110))
  return (
    <Sheet className="pointer-events-auto absolute top-16 left-3 w-[270px] p-3">
      <h3 className="fp-label mb-1.5 text-[0.65rem] text-kapton">The pole pass, seen from the side</h3>
      <svg viewBox="0 0 246 150" width="246" height="150" role="img" aria-label={`Pass height ${o.altitudeKm} km; ${label}`}>
        <rect x="0" y={yOf(top)} width="246" height={yOf(0) - yOf(top)} fill={band} fillOpacity={0.08} />
        <rect x="0" y={yOf(low)} width="246" height={yOf(0) - yOf(low)} fill={band} fillOpacity={0.1} />
        <line x1="0" x2="246" y1={yOf(top)} y2={yOf(top)} stroke={band} strokeDasharray="4 4" />
        <text x="242" y={yOf(top) - 4} fill={band} fontSize="11" textAnchor="end">
          {label}
        </text>
        <path d="M0 128 L60 128 Q78 128 86 140 L128 140 Q136 128 154 128 L246 128 L246 150 L0 150 Z" fill="var(--color-ink-3)" stroke="var(--color-rule-strong)" />
        <path d="M86 140 L128 140 L128 150 L86 150 Z" fill="var(--color-ink-0)" />
        <text x="107" y="148" fill="var(--color-ice)" fontSize="10" textAnchor="middle">
          ice?
        </text>
        <line x1="107" x2="107" y1={y + 6} y2="138" stroke={beam} strokeWidth="2" strokeDasharray={inRange ? undefined : '3 4'} />
        <line x1="20" x2="226" y1={y} y2={y} stroke={o.color} strokeWidth="1.5" />
        <rect x="100" y={y - 5} width="14" height="10" fill="var(--color-paper)" />
        <text x="22" y={y - 6} fill="var(--color-paper)" fontSize="12" fontWeight="700">
          {o.altitudeKm} km
        </text>
      </svg>
      {/* The no-instrument case is said once, in the verdict sheet */}
      {ice.length > 0 && (
        <p className="mt-1.5 text-xs leading-snug text-paper-dim">
          {inRange ? (
            <>
              <span className="text-go">Close enough.</span> The ice instruments read the crater floor.
            </>
          ) : (
            <>
              <span className="text-caution">Too high.</span> The ice signal is lost on the way up.
            </>
          )}
        </p>
      )}
    </Sheet>
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
  const previewPatch = useUiStore((s) => s.previewPatch)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const liveDesign = useMemo(() => (previewPatch ? { ...design, ...previewPatch } : design), [design, previewPatch])
  const view = useMemo(() => buildOrbitView(liveDesign, difficulty), [liveDesign, difficulty])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const [drawSeq, setDrawSeq] = useState(0)
  const { clock, shownMonths, playing, togglePlay, scrub } = useLapse(
    `${view.selectedId}|${design.instruments.join(',')}|${design.propulsion}|${drawSeq}`,
    reduced,
  )
  // Cards play their own pick sound; arrow keys and clicks in the 3D scene play it here
  const pick = useCallback(
    (id: string, quiet = false) => {
      if (!quiet) playPick(id)
      setDrawSeq((n) => n + 1)
      if (id !== useGameStore.getState().design.orbit) updateDesign({ orbit: id })
    },
    [updateDesign],
  )
  const o = view.selected
  const months = Math.min(MISSION_MONTHS, Math.floor(shownMonths) + 1)
  const side = width === null || width >= MIN_SIDE_WIDTH
  const [stageEl, setSceneEl] = useState<HTMLDivElement | null>(null)
  const [cardsEl, setCardsEl] = useState<HTMLDivElement | null>(null)
  // Wide: centred under the Moon. Narrower: grown to the left (the pole-pass panel sits at the top),
  // clear of the commander's speech bubble, so the chips keep one line each
  const cardsLeft = !side ? 12 : width !== null && width < CARDS_CENTRED_MIN ? 190 : READOUT_W + 24
  const lift = useSceneLift(stageEl?.parentElement ?? null, cardsEl)

  const moonDrop = useDropTarget({
    id: 'orbit:moon',
    accepts: ['orbit'],
    onDrop: (p) => pick(p.value, true),
  })

  const [drawDrag, setDrawDrag] = useState<{ r: number; snapId: string } | null>(null)
  const handleDrawPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !stageEl) return
      e.stopPropagation()
      e.preventDefault()
      const rect = stageEl.getBoundingClientRect()
      const cx = rect.left + rect.width * 0.5
      const cy = rect.top + rect.height * 0.43
      let lastSnap: string = o.id
      const radiusFromEvent = (ev: PointerEvent | React.PointerEvent) =>
        Math.max(52, Math.min(240, Math.hypot(ev.clientX - cx, ev.clientY - cy)))
      const initialR = radiusFromEvent(e)
      const initialStop = snapOrbitByRadius(initialR)
      lastSnap = initialStop.id
      setDrawDrag({ r: initialR, snapId: initialStop.id })
      setPreviewPatch({ orbit: initialStop.id })

      const move = (ev: PointerEvent) => {
        const r = radiusFromEvent(ev)
        const stop = snapOrbitByRadius(r)
        if (stop.id !== lastSnap) {
          lastSnap = stop.id
          audio.play('sfx.click')
          setPreviewPatch({ orbit: stop.id })
        }
        setDrawDrag({ r, snapId: stop.id })
      }
      const finish = (commit: boolean) => () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        setDrawDrag(null)
        setPreviewPatch(null)
        if (commit) pick(lastSnap, false)
      }
      const up = finish(true)
      const cancel = finish(false)
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
    [stageEl, o.id, setPreviewPatch, pick],
  )

  const activeRadius = drawDrag ? drawDrag.r : radiusForOrbit(o.id)
  const snappedRadius = radiusForOrbit(drawDrag ? drawDrag.snapId : o.id)

  return (
    <>
      {/* On short screens the scene ends above part of the card row, so the Moon's south pole (where
          the ice is) stays clear of the cards; the edge fades into the background. */}
      <div
        ref={setSceneEl}
        {...moonDrop.handlers}
        className={`absolute inset-x-0 top-0 transition-colors ${
          moonDrop.state.over
            ? 'outline outline-1 -outline-offset-2 outline-kapton'
            : moonDrop.state.compatible
              ? 'outline outline-1 -outline-offset-2 outline-dashed outline-rule-strong'
              : ''
        }`}
        style={{
          bottom: lift,
          maskImage: lift > 0 ? 'linear-gradient(to bottom, #000 calc(100% - 48px), transparent)' : undefined,
        }}
      >
        <SceneBoundary onError={onSceneError}>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-paper-faint">Pointing the telescope…</div>}>
            <OrbitScene view={view} lapse={clock} reduced={reduced} onPick={pick} />
          </Suspense>
        </SceneBoundary>

        {/* Orbit draw overlay: chalk-dashed hairline ellipse + magnetic periapsis handle */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <g style={{ transform: 'translate(50%, 43%)' }}>
            {drawDrag &&
              ORBIT_SNAP_STOPS.map((stop) => (
                <g key={stop.id}>
                  <ellipse
                    cx={0}
                    cy={0}
                    rx={stop.id === 'orbit-100km' ? stop.radiusPx * 0.96 : stop.radiusPx * 0.68}
                    ry={stop.radiusPx}
                    fill="none"
                    stroke={stop.id === drawDrag.snapId ? 'var(--color-kapton)' : 'var(--color-rule-strong)'}
                    strokeWidth={stop.id === drawDrag.snapId ? 1.5 : 1}
                    strokeDasharray={stop.id === drawDrag.snapId ? '5 4' : '2 6'}
                    opacity={stop.id === drawDrag.snapId ? 0.9 : 0.45}
                  />
                  <text
                    x={8}
                    y={stop.radiusPx + 4}
                    fill={stop.id === drawDrag.snapId ? 'var(--color-kapton)' : 'var(--color-paper-faint)'}
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                  >
                    {stop.label}
                  </text>
                </g>
              ))}
            <ellipse
              cx={0}
              cy={0}
              rx={activeRadius * (o.id === 'orbit-100km' ? 0.96 : 0.68)}
              ry={activeRadius}
              fill="none"
              stroke={drawDrag ? 'var(--color-paper)' : 'var(--color-paper-faint)'}
              strokeWidth={drawDrag ? 1.5 : 1}
              strokeDasharray="6 5"
              opacity={drawDrag ? 0.85 : 0.35}
            />
          </g>
        </svg>

        <button
          type="button"
          data-testid="orbit-handle"
          aria-label={`Drag orbit periapsis handle (currently ${o.shortName}, ${o.altitudeKm} km)`}
          onPointerDown={handleDrawPointerDown}
          style={{
            left: '50%',
            top: `calc(43% + ${drawDrag ? snappedRadius : activeRadius}px)`,
            transform: 'translate(-50%, -50%)',
            touchAction: 'none',
          }}
          className={`pointer-events-auto absolute z-10 flex items-center gap-1.5 border px-2 py-1 fp-data text-[10px] tracking-wide transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-kapton ${
            drawDrag
              ? 'cursor-grabbing border-kapton bg-kapton text-kapton-ink'
              : 'cursor-grab border-rule-strong bg-ink-1/90 text-paper hover:border-kapton hover:text-kapton'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-kapton" aria-hidden />
          <span>↕ Periapsis · {o.altitudeKm} km</span>
        </button>
      </div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center">
          <SceneTitle step="orbit" title={stepTitle('orbit')} className="pointer-events-auto text-left">
            <div className="mt-1.5 flex flex-col items-center gap-1 border-t border-rule pt-1.5 fp-data text-xs whitespace-nowrap text-paper-dim">
              {o.reachable ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}
                      className="fp-btn-ghost !px-2 !py-0.5 text-[10px]"
                    >
                      {playing ? '❚❚ Pause' : '▶ Play'}
                    </button>
                    <span>
                      Time-lapse · month <b className="text-paper">{months}</b> of 12
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
                <span className="text-nogo">The craft never arrives in this orbit</span>
              )}
            </div>
          </SceneTitle>
          <Eng as="div" className="mt-1 fp-data text-[11px] text-paper-dim">
            Periapsis: {o.altitudeKm} km · Passes/turn: {o.passesPerTurn} · Capture Δv:{' '}
            {o.captureDeltaV === null ? 'not possible' : `${Math.round(o.captureDeltaV).toLocaleString()} m/s`}
          </Eng>
          <Eng as="div" className="mt-0.5 text-[11px] text-paper-faint">
            Drag to look around, scroll to zoom. Heights are exaggerated.
          </Eng>
        </div>
        <ReadoutPanel o={o} months={shownMonths} />
        {side && <SidePanel o={o} />}
        <div
          ref={setCardsEl}
          className="pointer-events-auto absolute bottom-3 space-y-1.5"
          style={{ left: cardsLeft, right: READOUT_W + 24, maxWidth: CARDS_MAX_W, marginInline: 'auto' }}
          onMouseOver={(e) => {
            if (useDragStore.getState().held) return
            const id = hoveredChoiceId(e.target)
            setPreviewPatch(id ? { orbit: id } : null)
          }}
          onMouseLeave={() => {
            if (!useDragStore.getState().held) setPreviewPatch(null)
          }}
          onFocus={(e) => {
            const id = hoveredChoiceId(e.target)
            if (id) setPreviewPatch({ orbit: id })
          }}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !useDragStore.getState().held) setPreviewPatch(null)
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
    <div ref={wrap} className="relative h-full min-h-[520px] w-full overflow-hidden bg-ink-0">
      {scene && wide ? <OrbitStage onSceneError={() => setScene(false)} width={width} /> : <PlainOrbit />}
    </div>
  )
}
