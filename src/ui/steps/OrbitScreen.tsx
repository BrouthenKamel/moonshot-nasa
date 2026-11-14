import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useGameStore } from '../../state/gameStore'
import { lunarOrbits, type LunarOrbit } from '../../data/orbits'
import { computeBudgets } from '../../sim/budgets'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { canUseWebGL } from '../../scene/webgl'
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

const TONE_TEXT: Record<Tone, string> = { good: 'text-green-400', warn: 'text-amber-400', bad: 'text-red-400' }
const TONE_CHIP: Record<Tone, string> = {
  good: 'border-green-400/40 bg-green-500/15 text-green-400',
  warn: 'border-amber-400/40 bg-amber-500/15 text-amber-400',
  bad: 'border-red-400/45 bg-red-500/15 text-red-400',
}
const DOT: Record<OrbitCheck['status'], string> = { green: 'bg-green-400', yellow: 'bg-amber-400', red: 'bg-red-400' }
const PANEL = 'rounded-xl border border-slate-400/20 bg-slate-950/70 backdrop-blur-md'

/* ------------------------------------------------------------------ */
/* Plain screen: used without 3D, in tests, and in narrow columns      */
/* ------------------------------------------------------------------ */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-900 p-2 text-center">
      <div className="text-slate-500">{label}</div>
      <div className="font-bold text-slate-300">{value}</div>
    </div>
  )
}

