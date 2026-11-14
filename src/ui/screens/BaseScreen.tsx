import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { BaseMap } from '../../scene/BaseMap'
import type { BuildingId } from '../../data/agency'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import {
  STAGE_NAMES,
  flightFeed,
  missionClockLabel,
  missionLabels,
  missionMonth,
  missionStatus,
  type MissionLogEntry,
  type MissionStage,
  type MissionStatusView,
} from '../../viz/missionMap'
import { FlightStage } from '../flight/FlightStage'
import { AudioControls } from '../kit/AudioControls'
import { useUiStore } from '../../state/uiStore'
import { AgencyDashboard, AgencyWallet } from '../agency/AgencyPanels'

/*
 * The base screen of the MVP: one mission, the Lunar Ice Mapper (docs/DESIGN-DIRECTION.md, 1a).
 * The map is the menu; the top bar holds the mission month and the mission's status.
 * The agency layer (money, popularity, mission money, research, news) sits on top of it:
 * src/ui/agency/AgencyPanels.tsx, fed by src/state/worldStore.ts, which only listens to the mission.
 * No agency calendar, building levels, build plots or missions list.
 */

/* ------------------------------------------------------------------ */
/* The flight on the map: status, event card and month buttons         */
/* (all numbers from the logic core's flight state)                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Mission log: the flight's own events, by month                      */
/* ------------------------------------------------------------------ */

const toneDot: Record<MissionLogEntry['tone'], string> = {
  info: 'bg-sky-500',
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  bad: 'bg-red-500',
}

