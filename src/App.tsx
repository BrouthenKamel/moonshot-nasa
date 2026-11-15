import { Suspense, lazy } from 'react'
import { useGameStore } from './state/gameStore'
import { useViewMode } from './ui/useViewMode'
import { Shell } from './ui/Shell'
import { DesignScreen, BaseScreen } from './ui/screens'
import { Opening } from './ui/Opening'
import { ReportScreen } from './ui/report/ReportScreen'
import { useUiStore } from './state/uiStore'
import { canUseWebGL } from './scene/webgl'
import { useAudioDirector } from './assets/director'
import { audio } from './assets/audio'
import { Captions } from './ui/kit/Captions'
import { InteractionLayer } from './ui/interaction/InteractionLayer'
import { ReplayPanel } from './viz/ReplayPanel'
import { isSimComplete } from './sim/simulate'
import { failedLabel } from './sim/evaluate'
import { computeBudgets } from './sim/budgets'
import { difficultyPresets } from './data/brief'
import { EventCard } from './ui/flight/EventCard'
import { FlightControls } from './ui/flight/FlightControls'
import { Narrator } from './ui/narrator/Narrator'
import { Eng, Flap, Sheet } from './ui/kit'

const PHASE_TEXT: Record<string, string> = {
  build: 'Building',
  test: 'Testing',
  wait: 'Waiting for the ride',
  transfer: 'On the way to the Moon',
  capture: 'Capture burn',
  orbit: 'Mapping in the science orbit',
  complete: 'Mission over',
  failed: 'Mission failed',
}

function SimStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <Sheet tone="raised" className="p-4">
      <div className="fp-label">{label}</div>
      <Flap value={value} className={`mt-1 block text-2xl font-semibold ${tone}`} />
      {sub && <div className="mt-1 fp-data text-xs text-paper-faint">{sub}</div>}
    </Sheet>
  )
}

function SimulationPlaceholder() {
  const simState = useGameStore((s) => s.simState)

  if (!simState) return null

  const complete = isSimComplete(simState)
  const f = simState.flight
  const b = computeBudgets(simState.design, simState.difficulty)
  const dataTarget = difficultyPresets[simState.difficulty]?.dataTarget ?? 300
  const lastNotes = simState.turnLogs[simState.turnLogs.length - 1]?.notes ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="hud-step-header p-6">
        <div className="fp-label text-[var(--role-accent)]">Flight operations · Lunar Ice Mapper · Live telemetry</div>
        <h1 className="mt-1 fp-display text-2xl text-paper">Mission Simulation</h1>
        <p className="mt-2 fp-data text-sm text-paper-dim">
          Month {simState.currentTurn}: {simState.phase === 'failed' ? failedLabel(simState.flight.end) : (PHASE_TEXT[simState.phase] ?? simState.phase)}
          {simState.phase === 'build' || simState.phase === 'test' || simState.phase === 'wait'
            ? `. The ride leaves in month ${f.launchTurn}.`
            : ''}
        </p>
        {lastNotes.length > 0 && <p className="mt-1.5 text-sm text-paper-dim">{lastNotes.join(' ')}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SimStat
          label="Ice mapped (data home)"
          value={`${simState.coveragePercent.toFixed(1)}%`}
          sub="need 70%"
          tone={simState.coveragePercent >= 70 ? 'text-ice' : 'text-ice/70'}
        />
        <SimStat
          label="Science data home"
          value={`${simState.totalDataReturned.toFixed(0)} MB`}
          sub={`need ${dataTarget} MB${f.science.stored >= 1 ? `, ${f.science.stored.toFixed(0)} MB waiting on board` : ''}`}
          tone={simState.totalDataReturned >= dataTarget ? 'text-go' : 'text-paper'}
        />
        <SimStat
          label="Months in orbit"
          value={`${simState.turnsInOrbit}`}
          sub="need 12"
          tone={simState.turnsInOrbit >= 12 ? 'text-go' : 'text-paper'}
        />
        <Eng className="contents">
          <SimStat
            label="Delta-v left"
            value={`${Math.max(0, simState.fuelRemaining).toFixed(0)} m/s`}
            sub={f.captured ? `${b.deltaVStationKeeping} m/s a month to hold the orbit` : `capture needs ${(b.captureDeltaV ?? 0).toFixed(0)} m/s`}
            tone="text-paper"
          />
          <SimStat label="Money" value={`${f.main.toFixed(1)} M`} sub="main budget" tone="text-paper" />
          <SimStat
            label="Reserve"
            value={`${f.reserve.toFixed(1)} M`}
            sub={f.reserve < 0 ? 'overdrawn' : 'pays for fixes and overruns'}
            tone={f.reserve < 0 ? 'text-nogo' : 'text-paper'}
          />
        </Eng>
      </div>

      <EventCard />

      <ReplayPanel
        design={simState.design}
        logs={simState.turnLogs}
        terminal={complete ? (simState.phase === 'failed' ? 'failed' : 'complete') : undefined}
        compact
      />

      <FlightControls />
    </div>
  )
}

