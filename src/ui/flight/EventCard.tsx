import { useEffect, useId, useRef } from 'react'
import { useGameStore } from '../../state/gameStore'
import { missionClockLabel } from '../../viz/missionMap'

/** The event card that waits for the player's decision during the flight */
export function EventCard() {
  const decision = useGameStore((s) => s.simState?.pendingDecision)
  const answerEvent = useGameStore((s) => s.answerEvent)
  const flight = useGameStore((s) => s.simState?.flight)
  const titleId = useId()
  const textId = useId()
  const firstOption = useRef<HTMLButtonElement>(null)
  // A new card takes the focus, so the keyboard lands on its first option (QC #43)
  const cardKey = decision ? `${decision.key}-${decision.turn}` : null
  useEffect(() => {
    if (cardKey) firstOption.current?.focus()
  }, [cardKey])
  if (!decision || !flight) return null
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      className="rounded-lg border-2 border-yellow-500 bg-yellow-950/90 p-5 shadow-2xl"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Event, {missionClockLabel(decision.turn)}</div>
      <h2 id={titleId} className="mt-1 text-lg font-bold text-yellow-200">
        {decision.title}
      </h2>
      <div id={textId} className="mt-2 text-sm text-slate-200">
        {decision.text}
      </div>
      {decision.realMission && <div className="mt-1 text-xs text-slate-400">Real mission: {decision.realMission}</div>}
      <div className="mt-2 text-xs text-slate-400">
        Money {flight.main.toFixed(1)} M, reserve {Math.max(0, flight.reserve).toFixed(1)} M
      </div>
      <div className="mt-4 space-y-2">
        {decision.options.map((o, i) => (
          <button
            key={o.id}
            ref={i === 0 ? firstOption : undefined}
            onClick={() => answerEvent(o.id)}
            className="w-full rounded-lg bg-slate-800 p-3 text-left text-sm text-slate-100 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
