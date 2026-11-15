import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { BaseMap } from '../../scene/BaseMap'
import { quietLabels } from '../../scene/mapCues'
import type { BuildingId } from '../../data/agency'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { isSimComplete } from '../../sim/simulate'
import {
  BUILDING_STEPS,
  flightFeed,
  missionClockLabel,
  missionLabels,
  missionStatus,
  type MissionLogEntry,
} from '../../viz/missionMap'
import { FlightStage, useSpaceShowing } from '../flight/FlightStage'
import { AudioControls } from '../kit/AudioControls'
import { EngineerSwitch } from '../kit/EngineerSwitch'
import { Sheet } from '../kit'
import { useUiStore } from '../../state/uiStore'
import { newsDrawerOpen } from '../agency/newsDrawer'
import {
  AgencyClock,
  AgencyWallet,
  MissionPanel,
  MissionResultDialog,
  Notifications,
  useAgencyClock,
  useCampaignProgress,
  useRealNews,
} from '../agency/AgencyPanels'
import { useWorldStore } from '../../state/worldStore'
import { useCampaignStore } from '../../state/campaignStore'
import { CampaignLayer } from '../campaign/CampaignLayer'

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

const toneRule: Record<MissionLogEntry['tone'], string> = {
  info: 'border-l-rule-strong',
  good: 'border-l-go',
  warning: 'border-l-caution',
  bad: 'border-l-nogo',
}

