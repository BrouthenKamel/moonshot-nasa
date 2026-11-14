import { useEffect } from 'react'
import { useGameStore } from '../../state/gameStore'
import { isSimComplete } from '../../sim/simulate'

/** One turn every half second while the flight plays (Jakob, 14 Nov) */
export const AUTO_FLY_MS = 500

/** Turn buttons during the flight; "See report" once it is over. Hidden while an event card waits. */
export function FlightControls({ compact = false }: { compact?: boolean }) {
  const simState = useGameStore((s) => s.simState)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const autoFly = useGameStore((s) => s.autoFly)
  const startAutoFly = useGameStore((s) => s.startAutoFly)
  const stopAutoFly = useGameStore((s) => s.stopAutoFly)
  const showReport = useGameStore((s) => s.showReport)

  // Play the flight turn by turn; the store switches it off at the next milestone
  useEffect(() => {
    if (!autoFly) return
    const id = setInterval(() => useGameStore.getState().autoFlyTick(), AUTO_FLY_MS)
    return () => clearInterval(id)
  }, [autoFly])

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
        disabled={autoFly}
        className={`flex-1 rounded-lg bg-slate-700 font-medium text-white hover:bg-slate-600 disabled:opacity-50 ${pad}`}
      >
        Advance one turn
      </button>
      {autoFly ? (
        <button onClick={() => stopAutoFly()} className={`flex-1 rounded-lg bg-amber-600 font-medium text-white hover:bg-amber-500 ${pad}`}>
          Pause
        </button>
      ) : (
        <button onClick={() => startAutoFly()} className={`flex-1 rounded-lg bg-blue-600 font-medium text-white hover:bg-blue-500 ${pad}`}>
          Fly until something happens
        </button>
      )}
    </div>
  )
}
