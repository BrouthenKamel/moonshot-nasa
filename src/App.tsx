import { useGameStore } from './state/gameStore'
import { Shell } from './ui/Shell'
import { TitleScreen, DesignScreen, BaseScreen } from './ui/screens'
import { ReplayPanel } from './viz/ReplayPanel'
import { isSimComplete } from './sim/simulate'
import { computeBudgets } from './sim/budgets'
import { difficultyPresets } from './data/brief'

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
    <div className="rounded-lg bg-slate-900 p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function EventCard() {
  const decision = useGameStore((s) => s.simState?.pendingDecision)
  const answerEvent = useGameStore((s) => s.answerEvent)
  const flight = useGameStore((s) => s.simState?.flight)
  if (!decision || !flight) return null
  return (
    <div className="rounded-lg border-2 border-yellow-500 bg-yellow-950/60 p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Event, turn {decision.turn}</div>
      <div className="mt-1 text-lg font-bold text-yellow-200">{decision.title}</div>
      <div className="mt-2 text-sm text-slate-200">{decision.text}</div>
      {decision.realMission && <div className="mt-1 text-xs text-slate-400">Real mission: {decision.realMission}</div>}
      <div className="mt-2 text-xs text-slate-400">
        Money {flight.main.toFixed(1)} M, reserve {Math.max(0, flight.reserve).toFixed(1)} M
      </div>
      <div className="mt-4 space-y-2">
        {decision.options.map((o) => (
          <button
            key={o.id}
            onClick={() => answerEvent(o.id)}
            className="w-full rounded-lg bg-slate-800 p-3 text-left text-sm text-slate-100 hover:bg-slate-700"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SimulationPlaceholder() {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const flyOn = useGameStore((s) => s.flyOn)
  const showReport = useGameStore((s) => s.showReport)

  if (!simState) return null

  const complete = isSimComplete(simState)
  const f = simState.flight
  const b = computeBudgets(simState.design, simState.difficulty)
  const dataTarget = difficultyPresets[simState.difficulty]?.dataTarget ?? 300
  const waiting = !!simState.pendingDecision
  const lastNotes = simState.turnLogs[simState.turnLogs.length - 1]?.notes ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-blue-400">Mission Simulation</h1>
        <p className="mt-2 text-slate-400">
          Turn {simState.currentTurn}: {PHASE_TEXT[simState.phase] ?? simState.phase}
          {simState.phase === 'build' || simState.phase === 'test' || simState.phase === 'wait'
            ? `. The ride leaves on turn ${f.launchTurn}.`
            : ''}
        </p>
        {lastNotes.length > 0 && <p className="mt-1 text-sm text-slate-500">{lastNotes.join(' ')}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SimStat
          label="Ice mapped (data home)"
          value={`${simState.coveragePercent.toFixed(1)}%`}
          sub="need 70%"
          tone={simState.coveragePercent >= 70 ? 'text-green-400' : 'text-blue-400'}
        />
        <SimStat
          label="Science data home"
          value={`${simState.totalDataReturned.toFixed(0)} MB`}
          sub={`need ${dataTarget} MB${f.science.stored >= 1 ? `, ${f.science.stored.toFixed(0)} MB waiting on board` : ''}`}
          tone={simState.totalDataReturned >= dataTarget ? 'text-green-400' : 'text-blue-400'}
        />
        <SimStat
          label="Turns in orbit"
          value={`${simState.turnsInOrbit}`}
          sub="need 12"
          tone={simState.turnsInOrbit >= 12 ? 'text-green-400' : 'text-purple-400'}
        />
        <SimStat
          label="Delta-v left"
          value={`${Math.max(0, simState.fuelRemaining).toFixed(0)} m/s`}
          sub={f.captured ? `${b.deltaVStationKeeping} m/s a turn to hold the orbit` : `capture needs ${(b.captureDeltaV ?? 0).toFixed(0)} m/s`}
          tone="text-orange-400"
        />
        <SimStat label="Money" value={`${f.main.toFixed(1)} M`} sub="main budget" tone="text-slate-200" />
        <SimStat
          label="Reserve"
          value={`${f.reserve.toFixed(1)} M`}
          sub={f.reserve < 0 ? 'overdrawn' : 'pays for fixes and overruns'}
          tone={f.reserve < 0 ? 'text-red-400' : 'text-purple-400'}
        />
      </div>

      <EventCard />

      <ReplayPanel
        design={simState.design}
        logs={simState.turnLogs}
        terminal={complete ? (simState.phase === 'failed' ? 'failed' : 'complete') : undefined}
        compact
      />

      {complete && (
        <button
          onClick={() => showReport()}
          className="w-full rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-500"
        >
          See report
        </button>
      )}

      {!complete && !waiting && (
        <div className="flex gap-4">
          <button
            onClick={() => advanceTurn()}
            className="flex-1 rounded-lg bg-slate-700 py-3 font-medium text-white hover:bg-slate-600"
          >
            Advance one turn
          </button>
          <button
            onClick={() => flyOn()}
            className="flex-1 rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500"
          >
            Fly until something happens
          </button>
        </div>
      )}
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-blue-400">Mission Replay</h1>
        <button
          onClick={() => showReport()}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-600"
        >
          Back to report
        </button>
      </div>
      {content}
    </div>
  )
}

function ReportPlaceholder() {
  const currentReport = useGameStore((s) => s.currentReport)
  const runHistory = useGameStore((s) => s.runHistory)
  const newGame = useGameStore((s) => s.newGame)
  const loadDesignFromHistory = useGameStore((s) => s.loadDesignFromHistory)
  const openReplay = useGameStore((s) => s.openReplay)
  const simState = useGameStore((s) => s.simState)

  if (!currentReport && runHistory.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-slate-400">No missions completed yet</div>
          <button
            onClick={newGame}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-white"
          >
            Start a Mission
          </button>
        </div>
      </div>
    )
  }

  const report = currentReport ?? runHistory[0]?.report

  if (!report) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div
        className={`rounded-lg p-6 text-center ${
          report.outcome === 'success'
            ? 'bg-green-950'
            : report.outcome === 'partial'
              ? 'bg-yellow-950'
              : 'bg-red-950'
        }`}
      >
        <div
          className={`text-3xl font-bold ${
            report.outcome === 'success'
              ? 'text-green-400'
              : report.outcome === 'partial'
                ? 'text-yellow-400'
                : 'text-red-400'
          }`}
        >
          {report.outcome === 'success'
            ? 'Mission Success'
            : report.outcome === 'partial'
              ? 'Partial Success'
              : 'Mission Failed'}
        </div>
        <div className="mt-2 text-slate-300">{report.outcomeReason}</div>
        <div className="mt-4 text-4xl font-bold text-white">{report.score.total} / 1000</div>
      </div>

      <div className="space-y-3">
        {report.requirements.map((req) => (
          <div key={req.id} className={`rounded-lg p-4 ${req.met ? 'bg-green-950' : 'bg-red-950'}`}>
            <div className="flex items-baseline justify-between">
              <div className={`font-medium ${req.met ? 'text-green-300' : 'text-red-300'}`}>
                {req.met ? '✔' : '✘'} {req.name}
              </div>
              <div className="text-sm text-slate-400">{req.reason}</div>
            </div>
            {req.causes?.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {req.causes.map((c, i) => (
                  <li key={i}>
                    <span className="text-red-400">why:</span> {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-slate-900 p-4 text-sm text-slate-400">
        <div className="font-medium text-slate-300">Score</div>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          <span>Ice coverage {report.score.coverage ?? 0} / 400</span>
          <span>Science data {report.score.data ?? 0} / 250</span>
          <span>Turns in orbit {report.score.lifetime ?? 0} / 150</span>
          <span>Sunlit-ground map {report.score.context ?? 0} / 100</span>
          <span>Money left {report.score.money ?? 0} / 100</span>
        </div>
        {report.outreachReturned > 0 && (
          <div className="mt-2">
            {report.outreachReturned.toFixed(0)} MB of camera pictures came home: great for the public, but not science
            data.
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button
          onClick={newGame}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500"
        >
          New Mission
        </button>
        {currentReport && simState && simState.turnLogs.length > 0 && (
          <button
            onClick={() => openReplay()}
            className="flex-1 rounded-lg bg-purple-600 py-3 font-medium text-white hover:bg-purple-500"
          >
            Watch replay
          </button>
        )}
        {currentReport && (
          <button
            onClick={() => loadDesignFromHistory(runHistory[0]?.id ?? '')}
            className="flex-1 rounded-lg bg-slate-700 py-3 font-medium text-slate-300 hover:bg-slate-600"
          >
            Retry with Changes
          </button>
        )}
      </div>

      {runHistory.length > 1 && (
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="font-medium text-slate-300">Run History</div>
          <div className="mt-2 space-y-2">
            {runHistory.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex gap-2">
                <button
                  onClick={() => loadDesignFromHistory(entry.id)}
                  className="flex-1 rounded bg-slate-800 p-2 text-left text-sm hover:bg-slate-700"
                >
                  <span
                    className={
                      entry.report.outcome === 'success'
                        ? 'text-green-400'
                        : entry.report.outcome === 'partial'
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }
                  >
                    {entry.report.outcome}
                  </span>{' '}
                  - Score: {entry.report.score.total}
                </button>
                {entry.run && (
                  <button
                    onClick={() => openReplay(entry.id)}
                    className="rounded bg-purple-700 px-3 text-sm text-white hover:bg-purple-600"
                  >
                    Replay
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const screen = useGameStore((s) => s.screen)

  // Title screen doesn't use Shell
  if (screen === 'title') {
    return (
      <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <TitleScreen />
      </main>
    )
  }

  // Agency base is a full-screen game view
  if (screen === 'base') {
    return (
      <main className="h-screen text-slate-100">
        <BaseScreen />
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
      content = <ReportPlaceholder />
      break
    case 'replay':
      content = <ReplayScreen />
      break
    default:
      content = <div>Unknown screen</div>
  }

  return <Shell>{content}</Shell>
}
