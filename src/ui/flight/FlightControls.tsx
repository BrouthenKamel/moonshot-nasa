import { useGameStore } from '../../state/gameStore'
import { isSimComplete } from '../../sim/simulate'

/** Turn buttons during the flight; "See report" once it is over. Hidden while an event card waits. */
export function FlightControls({ compact = false }: { compact?: boolean }) {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const flyOn = useGameStore((s) => s.flyOn)
  const showReport = useGameStore((s) => s.showReport)
  if (!simState) return null
  const pad = compact ? 'py-2 text-sm' : 'py-3'

  if (isSimComplete(simState)) {
    return (
      <button
        onClick={() => showReport()}
        className={`w-full rounded-lg bg-green-600 font-medium text-white hover:bg-green-500 ${pad}`}
      >
        See report
      </button>
    )
  }
  if (simState.pendingDecision) return null
  return (
    <div className="flex gap-3">
      <button
        onClick={() => advanceTurn()}
        className={`flex-1 rounded-lg bg-slate-700 font-medium text-white hover:bg-slate-600 ${pad}`}
      >
        Advance one turn
      </button>
      <button onClick={() => flyOn()} className={`flex-1 rounded-lg bg-blue-600 font-medium text-white hover:bg-blue-500 ${pad}`}>
        Fly until something happens
      </button>
    </div>
  )
}
