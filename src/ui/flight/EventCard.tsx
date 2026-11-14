import { useGameStore } from '../../state/gameStore'

/** The event card that waits for the player's decision during the flight */
export function EventCard() {
  const decision = useGameStore((s) => s.simState?.pendingDecision)
  const answerEvent = useGameStore((s) => s.answerEvent)
  const flight = useGameStore((s) => s.simState?.flight)
  if (!decision || !flight) return null
  return (
    <div className="rounded-lg border-2 border-yellow-500 bg-yellow-950/90 p-5 shadow-2xl">
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
