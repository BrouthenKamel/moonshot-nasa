import { useEffect, useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useAgencyStore } from '../../state/agencyStore'
import { BaseMap, type BuildingLabel } from '../../scene/BaseMap'
import {
  agencyEvents,
  buildings,
  missionsInFlight,
  mockMissionViews,
  monthlyIncome,
  monthlySpending,
  type AgencyEvent,
  type BuildingId,
  type MissionStatus,
  type MissionView,
  type Speed,
  researchLabLevel,
} from '../../data/agency'
import type { SimState } from '../../sim/types'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { isSimComplete } from '../../sim/simulate'
import { buildingForStep, flightFeed, lunarMissionView, missionClockLabel, missionLabels, suggestedStep } from '../../viz/missionMap'
import { EventCard } from '../flight/EventCard'
import { FlightControls } from '../flight/FlightControls'
import { MuteButton } from '../MuteButton'

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Runs the day clock while the base screen is open */
function useAgencyClock() {
  const tick = useAgencyStore((s) => s.tick)
  useEffect(() => {
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const seconds = Math.min(1, (now - last) / 1000) // no big jumps after the tab sleeps
      last = now
      tick(seconds)
    }, 100)
    return () => window.clearInterval(id)
  }, [tick])
}

const money = (m: number) => `$${m.toFixed(1)}M`

/* ------------------------------------------------------------------ */
/* The flight on the map: status, event card and turn buttons           */
/* (all numbers from the logic core's flight state)                    */
/* ------------------------------------------------------------------ */

const PHASE_TEXT: Record<SimState['phase'], string> = {
  build: 'Building in the Factory',
  test: 'Testing',
  wait: 'Ready, waiting for the ride',
  transfer: 'On the way to the Moon',
  capture: 'Capture burn',
  orbit: 'Mapping the south pole',
  complete: 'Mission over',
  failed: 'Mission lost',
}

