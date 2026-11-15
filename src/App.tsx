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
import { ReplayPanel } from './viz/ReplayPanel'
import { isSimComplete } from './sim/simulate'
import { computeBudgets } from './sim/budgets'
import { difficultyPresets } from './data/brief'
import { EventCard } from './ui/flight/EventCard'
import { FlightControls } from './ui/flight/FlightControls'
import { Narrator } from './ui/narrator/Narrator'

const PHASE_TEXT: Record<string, string> = {
  build: 'Building',
  test: 'Testing',
  wait: 'Waiting for the ride',
  transfer: 'On the way to the Moon',
  capture: 'Capture burn',
  orbit: 'Mapping in the science orbit',
  complete: 'Mission over',
  failed: 'Mission lost',
}

function SimStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="hud-panel rounded-xl p-4">
      <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="mt-1 font-mono text-xs text-slate-400 tabular-nums">{sub}</div>}
    </div>
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
      <div className="hud-step-header rounded-2xl p-6">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
          FLIGHT OPERATIONS · LUNAR ICE MAPPER · LIVE TELEMETRY
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Mission Simulation</h1>
        <p className="mt-2 font-mono text-sm text-slate-300 tabular-nums">
          Month {simState.currentTurn}: {PHASE_TEXT[simState.phase] ?? simState.phase}
          {simState.phase === 'build' || simState.phase === 'test' || simState.phase === 'wait'
            ? `. The ride leaves in month ${f.launchTurn}.`
            : ''}
        </p>
        {lastNotes.length > 0 && <p className="mt-1.5 text-sm text-slate-400">{lastNotes.join(' ')}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SimStat
          label="Ice mapped (data home)"
          value={`${simState.coveragePercent.toFixed(1)}%`}
          sub="need 70%"
          tone={simState.coveragePercent >= 70 ? 'text-[#22d3ee]' : 'text-blue-400'}
        />
        <SimStat
          label="Science data home"
          value={`${simState.totalDataReturned.toFixed(0)} MB`}
          sub={`need ${dataTarget} MB${f.science.stored >= 1 ? `, ${f.science.stored.toFixed(0)} MB waiting on board` : ''}`}
          tone={simState.totalDataReturned >= dataTarget ? 'text-emerald-400' : 'text-blue-400'}
        />
        <SimStat
          label="Months in orbit"
          value={`${simState.turnsInOrbit}`}
          sub="need 12"
          tone={simState.turnsInOrbit >= 12 ? 'text-emerald-400' : 'text-purple-400'}
        />
        <SimStat
          label="Delta-v left"
          value={`${Math.max(0, simState.fuelRemaining).toFixed(0)} m/s`}
          sub={f.captured ? `${b.deltaVStationKeeping} m/s a month to hold the orbit` : `capture needs ${(b.captureDeltaV ?? 0).toFixed(0)} m/s`}
          tone="text-orange-400"
        />
        <SimStat label="Money" value={`${f.main.toFixed(1)} M`} sub="main budget" tone="text-slate-100" />
        <SimStat
          label="Reserve"
          value={`${f.reserve.toFixed(1)} M`}
          sub={f.reserve < 0 ? 'overdrawn' : 'pays for fixes and overruns'}
          tone={f.reserve < 0 ? 'text-rose-400' : 'text-purple-400'}
        />
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

  let content: React.ReactNode = <div className="text-slate-400">Nothing to replay.</div>
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
      <div className="hud-step-header flex items-center justify-between gap-4 rounded-2xl p-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--role-accent)]">
            FLIGHT ARCHIVE · LUNAR ICE MAPPER · REPLAY
          </div>
          <h1 className="mt-0.5 font-display text-xl font-bold text-white">Mission Replay</h1>
        </div>
        <button onClick={() => showReport()} className="tactical-btn-back">
          Back to report
        </button>
      </div>
      {content}
    </div>
  )
}

export default function App() {
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
    </>
  )
}
