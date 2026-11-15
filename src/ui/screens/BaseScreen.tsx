import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { BaseMap } from '../../scene/BaseMap'
import type { BuildingId } from '../../data/agency'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { isSimComplete } from '../../sim/simulate'
import {
  BUILDING_STEPS,
  flightFeed,
  missionClockLabel,
  missionLabels,
  missionMonth,
  missionStatus,
  type MissionLogEntry,
} from '../../viz/missionMap'
import { FlightStage, useSpaceShowing } from '../flight/FlightStage'
import { AudioControls } from '../kit/AudioControls'
import { useUiStore } from '../../state/uiStore'
import {
  AgencyClock,
  AgencyWallet,
  CampaignDialog,
  MissionPanel,
  MissionResultDialog,
  NewMissionDialog,
  Notifications,
  useAgencyClock,
  useCampaignProgress,
} from '../agency/AgencyPanels'
import { useWorldStore } from '../../state/worldStore'

/*
 * The agency base. The map is the menu: walk into a building to plan the mission, and the flight
 * plays here. Top bar: agency clock, mission month, funds, popularity. Right: the current mission
 * and its log, with New mission (one mission at a time). Left: notifications. Headquarters opens
 * the campaign. The agency parts are in src/ui/agency/AgencyPanels.tsx, fed by
 * src/state/worldStore.ts (rules in src/game).
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
/* Top bar: agency clock, mission month, funds, popularity, start over, sound */
/* ------------------------------------------------------------------ */

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

function TopBar({ month }: { month: number }) {
  const startNewMission = useGameStore((s) => s.startNewMission)
  const [confirming, setConfirming] = useState(false)
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-[#14213d] px-4 py-2 text-white shadow-lg">
      <div className="flex items-center gap-2">
        <span className="text-3xl leading-none">🌙</span>
        <span className="block font-display text-2xl font-bold leading-none tracking-wide">MOONSHOT</span>
      </div>

      <div className="hidden h-10 w-px bg-white/20 sm:block" />

      <AgencyClock />

      <div className="leading-tight" title="The mission clock: month 0 when the mission starts">
        <div className="text-[10px] font-semibold tracking-wider text-slate-300">MISSION</div>
        <div className="font-display text-xl font-bold tabular-nums">Month {month}</div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <AgencyWallet />
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
  const reviseAt = useGameStore((s) => s.reviseAt)
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

  // The agency: its clock runs while the base is open; one mission at a time
  useAgencyClock()
  const spaceShowing = useSpaceShowing(simState)
  const missionOpen = useWorldStore((s) => s.missionOpen) || !!simState || visitedSteps.length > 0
  const openMission = useWorldStore((s) => s.openMission)
  const startNewMission = useGameStore((s) => s.startNewMission)
  const [dialog, setDialog] = useState<'new-mission' | 'campaign' | null>(null)
  const campaignProgress = useCampaignProgress()
  const hq = useMemo(() => ({ ...campaignProgress, onClick: () => setDialog('campaign') }), [campaignProgress])
  const startMission = () => {
    // A finished flight goes to the history; the new mission starts at the Comms Center
    if (simState) startNewMission()
    openMission()
    setDialog(null)
  }

  // Walking into a building. While the craft flies, the design is fixed and the buildings only show its state.
  // After the flight, a building opens its step to revise the design and fly again.
  // With no mission chosen yet, a building asks for one first.
  const flying = !!simState && !isSimComplete(simState)
  const onBuildingClick = flying
    ? undefined
    : !missionOpen
      ? () => setDialog('new-mission')
      : (id: BuildingId) => (simState ? reviseAt(BUILDING_STEPS[id][0]) : openBuilding(id))

  return (
    <div className="flex min-h-screen flex-col bg-[#14213d] lg:h-screen lg:min-h-0">
      <TopBar month={missionMonth(simState)} />
      {/* Wide screens: the map fills the area and both dashboards float over its edges. Phones: stacked. */}
      <div className="relative flex flex-1 flex-col gap-3 p-3 lg:block lg:min-h-0">
        <div className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-2xl shadow-inner lg:absolute lg:inset-3 lg:h-auto lg:min-h-0">
          {simState ? (
            <FlightStage
              sim={simState}
              island={<BaseMap labels={labels} onBuildingClick={onBuildingClick} launchAt={launchAt} rocketGone={rocketGone} hq={hq} />}
            />
          ) : (
            <BaseMap labels={labels} onBuildingClick={onBuildingClick} hq={hq} />
          )}
          {!spaceShowing && (
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/30 px-2 py-1 text-[11px] text-white lg:left-1/2 lg:-translate-x-1/2">
              {onBuildingClick ? 'Click a building to walk in · drag to move · scroll to zoom' : 'Drag to move · scroll to zoom'}
            </div>
          )}
        </div>
        {/* The space view has the whole map: no side panels, only its own Back to agency */}
        {!spaceShowing && (
          <>
            {/* Left: notifications */}
            <div className="flex min-h-0 flex-col lg:pointer-events-none lg:absolute lg:bottom-6 lg:left-6 lg:top-6 lg:z-10 lg:w-72">
              <div className="flex min-h-0 flex-col lg:pointer-events-auto">
                <Notifications />
              </div>
            </div>
            {/* Right: the current mission and its log */}
            <div className="flex min-h-0 flex-col lg:pointer-events-none lg:absolute lg:bottom-6 lg:right-6 lg:top-6 lg:z-10 lg:w-80">
              <div className="flex min-h-0 flex-col lg:pointer-events-auto">
                <MissionPanel
                  status={status}
                  onOpenStatus={onOpenStatus}
                  log={logEntries}
                  sim={simState}
                  missionOpen={missionOpen}
                  onNewMission={() => setDialog('new-mission')}
                />
              </div>
            </div>
          </>
        )}
      </div>
      {dialog === 'new-mission' && <NewMissionDialog onClose={() => setDialog(null)} onStart={startMission} />}
      {dialog === 'campaign' && <CampaignDialog onClose={() => setDialog(null)} />}
      <MissionResultDialog sim={simState} onReport={currentReport ? () => showReport() : undefined} onNewMission={() => setDialog('new-mission')} />
    </div>
  )
}
