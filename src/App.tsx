import { useGameStore } from './state/gameStore'
import { Shell } from './ui/Shell'
import { TitleScreen, DesignScreen } from './ui/screens'
import { ReplayPanel } from './viz/ReplayPanel'
import { isSimComplete } from './sim/simulate'

function SimulationPlaceholder() {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const showReport = useGameStore((s) => s.showReport)

  if (!simState) return null

  const complete = isSimComplete(simState)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-blue-400">Mission Simulation</h1>
        <p className="mt-2 text-slate-400">
          Turn {simState.currentTurn} - Phase: {simState.phase}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Coverage</div>
          <div className="text-2xl font-bold text-blue-400">
            {simState.coveragePercent.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Data Returned</div>
          <div className="text-2xl font-bold text-green-400">
            {simState.totalDataReturned.toFixed(1)} GB
          </div>
        </div>
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Fuel Remaining</div>
          <div className="text-2xl font-bold text-orange-400">
            {simState.fuelRemaining.toFixed(0)} m/s
          </div>
        </div>
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="text-sm text-slate-400">Turns in Orbit</div>
          <div className="text-2xl font-bold text-purple-400">
            {simState.turnsInOrbit}
          </div>
        </div>
      </div>

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

      {!complete && (
        <button
          onClick={() => advanceTurn()}
          className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500"
        >
          Advance Turn
        </button>
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

      <div className="grid grid-cols-2 gap-4">
        {report.requirements.map((req) => (
          <div
            key={req.id}
            className={`rounded-lg p-4 ${req.met ? 'bg-green-950' : 'bg-red-950'}`}
          >
            <div className={`font-medium ${req.met ? 'text-green-300' : 'text-red-300'}`}>
              {req.name}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {req.actual} / {req.target} {req.unit}
            </div>
          </div>
        ))}
      </div>

      {report.hints.length > 0 && (
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="font-medium text-slate-300">Improvement Hints</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {report.hints.map((hint, i) => (
              <li key={i}>
                <span className="text-blue-400">{hint.area}:</span> {hint.suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

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
