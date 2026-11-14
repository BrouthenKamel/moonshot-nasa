import { useGameStore } from './state/gameStore'
import { Shell } from './ui/Shell'
import { TitleScreen, DesignScreen, BaseScreen } from './ui/screens'

function SimulationPlaceholder() {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)

  if (!simState) return null

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

      {simState.turnLogs.length > 0 && (
        <div className="rounded-lg bg-slate-900 p-4">
          <div className="text-sm font-medium text-slate-300">Recent Activity</div>
          <div className="mt-2 space-y-1 text-sm text-slate-400">
            {simState.turnLogs.slice(-5).map((log, i) => (
              <div key={i}>
                Turn {log.turn}: {log.notes[0]}
              </div>
            ))}
          </div>
        </div>
      )}

      {simState.phase !== 'complete' && simState.phase !== 'failed' && (
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

function ReportPlaceholder() {
  const currentReport = useGameStore((s) => s.currentReport)
  const runHistory = useGameStore((s) => s.runHistory)
  const newGame = useGameStore((s) => s.newGame)
  const loadDesignFromHistory = useGameStore((s) => s.loadDesignFromHistory)

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
              <button
                key={entry.id}
                onClick={() => loadDesignFromHistory(entry.id)}
                className="w-full rounded bg-slate-800 p-2 text-left text-sm hover:bg-slate-700"
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
    default:
      content = <div>Unknown screen</div>
  }

  return <Shell>{content}</Shell>
}
