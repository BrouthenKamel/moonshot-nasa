import { useEffect, useId, useRef } from 'react'
import { assetUrl, type ImageId } from '../../assets'
import type { EventType } from '../../data/events'
import { useGameStore } from '../../state/gameStore'
import { missionClockLabel } from '../../viz/missionMap'

const ART: Partial<Record<EventType, ImageId>> = {
  thruster: 'image.event-thruster',
  'no-signal': 'image.event-no-signal',
  'build-delay': 'image.event-build-delay',
}

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
  const art = ART[decision.key]
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      className="event-in overflow-hidden rounded-2xl border border-amber-400/60 bg-[#120d05]/95 shadow-[0_20px_80px_rgba(0,0,0,0.7)]"
    >
      {art && (
        <div className="relative h-40 overflow-hidden sm:h-48">
          <img src={assetUrl(art)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#120d05] via-[#120d05]/20 to-transparent" />
        </div>
      )}
      <div className={`p-5 ${art ? 'relative -mt-10' : ''}`}>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Event, {missionClockLabel(decision.turn)}</div>
        <h2 id={titleId} className="mt-1 font-display text-2xl font-bold text-amber-100">
          {decision.title}
        </h2>
        <div id={textId} className="mt-2 text-sm leading-relaxed text-slate-200">
          {decision.text}
        </div>
        {decision.realMission && <div className="mt-2 text-xs italic text-slate-400">Real mission: {decision.realMission}</div>}
        <div className="mt-2 text-xs text-slate-400">
          Money {flight.main.toFixed(1)} M, reserve {Math.max(0, flight.reserve).toFixed(1)} M
        </div>
        <div className="mt-4 space-y-2">
          {decision.options.map((o, i) => (
            <button
              key={o.id}
              ref={i === 0 ? firstOption : undefined}
              onClick={() => answerEvent(o.id)}
              className={`w-full rounded-xl border p-3 text-left text-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${
                i === 0
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25'
                  : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