export function MissionLog({ entries }: { entries: MissionLogEntry[] }) {
  return (
    <aside
      aria-label="Mission log"
      className="flex max-h-[40vh] min-h-0 flex-col rounded-2xl bg-[#fbf7ef] p-3 text-slate-800 shadow-xl lg:max-h-none"
    >
      <h2 className="font-display text-lg font-bold">Mission log</h2>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">Nothing yet. Advance a month to start the flight.</p>
      ) : (
        <ul className="mt-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <li key={e.id} className={`flex gap-2 rounded-lg p-1.5 ${i === 0 ? 'bg-orange-50' : ''}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[e.tone]}`} />
              <div className="min-w-0 text-xs">
                <div className="font-semibold uppercase tracking-wide text-slate-400">{missionClockLabel(e.month)}</div>
                <div className="text-slate-800">{e.title}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

/* ------------------------------------------------------------------ */
/* Top bar: mission month, mission status, start over, sound           */
/* ------------------------------------------------------------------ */

const stageChip: Record<MissionStage, string> = {
  planning: 'bg-violet-100 text-violet-700',
  building: 'bg-teal-100 text-teal-700',
  transfer: 'bg-orange-100 text-orange-700',
  'in-orbit': 'bg-sky-100 text-sky-700',
  success: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-700',
}

const stageBar: Record<MissionStage, string> = {
  planning: 'bg-violet-400',
  building: 'bg-teal-400',
  transfer: 'bg-orange-400',
  'in-orbit': 'bg-sky-400',
  success: 'bg-emerald-400',
  partial: 'bg-yellow-400',
  failed: 'bg-red-400',
}

function MissionStatusButton({ status, onOpen }: { status: MissionStatusView; onOpen?: () => void }) {
  const pct = Math.round(status.progress * 100)
  const content = (
    <>
      <span className="flex items-center gap-2">
        <span className="font-display text-base font-bold leading-none">Lunar Ice Mapper</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${stageChip[status.stage]}`}>
          {STAGE_NAMES[status.stage]}
        </span>
      </span>
      <span className="mt-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{status.next}</span>
        <span
          className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-label="Mission progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className={`block h-full rounded-full ${stageBar[status.stage]}`} style={{ width: `${pct}%` }} />
        </span>
      </span>
    </>
  )
  const box = 'flex min-w-0 max-w-full flex-col rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-left sm:w-[26rem]'
  if (!onOpen) return <div className={box}>{content}</div>
  return (
    <button
      type="button"
      onClick={onOpen}
      title={status.opens === 'report' ? 'Open the mission report' : 'Walk into the next building'}
      className={`${box} transition hover:border-orange-400 hover:bg-white/10`}
    >
      {content}
    </button>
  )
}

/** In-app confirm for "Start over" (not window.confirm) */
export function StartOverDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-over-title"
        className="w-full max-w-sm rounded-2xl bg-[#fbf7ef] p-5 text-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="start-over-title" className="font-display text-xl font-bold">
          Start over?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          The Lunar Ice Mapper goes back to month 0 with a fresh design. Your choices and any flight in progress are
          cleared. Reports of finished missions stay in the history.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
          >
            Keep going
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-400"
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  )
}

function TopBar({ month, status, onOpenStatus }: { month: number; status: MissionStatusView; onOpenStatus?: () => void }) {
  const startNewMission = useGameStore((s) => s.startNewMission)
  const [confirming, setConfirming] = useState(false)
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-[#14213d] px-4 py-2 text-white shadow-lg">
      <div className="flex items-center gap-2">
        <span className="text-3xl leading-none">🌙</span>
        <span className="block font-display text-2xl font-bold leading-none tracking-wide">MOONSHOT</span>
      </div>

      <div className="hidden h-10 w-px bg-white/20 sm:block" />

      <div className="leading-tight" title="The mission clock: month 0 when the mission starts">
        <div className="text-[10px] font-semibold tracking-wider text-slate-300">MISSION</div>
        <div className="font-display text-xl font-bold tabular-nums">Month {month}</div>
      </div>

      <MissionStatusButton status={status} onOpen={onOpenStatus} />

      <AgencyWallet />

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10"
        >
          Start over
        </button>
        <AudioControls tone="navy" />
      </div>

      {confirming && (
        <StartOverDialog
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            startNewMission()
          }}
        />
      )}
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function BaseScreen() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const simState = useGameStore((s) => s.simState)
  const currentReport = useGameStore((s) => s.currentReport)
  const openBuilding = useGameStore((s) => s.openBuilding)
  const showReport = useGameStore((s) => s.showReport)

  const budgets = computeBudgets(design, difficulty)
  const checks = goNoGo(design, budgets)
  const labels = missionLabels({ design, budgets, checks, visited: visitedSteps, sim: simState })
  const status = missionStatus({ budgets, visited: visitedSteps, sim: simState })
  const logEntries = useMemo(() => (simState ? flightFeed(simState.turnLogs) : []), [simState])

  // The status opens the next building while planning, and the report once the flight is over
  const target = status.opens
  const onOpenStatus =
    target === 'report'
      ? currentReport
        ? () => showReport()
        : undefined
      : target
        ? () => openBuilding(target)
        : undefined

  // The rocket on the island's pad: it leaves during the launch and stays gone while the craft flies
  const launchAt = useUiStore((s) => s.launchAt)
  const rocketGone = !!simState && simState.flight.launchedTurn !== null && launchAt === null

  // Walking into a building. While the craft flies, the design is fixed and the buildings only show its state.
  const onBuildingClick = simState ? undefined : (id: BuildingId) => openBuilding(id)

  return (
    <div className="flex min-h-screen flex-col bg-[#14213d] lg:h-screen lg:min-h-0">
      <TopBar month={missionMonth(simState)} status={status} onOpenStatus={onOpenStatus} />
      {/* Wide screens: the map fills the area and both dashboards float over its edges. Phones: stacked. */}
      <div className="relative flex flex-1 flex-col gap-3 p-3 lg:block lg:min-h-0">
        <div className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-2xl shadow-inner lg:absolute lg:inset-3 lg:h-auto lg:min-h-0">
          {simState ? (
            <FlightStage
              sim={simState}
              island={<BaseMap labels={labels} onBuildingClick={onBuildingClick} launchAt={launchAt} rocketGone={rocketGone} />}
            />
          ) : (
            <BaseMap labels={labels} onBuildingClick={onBuildingClick} />
          )}
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/30 px-2 py-1 text-[11px] text-white lg:left-1/2 lg:-translate-x-1/2">
            {simState ? 'Drag to move · scroll to zoom' : 'Click a building to walk in · drag to move · scroll to zoom'}
          </div>
        </div>
        {/* Left: agency. Ends above the narrator's corner. */}
        <div className="flex min-h-0 flex-col lg:pointer-events-none lg:absolute lg:bottom-36 lg:left-6 lg:top-6 lg:z-10 lg:w-72">
          <div className="flex min-h-0 flex-col lg:pointer-events-auto">
            <AgencyDashboard />
          </div>
        </div>
        {/* Right: the flight's mission log */}
        {simState && (
          <div className="flex min-h-0 flex-col lg:pointer-events-none lg:absolute lg:bottom-6 lg:right-6 lg:top-6 lg:z-10 lg:w-72">
            <div className="flex min-h-0 flex-col lg:pointer-events-auto">
              <MissionLog entries={logEntries} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