function FlightOverlay({ sim }: { sim: SimState }) {
  const f = sim.flight
  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 rounded-xl bg-[#14213d]/90 px-3 py-2 text-xs text-white shadow-lg">
        <div className="font-display text-sm font-bold">
          🛰️ Lunar Ice Mapper · {missionClockLabel(sim.currentTurn)}
        </div>
        <div className="text-slate-300">{PHASE_TEXT[sim.phase]}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 tabular-nums text-slate-200">
          <span>Ice {f.coverage.toFixed(1)}%</span>
          <span>Data {f.data.toFixed(0)} MB</span>
          <span>Δv {Math.max(0, f.dvLeft).toFixed(0)} m/s</span>
          <span>
            {f.main.toFixed(1)} M + {Math.max(0, f.reserve).toFixed(1)} M
          </span>
        </div>
      </div>
      {sim.pendingDecision && (
        <div className="absolute left-1/2 top-1/2 w-[min(92%,520px)] -translate-x-1/2 -translate-y-1/2">
          <EventCard />
        </div>
      )}
      <div className="absolute bottom-10 left-1/2 w-[min(92%,520px)] -translate-x-1/2">
        <FlightControls compact />
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

function SpeedButton({ speed, current, label, title }: { speed: Speed; current: Speed; label: string; title: string }) {
  const setSpeed = useAgencyStore((s) => s.setSpeed)
  const active = speed === current
  return (
    <button
      onClick={() => setSpeed(speed)}
      title={title}
      aria-pressed={active}
      className={`flex h-8 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors ${
        active ? 'bg-orange-500 text-white' : 'text-slate-200 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

function TopBar({ netPerMonth }: { netPerMonth: number }) {
  const day = useAgencyStore((s) => s.day)
  const speed = useAgencyStore((s) => s.speed)
  const funds = useAgencyStore((s) => s.funds)
  const support = useAgencyStore((s) => s.support)
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-[#14213d] px-4 py-2 text-white shadow-lg">
      <div className="flex items-center gap-2">
        <span className="text-3xl leading-none">🌙</span>
        <span className="text-left leading-none">
          <span className="block font-display text-2xl font-bold tracking-wide">MOONSHOT</span>
          <span className="block text-[10px] tracking-[0.35em] text-slate-300">SPACE AGENCY</span>
        </span>
      </div>

      <div className="hidden h-10 w-px bg-white/20 sm:block" />

      <div className="leading-tight">
        <div className="font-display text-xl font-bold tabular-nums">DAY {Math.floor(day)}</div>
        <div className="text-[11px] text-slate-300">Month {Math.floor(day / 30) + 1}</div>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-white/20 bg-white/5 p-1">
        <SpeedButton speed="paused" current={speed} label="❚❚" title="Pause" />
        <SpeedButton speed="normal" current={speed} label="▶" title="Play: 1 day per second" />
        <SpeedButton speed="fast" current={speed} label="▶▶" title="Fast: 8 days per second" />
      </div>

      <MuteButton />

      <div className="ml-auto flex flex-wrap gap-3">
        <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-1.5">
          <div className="text-[10px] font-semibold tracking-wider text-slate-300">PUBLIC SUPPORT</div>
          <div className="font-display text-xl font-bold tabular-nums">👥 {support.toFixed(0)}%</div>
        </div>
        <div className="rounded-xl border border-white/20 bg-white/5 px-4 py-1.5">
          <div className="text-[10px] font-semibold tracking-wider text-slate-300">FUNDS</div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl font-bold tabular-nums">💰 {money(funds)}</span>
            <span className={`text-xs ${netPerMonth >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {netPerMonth >= 0 ? '+' : ''}
              {netPerMonth.toFixed(2)}/mo
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Left: agency dashboard                                              */
/* ------------------------------------------------------------------ */

function FundsTrend() {
  const history = useAgencyStore((s) => s.fundsHistory)
  const day = useAgencyStore((s) => s.day)
  const funds = useAgencyStore((s) => s.funds)

  const { path, area, minF, maxF, firstDay } = useMemo(() => {
    const pts = [...history.filter((p) => p.day >= day - 120), { day, funds }]
    const minF = Math.min(...pts.map((p) => p.funds)) - 0.5
    const maxF = Math.max(...pts.map((p) => p.funds)) + 0.5
    const firstDay = pts[0].day
    const spanD = Math.max(1, day - firstDay)
    const xy = pts.map((p) => [((p.day - firstDay) / spanD) * 200, 60 - ((p.funds - minF) / (maxF - minF)) * 56])
    const path = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    const area = `${path} L200,62 L0,62 Z`
    return { path, area, minF, maxF, firstDay }
  }, [history, day, funds])

  return (
    <div>
      <svg viewBox="0 0 200 64" className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label="Funds over the last 120 days">
        <path d={area} fill="#2bb3a3" opacity={0.18} />
        <path d={path} fill="none" stroke="#1a9e8f" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>Day {Math.floor(firstDay)}</span>
        <span>
          {money(minF + 0.5)} – {money(maxF - 0.5)}
        </span>
        <span>Today</span>
      </div>
    </div>
  )
}

const toneStyle: Record<AgencyEvent['tone'], string> = {
  info: 'bg-sky-500',
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  bad: 'bg-red-500',
}

function effectText(e: AgencyEvent) {
  const parts: string[] = []
  if (e.fundsDelta) parts.push(`${e.fundsDelta > 0 ? '+' : ''}$${e.fundsDelta}M`)
  if (e.supportDelta) parts.push(`${e.supportDelta > 0 ? '+' : ''}${e.supportDelta}% support`)
  return parts.join(' · ')
}

function Dashboard({
  income,
  spending,
  missionFeed,
}: {
  income: number
  spending: number
  /** The Lunar Ice Mapper's flight log on the base calendar */
  missionFeed: AgencyEvent[]
}) {
  const day = useAgencyStore((s) => Math.floor(s.day))
  const funds = useAgencyStore((s) => s.funds)
  const support = useAgencyStore((s) => s.support)
  const lunarStartedDay = useAgencyStore((s) => s.lunarMissionStartedDay)
  const resetDemo = useGameStore((s) => s.resetDemo)

  const feed = useMemo(() => {
    const items: AgencyEvent[] = [...agencyEvents.filter((e) => e.day <= day), ...missionFeed]
    if (lunarStartedDay !== null && lunarStartedDay <= day) {
      items.push({
        id: 'lim-start',
        day: lunarStartedDay,
        title: 'Lunar Ice Mapper planning started',
        detail: 'Mission brief accepted: 6U CubeSat to the lunar south pole',
        tone: 'info',
      })
    }
    return items.sort((a, b) => b.day - a.day)
  }, [day, lunarStartedDay, missionFeed])

  const upcoming = agencyEvents.filter((e) => e.day > day).slice(0, 3)

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl bg-[#fbf7ef] p-3 text-slate-800 shadow-xl">
      <h2 className="font-display text-xl font-bold">Agency dashboard</h2>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <div className="text-[10px] text-slate-500">Funds</div>
          <div className="font-display text-base font-bold tabular-nums">{money(funds)}</div>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm" title={`Income ${money(income)}/mo, spending ${money(spending)}/mo`}>
          <div className="text-[10px] text-slate-500">Income</div>
          <div className="font-display text-base font-bold tabular-nums text-emerald-700">+{income.toFixed(2)}</div>
          <div className="text-[10px] text-slate-500">−{spending.toFixed(2)} /mo</div>
        </div>
        <div className="rounded-xl bg-white p-2 shadow-sm">
          <div className="text-[10px] text-slate-500">Support</div>
          <div className="font-display text-base font-bold tabular-nums">{support.toFixed(0)}%</div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-2 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Funding trend</div>
        <FundsTrend />
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-white p-2 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Activity</div>
          <span className="text-[10px] text-slate-400">{feed.length} events</span>
        </div>
        <ul className="mt-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {feed.map((e, i) => (
            <li key={e.id} className={`flex gap-2 rounded-lg p-1.5 ${i === 0 ? 'bg-orange-50' : ''}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneStyle[e.tone]}`} />
              <div className="min-w-0 text-xs">
                <div className="font-semibold text-slate-800">
                  {e.title}
                  <span className="ml-1 font-normal text-slate-400">· Day {e.day}</span>
                </div>
                {e.detail && <div className="text-slate-500">{e.detail}</div>}
                {effectText(e) && <div className="font-medium text-emerald-700">{effectText(e)}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl bg-white p-2 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Upcoming</div>
        <ul className="mt-1 space-y-1 text-xs">
          {upcoming.length === 0 && <li className="text-slate-400">Nothing scheduled</li>}
          {upcoming.map((e) => (
            <li key={e.id} className="flex justify-between gap-2">
              <span className="truncate">{e.title}</span>
              <span className="shrink-0 tabular-nums text-slate-500">in {Math.ceil(e.day - day)} d</span>
            </li>
          ))}
        </ul>
      </div>

      <button onClick={resetDemo} className="self-start text-[11px] text-slate-400 underline hover:text-slate-600">
        Reset demo to day 112
      </button>
    </aside>
  )
}

/* ------------------------------------------------------------------ */
/* Right: missions                                                     */
/* ------------------------------------------------------------------ */

const statusStyle: Record<MissionStatus, { label: string; pill: string; bar: string }> = {
  planning: { label: 'Planning', pill: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500' },
  building: { label: 'Building', pill: 'bg-teal-100 text-teal-700', bar: 'bg-teal-500' },
  transfer: { label: 'Transfer', pill: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
  'in-orbit': { label: 'In orbit', pill: 'bg-sky-100 text-sky-700', bar: 'bg-sky-500' },
  complete: { label: 'Complete', pill: 'bg-slate-200 text-slate-600', bar: 'bg-slate-400' },
  failed: { label: 'Failed', pill: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
}

const kindIcon: Record<MissionView['kind'], string> = {
  cubesat: '🛰️',
  satellite: '🌍',
  relay: '📡',
  probe: '☀️',
}

function MissionCard({ mission, onOpen }: { mission: MissionView; onOpen?: () => void }) {
  const style = statusStyle[mission.status]
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{kindIcon[mission.kind]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-base font-bold">{mission.name}</span>
            {mission.isReal && <span className="text-slate-400">›</span>}
          </div>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.pill}`}>
            {style.label}
          </span>
          <div className="mt-1 truncate text-[11px] text-slate-500">{mission.detail}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.round(mission.progress * 100)}%` }} />
        </div>
        <span className="w-9 text-right text-xs tabular-nums text-slate-600">{Math.round(mission.progress * 100)}%</span>
      </div>
    </>
  )

  if (onOpen) {
    return (
      <button
        onClick={onOpen}
        className="w-full rounded-xl border-2 border-teal-400 bg-white p-3 text-left shadow-sm transition hover:shadow-md"
        title="Open this mission's planning"
      >
        {content}
      </button>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" title="Example mission (not playable in the MVP)">
      {content}
    </div>
  )
}

function Missions({ views }: { views: MissionView[] }) {
  const setScreen = useGameStore((s) => s.setScreen)
  const startNewMission = useGameStore((s) => s.startNewMission)
  const simState = useGameStore((s) => s.simState)
  const currentReport = useGameStore((s) => s.currentReport)
  const markStarted = useAgencyStore((s) => s.markLunarMissionStarted)
  const lunarStartedDay = useAgencyStore((s) => s.lunarMissionStartedDay)

  const openBuilding = useGameStore((s) => s.openBuilding)
  const visitedSteps = useGameStore((s) => s.visitedSteps)

  // The map is the menu: the card opens the report when the flight is over,
  // or walks into the building whose step is due next while planning
  const openReal = () => {
    if (currentReport && simState && isSimComplete(simState)) setScreen('report')
    else if (!simState) openBuilding(buildingForStep(suggestedStep(visitedSteps)))
  }

  const newMission = () => {
    if (
      lunarStartedDay !== null &&
      !window.confirm('Start a new Lunar Ice Mapper plan? The plan in progress will be replaced.')
    ) {
      return
    }
    markStarted()
    startNewMission()
  }

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-2xl bg-[#fbf7ef] p-3 text-slate-800 shadow-xl">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-xl font-bold">Missions</h2>
        <span className="rounded-full bg-orange-500 px-2 text-sm font-bold text-white">{views.length}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {views.map((m) => (
          <MissionCard key={m.id} mission={m} onOpen={m.isReal ? openReal : undefined} />
        ))}
      </div>

      <button
        onClick={newMission}
        className="rounded-xl bg-orange-500 py-3 font-display text-lg font-bold text-white shadow-md transition hover:bg-orange-400 active:translate-y-px"
      >
        + New mission
      </button>
      <p className="text-center text-[11px] text-slate-500">Plan the Lunar Ice Mapper by walking into the buildings</p>
    </aside>
  )
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function BaseScreen() {
  useAgencyClock()

  // Whole days only: the map and mission cards re-render once per game day
  const day = useAgencyStore((s) => Math.floor(s.day))
  const support = useAgencyStore((s) => s.support)
  const lunarStartedDay = useAgencyStore((s) => s.lunarMissionStartedDay)
  const missionStartDay = useAgencyStore((s) => s.missionStartDay)
  const markStarted = useAgencyStore((s) => s.markLunarMissionStarted)
  const syncToMissionTurn = useAgencyStore((s) => s.syncToMissionTurn)
  const resetMissionClock = useAgencyStore((s) => s.resetMissionClock)
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const simState = useGameStore((s) => s.simState)
  const openBuilding = useGameStore((s) => s.openBuilding)
  const startNewMission = useGameStore((s) => s.startNewMission)

  // One clock: once the flight runs, the base day follows its turns
  const turn = simState?.currentTurn
  useEffect(() => {
    if (turn !== undefined) syncToMissionTurn(turn)
  }, [turn, syncToMissionTurn])
  // The flight is saved and survives a reload; only a save from before that has a mission
  // clock without a flight: fall back to the free-running clock
  useEffect(() => {
    if (missionStartDay !== null && !simState) resetMissionClock()
  }, [missionStartDay, simState, resetMissionClock])

  const budgets = computeBudgets(design, difficulty)
  const checks = goNoGo(design, budgets, day)

  const mockViews = mockMissionViews(day)
  const views =
    lunarStartedDay !== null
      ? [lunarMissionView({ design, budgets, visited: visitedSteps, sim: simState }), ...mockViews]
      : mockViews
  const missionFeed = useMemo(
    () => (simState && missionStartDay !== null ? flightFeed(simState.turnLogs, missionStartDay) : []),
    [simState, missionStartDay]
  )

  const flying = missionsInFlight(mockViews)
  const income = monthlyIncome(support)
  const spending = monthlySpending(flying)

  // Walking into a building. Before the mission is started, the first visit starts it.
  // While the craft flies, the design is fixed and the buildings only show its state.
  const onBuildingClick = simState
    ? undefined
    : (id: BuildingId) => {
        if (lunarStartedDay === null) {
          markStarted()
          startNewMission()
        }
        openBuilding(id)
      }

  const mockLabels = (() => {
    const lab = buildings.find((b) => b.id === 'research-lab')!
    const up = lab.upgrade!
    const labLevel = researchLabLevel(day)
    const upgrading = labLevel < up.toLevel
    const out: Record<BuildingId, BuildingLabel> = {
      'research-lab': upgrading
        ? {
            level: labLevel,
            status: `Upgrading to LV ${up.toLevel} · ${Math.ceil(up.endDay - day)} days left`,
            progress: (day - up.startDay) / (up.endDay - up.startDay),
            highlight: true,
          }
        : { level: labLevel, status: 'Neutron spectrometer unlocked' },
      factory:
        lunarStartedDay !== null && !simState
          ? { level: 1, status: 'Reserved for Lunar Ice Mapper', highlight: true }
          : { level: 1, status: 'Idle · ready to build a 6U' },
      'launch-site': {
        level: 1,
        status: 'Lunar rideshares: turn 6, 8 or 10 of a mission',
      },
      'comms-center': { level: 1, status: `Tracking ${flying} mission${flying === 1 ? '' : 's'} · 21 m dish` },
    }
    return out
  })()
  const labels =
    lunarStartedDay !== null
      ? missionLabels({ design, budgets, checks, visited: visitedSteps, sim: simState, day })
      : mockLabels

  return (
    <div className="flex min-h-screen flex-col bg-[#14213d] lg:h-screen lg:min-h-0">
      <TopBar netPerMonth={income - spending} />
      <div className="flex flex-1 flex-col gap-3 p-3 lg:grid lg:min-h-0 lg:grid-cols-[290px_minmax(0,1fr)_290px]">
        <div className="order-2 min-h-0 lg:order-1 lg:flex lg:flex-col">
          <Dashboard income={income} spending={spending} missionFeed={missionFeed} />
        </div>
        <div className="relative order-1 h-[60vh] min-h-[360px] overflow-hidden rounded-2xl shadow-inner lg:order-2 lg:h-auto">
          <BaseMap labels={labels} onBuildingClick={onBuildingClick} />
          {simState && <FlightOverlay sim={simState} />}
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/30 px-2 py-1 text-[11px] text-white">
            {simState ? 'Drag to move · scroll to zoom' : 'Click a building to walk in · drag to move · scroll to zoom'}
          </div>
        </div>
        <div className="order-3 min-h-0 lg:flex lg:flex-col">
          <Missions views={views} />
        </div>
      </div>
    </div>
  )
}