export function MissionLog({ entries }: { entries: MissionLogEntry[] }) {
  return (
    <Sheet as="aside" tone="inset" aria-label="Mission log" className="flex max-h-[40vh] min-h-0 flex-col p-3 text-paper lg:max-h-none">
      <h2 className="fp-label border-b border-rule pb-1">Mission log</h2>
      {entries.length === 0 ? (
        <p className="mt-1 text-xs text-paper-faint">Nothing yet. Advance a month to start the flight.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
          {entries.map((e, i) => (
            <li key={e.id} className={`border-b border-l-[3px] border-b-rule py-1 pl-2 text-xs ${toneRule[e.tone]} ${i === 0 ? 'bg-ink-2' : ''}`}>
              <div className="fp-data text-[10px] text-paper-faint">{missionClockLabel(e.month)}</div>
              <div className="text-paper">{e.title}</div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Top bar: a flight-plan title block. Agency clock, mission month,    */
/* funds, popularity, start over, view and sound                       */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/80 p-4" onClick={onCancel}>
      <Sheet
        tone="raised"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-over-title"
        className="w-full max-w-sm border-t-2 border-t-caution p-5 text-paper"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <h2 id="start-over-title" className="fp-display text-lg text-paper">
          Start over?
        </h2>
        <p className="mt-2 text-sm text-paper-dim">
          The Lunar Ice Mapper goes back to month 0 with a fresh design. Your choices and any flight in progress are
          cleared. Reports of finished missions stay in the history.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="fp-btn-ghost">
            Keep going
          </button>
          <button type="button" onClick={onConfirm} className="fp-btn-primary">
            Start over
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function TopBar() {
  const startNewMission = useGameStore((s) => s.startNewMission)
  const [confirming, setConfirming] = useState(false)
  return (
    <header className="flex flex-wrap items-stretch gap-x-4 gap-y-2 border-b border-rule bg-ink-1 px-4 py-2 text-paper">
      <div className="flex items-center gap-2.5 pr-1">
        <span className="h-6 w-1 shrink-0 bg-kapton" aria-hidden="true" />
        <span className="block fp-display text-xl leading-none text-paper">MOONSHOT</span>
      </div>

      <AgencyClock />

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <AgencyWallet />
        <EngineerSwitch />
        <AudioControls onStartOver={() => setConfirming(true)} />
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
  // A flight's progress follows the craft that is flying, not the design on the drawing board
  const status = missionStatus({ budgets: simState ? computeBudgets(simState.design, simState.difficulty) : budgets, visited: visitedSteps, sim: simState })
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
  // The campaign: New mission and Headquarters both open the ladder (src/ui/campaign)
  const openLadder = useCampaignStore((s) => s.openLadder)
  const campaignProgress = useCampaignProgress()
  const hq = useMemo(() => ({ ...campaignProgress, onClick: openLadder }), [campaignProgress, openLadder])
  // A fresh base has one start: New mission. No building rings and the notifications folded
  // to a badge until a mission is chosen, so nothing competes with it.
  const mapLabels = missionOpen ? labels : quietLabels(labels)
  const [newsOpen, setNewsOpen] = useState(false)
  const showNews = newsDrawerOpen({ openedByPlayer: newsOpen, decisionWaiting: !!simState?.pendingDecision })
  const hasNews = useRealNews().length > 0

  // Walking into a building. While the craft flies, the design is fixed and the buildings only show its state.
  // After the flight, a building opens its step to revise the design and fly again.
  // With no mission chosen yet, a building asks for one first.
  const flying = !!simState && !isSimComplete(simState)
  const onBuildingClick = flying
    ? undefined
    : !missionOpen
      ? () => openLadder()
      : (id: BuildingId) => (simState ? reviseAt(BUILDING_STEPS[id][0]) : openBuilding(id))

  return (
    <div className="flex min-h-screen flex-col bg-ink-0 lg:h-screen lg:min-h-0">
      <TopBar />
      {/* Wide screens: the map fills the area and both dashboards float over its edges. Phones: stacked. */}
      <div className="relative flex flex-1 flex-col gap-3 p-3 lg:block lg:min-h-0">
        <div className="relative h-[60vh] min-h-[360px] overflow-hidden border border-rule lg:absolute lg:inset-3 lg:h-auto lg:min-h-0">
          {simState ? (
            <FlightStage
              sim={simState}
              island={<BaseMap labels={mapLabels} onBuildingClick={onBuildingClick} launchAt={launchAt} rocketGone={rocketGone} hq={hq} />}
            />
          ) : (
            <BaseMap labels={mapLabels} onBuildingClick={onBuildingClick} hq={hq} />
          )}
        </div>
        {/* The space view has the whole map: no side panels, only its own Back to agency */}
        {!spaceShowing && (
          <>
            {/* Left: what really happened (no events, no panel) */}
            {hasNews && (
              <div className="flex min-h-0 flex-col lg:pointer-events-none lg:absolute lg:bottom-6 lg:left-6 lg:top-6 lg:z-10 lg:w-72">
                <div className="flex min-h-0 flex-col lg:pointer-events-auto">
                  {showNews ? (
                    <Notifications onHide={() => setNewsOpen(false)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNewsOpen(true)}
                      aria-expanded={false}
                      className="fp-label self-start border border-rule-strong bg-ink-1/95 px-3 py-2 text-paper-dim hover:text-paper"
                    >
                      Notifications ▸
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* Right: the current mission and its log. With no mission yet it comes first on a narrow screen, so the one start is never below the fold. */}
            <div
              className={`flex min-h-0 flex-col lg:pointer-events-none lg:absolute lg:bottom-6 lg:right-6 lg:top-6 lg:z-10 lg:w-80 ${
                missionOpen ? '' : 'max-lg:order-first'
              }`}
            >
              <div className="relative flex min-h-0 flex-col lg:pointer-events-auto">
                {!missionOpen && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 z-10 ring-2 ring-kapton shadow-[0_0_14px_rgba(232,163,61,0.45)] motion-safe:animate-pulse"
                  />
                )}
                <MissionPanel
                  status={status}
                  onOpenStatus={onOpenStatus}
                  log={logEntries}
                  sim={simState}
                  missionOpen={missionOpen}
                  onNewMission={openLadder}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <MissionResultDialog sim={simState} onReport={currentReport ? () => showReport() : undefined} onNewMission={openLadder} />
      <CampaignLayer />
    </div>
  )
}