function OrbitCard({ orbit, selected, onSelect }: { orbit: LunarOrbit; selected: boolean; onSelect: () => void }) {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  // What this orbit would do for the current design
  const trial = computeBudgets({ ...design, orbit: orbit.id }, difficulty)
  const iceRates = design.instruments
    .map((id) => getPartById(id) as InstrumentPart | undefined)
    .filter((i): i is InstrumentPart => !!i && i.seesShadow)
    .map((i) => trial.coverageRate[i.id] ?? 0)
  const bestRate = iceRates.length ? Math.max(...iceRates) : 0

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-lg p-4 text-left transition-colors ${
        selected ? 'bg-orange-900 ring-2 ring-orange-500' : 'bg-slate-800 hover:bg-slate-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-100">{orbit.name}</div>
          <div className="mt-1 text-sm text-slate-400">{orbit.description}</div>
        </div>
        <div
          className={`h-5 w-5 shrink-0 rounded-full border-2 ${selected ? 'border-orange-500 bg-orange-500' : 'border-slate-600'}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <Stat label="Over the pole" value={`${orbit.altitude} km`} />
        <Stat label="Passes a turn" value={`${orbit.passesPerTurn}`} />
        <Stat label="Upkeep" value={`${orbit.stationKeepingDeltaV} m/s/turn`} />
        <Stat label="Earth in view" value={`${Math.round(orbit.earthVisible * 100)}%`} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>Sunlit {Math.round(orbit.sunlitShare * 100)}%</span>
        <span>Eclipse {orbit.eclipseHours} h</span>
        <span>
          To capture:{' '}
          <span className={trial.captureDeltaV === null ? 'text-red-400' : 'text-slate-200'}>
            {trial.captureDeltaV === null ? 'not possible with your engine' : `${trial.captureDeltaV.toFixed(0)} m/s`}
          </span>
        </span>
        <span>
          Your ice instruments map:{' '}
          <span className={bestRate > 0.09 ? 'text-green-400' : 'text-orange-400'}>
            {iceRates.length ? `${(bestRate * 100).toFixed(1)}% of what is left, per turn` : 'nothing (none sees into shadow)'}
          </span>
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500">Flown by: {orbit.flownBy}</div>
    </button>
  )
}

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
      onClick={() => setDesignStep('spacecraft')}
      className="rounded-lg bg-slate-700/90 px-6 py-2 font-medium text-slate-200 backdrop-blur hover:bg-slate-600"
    >
      ← Back
    </button>
  )
  const next = (
    <button
      onClick={() => setDesignStep('ride')}
      className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white shadow-lg shadow-blue-900/50 hover:bg-blue-500"
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
  const getBudgets = useGameStore((s) => s.getBudgets)
  const budgets = getBudgets()
  const view = useMemo(() => buildOrbitView(design, difficulty), [design, difficulty])
  const instruments = design.instruments
    .map((id) => getPartById(id) as InstrumentPart | undefined)
    .filter((i): i is InstrumentPart => !!i)

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-lg bg-slate-900 p-6">
          <div className="text-xs font-semibold tracking-widest" style={{ color: ACCENT }}>
            LAUNCH SITE · LUNAR ICE MAPPER · ORBIT
          </div>
          <h1 className="mt-1 text-xl font-bold text-orange-400">4. Orbit Selection</h1>
          <p className="mt-2 text-slate-400">
            Only a polar orbit passes over the south pole. More and lower passes map faster, but the orbit costs more to
            reach and to hold. The ice instruments only work close to the surface.
          </p>
        </div>

        <div className="rounded-lg bg-orange-950 p-4 text-sm">
          <div className="font-medium text-orange-300">This orbit with your design</div>
          <div className="mt-2 grid grid-cols-2 gap-4 text-orange-200">
            <div>
              Projected ice coverage in 12 clean turns:{' '}
              <span className={budgets.projectedCoverage >= COVERAGE_GOAL ? 'text-green-400' : 'text-red-400'}>
                {budgets.projectedCoverage.toFixed(0)}%
              </span>{' '}
              (need {COVERAGE_GOAL}%)
            </div>
            <div>
              Instruments can run:{' '}
              <span className={budgets.scienceDuty >= 1 ? 'text-green-400' : 'text-orange-400'}>
                {Math.round(budgets.scienceDuty * 100)}% of the time
              </span>
            </div>
            <div>
              Eclipse needs <span className="text-orange-400">{budgets.batteryNeedWh.toFixed(0)} Wh</span>; battery gives{' '}
              <span className={budgets.batteryOk ? 'text-green-400' : 'text-red-400'}>{budgets.batteryUsableWh.toFixed(0)} Wh</span>
            </div>
            <div>
              {budgets.captureDeltaV === null ? (
                <>
                  Holding the orbit: <span className="text-orange-400">{budgets.deltaVStationKeeping} m/s a turn</span>
                </>
              ) : (
                <span className={budgets.upkeepTurns < MISSION_MONTHS ? 'text-red-400' : undefined}>
                  {upkeepLine({ upkeepTurns: budgets.upkeepTurns, holdDeltaV: budgets.deltaVStationKeeping })}
                </span>
              )}
            </div>
          </div>
          {instruments.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-orange-200/80">
              {instruments.map((i) => (
                <li key={i.id}>
                  {i.name}: works at {Math.round((budgets.quality[i.id] ?? 0) * 100)}% quality here
                  {!i.seesShadow && ' (cannot see into shadow: does not count as ice coverage)'}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg bg-slate-900 p-4" aria-live="polite">
          <div className={`mb-2 text-sm font-bold tracking-wider ${TONE_TEXT[view.selected.verdict.tone]}`}>
            {view.selected.verdict.text}
          </div>
          <CheckRows checks={view.selected.checks} />
        </div>

        <div className="space-y-4">
          {lunarOrbits.map((orbit) => (
            <OrbitCard
              key={orbit.id}
              orbit={orbit}
              selected={design.orbit === orbit.id}
              onSelect={() => updateDesign({ orbit: orbit.id })}
            />
          ))}
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
        <b className="text-slate-100 tabular-nums">{value}</b>
      </div>
      {children}
    </div>
  )
}

function ReadoutPanel({ o, months }: { o: OrbitOption; months: number }) {
  const now = coverageAt(o, months)
  const final = coverageAt(o, MISSION_MONTHS)
  const numberColour = now >= COVERAGE_GOAL ? 'text-green-400' : final <= 0 ? 'text-amber-400' : 'text-slate-100'
  const cap = o.captureDeltaV
  const fits = cap !== null && o.deltaVAvailable >= cap
  return (
    <div className={`${PANEL} pointer-events-auto absolute top-16 right-3 bottom-[150px] w-[290px] overflow-y-auto p-3.5`}>
      <div aria-live="polite" className={`rounded-lg border px-2.5 py-1.5 text-center text-[13px] font-bold tracking-wider ${TONE_CHIP[o.verdict.tone]}`}>
        {o.verdict.text}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className={`text-[38px] leading-none font-extrabold tabular-nums ${numberColour}`}>{Math.round(now)}%</div>
        <div className="text-right text-xs leading-snug text-slate-400">
          of the polar ice mapped
          <br />
          {Math.round(final)}% after 12 months
        </div>
      </div>
      <Bar pct={now} color={now >= COVERAGE_GOAL ? '#4ade80' : '#22d3ee'} tick={COVERAGE_GOAL} />
      <div className="mt-1 text-right text-[11px] text-slate-500">goal {COVERAGE_GOAL}%</div>

      <div className="mt-1 rounded-lg bg-slate-900/60 p-2.5">
        <div className="mb-1.5 text-[11px] font-semibold tracking-widest" style={{ color: ACCENT }}>
          GO / NO-GO
        </div>
        <CheckRows checks={o.checks} />
      </div>

      <div className="mt-3 text-[11px] font-semibold tracking-widest" style={{ color: ACCENT }}>
        THIS ORBIT
      </div>

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
    <div className={`${PANEL} pointer-events-auto absolute bottom-[150px] left-3 w-[270px] p-3`}>
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

function OrbitCards({ options, selectedId, onPick }: { options: OrbitOption[]; selectedId: string; onPick: (id: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const j = (i + d + options.length) % options.length
    onPick(options[j].id)
    refs.current[j]?.focus()
  }
  return (
    <div className="pointer-events-auto absolute right-3 bottom-3 left-3 grid grid-cols-3 gap-2.5" role="group" aria-label="Science orbit">
      {options.map((o, i) => {
        const on = o.id === selectedId
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            aria-pressed={on}
            onClick={() => onPick(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`${PANEL} text-left transition-colors hover:bg-slate-900/85 focus-visible:outline-2 focus-visible:outline-orange-500 ${
              on ? 'border-2 px-3 py-2.5' : 'px-3.5 py-3'
            }`}
            style={on ? { borderColor: o.color } : undefined}
          >
            <div className="flex items-center gap-2 text-[15px] font-bold text-slate-100">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.color }} aria-hidden />
              {o.shortName}
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-snug text-slate-400">{o.description}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-3.5 text-xs text-slate-300 tabular-nums">
              <span>
                <b className="text-white">{o.altitudeKm} km</b> over the pole
              </span>
              <span>
                <b className="text-white">{o.passesPerTurn}</b> passes a month
              </span>
              <span>
                <b className="text-white">{Math.round(coverageAt(o, MISSION_MONTHS))}%</b> ice in 12 months
              </span>
            </div>
            {o.verdict.tone !== 'good' && (
              <div className={`mt-1 text-xs font-semibold ${TONE_TEXT[o.verdict.tone]}`}>
                {o.verdict.text.charAt(0) + o.verdict.text.slice(1).toLowerCase()}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** The 12-month time-lapse: 14 s, a 3.5 s hold, then again; restarts when resetKey changes. */
function useLapse(resetKey: string, reduced: boolean): { clock: RefObject<LapseClock>; shownMonths: number } {
  const clock = useRef<LapseClock>({ months: reduced ? MISSION_MONTHS : 0 })
  const [shownMonths, setShown] = useState(reduced ? MISSION_MONTHS : 0)
  useEffect(() => {
    // Reduced motion never changes during the step: state and clock start at month 12
    if (reduced) return
    const start = performance.now()
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
  }, [resetKey, reduced])
  return { clock, shownMonths }
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
  const view = useMemo(() => buildOrbitView(design, difficulty), [design, difficulty])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const { clock, shownMonths } = useLapse(`${view.selectedId}|${design.instruments.join(',')}|${design.propulsion}`, reduced)
  const pick = (id: string) => {
    if (id !== useGameStore.getState().design.orbit) updateDesign({ orbit: id })
  }
  const o = view.selected
  const months = Math.min(MISSION_MONTHS, Math.floor(shownMonths) + 1)

  return (
    <>
      <SceneBoundary onError={onSceneError}>
        <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Pointing the telescope…</div>}>
          <OrbitScene view={view} lapse={clock} reduced={reduced} onPick={pick} />
        </Suspense>
      </SceneBoundary>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center">
          <div className="text-xs font-semibold tracking-[0.18em] whitespace-nowrap" style={{ color: ACCENT }}>
            LAUNCH SITE · LUNAR ICE MAPPER · ORBIT
          </div>
          <div className={`${PANEL} mt-1.5 inline-block px-3.5 py-1 text-xs tracking-widest whitespace-nowrap text-slate-400`}>
            {o.reachable ? (
              <>
                TIME-LAPSE · MONTH <b className="text-slate-100 tabular-nums">{months}</b> OF 12
              </>
            ) : (
              <span className="text-red-400">THE CRAFT NEVER ARRIVES IN THIS ORBIT</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Drag to look around, scroll to zoom. Heights are exaggerated.</div>
        </div>
        <ReadoutPanel o={o} months={shownMonths} />
        {(width === null || width >= MIN_SIDE_WIDTH) && <SidePanel o={o} />}
        <OrbitCards options={view.options} selectedId={view.selectedId} onPick={pick} />
        <StepButtons overlay />
      </div>
    </>
  )
}

export function OrbitScreen() {
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