function ReplayScreen() {
  const simState = useGameStore((s) => s.simState)
  const runHistory = useGameStore((s) => s.runHistory)
  const replayEntryId = useGameStore((s) => s.replayEntryId)
  const showReport = useGameStore((s) => s.showReport)

  let content: React.ReactNode = <div className="fp-label">Nothing to replay.</div>
  if (replayEntryId) {
    const entry = runHistory.find((r) => r.id === replayEntryId)
    if (entry?.run) {
      content = (
        <ReplayPanel
          design={entry.report.design}
          logs={entry.run.turnLogs}
          terminal={entry.report.outcome === 'failed' ? 'failed' : 'complete'}
        />
      )
    }
  } else if (simState && simState.turnLogs.length > 0) {
    content = (
      <ReplayPanel
        design={simState.design}
        logs={simState.turnLogs}
        terminal={
          isSimComplete(simState) ? (simState.phase === 'failed' ? 'failed' : 'complete') : undefined
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="hud-step-header flex items-center justify-between gap-4 p-4">
        <div>
          <div className="fp-label text-kapton">Flight archive · Lunar Ice Mapper · Replay</div>
          <h1 className="mt-0.5 fp-display text-xl text-paper">Mission Replay</h1>
        </div>
        <button type="button" onClick={() => showReport()} className="fp-btn-secondary">
          Back to report
        </button>
      </div>
      {content}
    </div>
  )
}

const CampaignLab = import.meta.env.DEV ? lazy(() => import('./campaign/scenes/Lab').then((m) => ({ default: m.CampaignLab }))) : () => null
// Dev builds only: Launch Day on its own (`?minigame=launch`); in the game it plays inside the flight at liftoff
const LaunchDayRoute = import.meta.env.DEV ? lazy(() => import('./minigames/launchDay').then((m) => ({ default: m.LaunchDayRoute }))) : () => null

export default function App() {
  // Dev builds only: the scene lab for the campaign's shows (src/campaign/scenes/Lab.tsx), never in the shipped bundle
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('campaignlab'))
    return (
      <Suspense fallback={null}>
        <CampaignLab />
      </Suspense>
    )
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('minigame') === 'launch')
    return (
      <Suspense fallback={null}>
        <LaunchDayRoute />
      </Suspense>
    )
  return <MainApp />
}

function MainApp() {
  const screen = useGameStore((s) => s.screen)
  const openingDone = useUiStore((s) => s.openingDone)
  useAudioDirector()
  useViewMode()

  // The game starts on the agency map, a full-screen game view ('title' is an old name for it)
  if (screen === 'base' || screen === 'title') {
    // The opening curtain covers the base once per session (only where the 3D picture can be drawn)
    if (!openingDone && canUseWebGL()) return <Opening onBegin={() => audio.play('sfx.reveal')} />
    return (
      <main className="h-screen text-slate-100">
        {/* No mentor over the base: the mission panel says what comes next */}
        <BaseScreen />
        <Captions />
        <InteractionLayer />
      </main>
    )
  }

  // All other screens use Shell
  let content: React.ReactNode
  switch (screen) {
    case 'setup':
    case 'design':
      content = <DesignScreen />
      break
    case 'simulation':
      content = <SimulationPlaceholder />
      break
    case 'report':
      content = <ReportScreen />
      break
    case 'replay':
      content = <ReplayScreen />
      break
    default:
      content = <div>Unknown screen</div>
  }

  return (
    <>
      <Shell>{content}</Shell>
      {/* The mission mentor, over every screen; it never blocks play */}
      <Narrator />
      <Captions />
      <InteractionLayer />
    </>
  )
}
