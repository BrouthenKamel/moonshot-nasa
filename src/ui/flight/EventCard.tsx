import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { assetUrl, type ImageId } from '../../assets'
import { getEventById, type EventType } from '../../data/events'
import { useGameStore } from '../../state/gameStore'
import { missionClockLabel } from '../../viz/missionMap'

const ART: Partial<Record<EventType, ImageId>> = {
  thruster: 'image.event-thruster',
  'no-signal': 'image.event-no-signal',
  'build-delay': 'image.event-build-delay',
}

interface OptionProbability {
  pct: number | null
  caption: string
  barColor: string
}

function optionProbability(key: EventType, optionId: string, label: string): OptionProbability | null {
  const oddsMatch = label.match(/About\s+(\d+)%\s+chance of full success/i)
  if (oddsMatch) {
    const pct = Math.min(100, Math.max(0, Number(oddsMatch[1])))
    return {
      pct,
      caption: 'Full success odds',
      barColor: pct >= 60 ? '#4ade80' : pct >= 35 ? '#fbbf24' : '#f87171',
    }
  }
  const def = getEventById(key)?.choices.find((c) => c.id === optionId)
  if (!def) return null
  if (def.successChance > 0 && def.successChance < 1) {
    const pct = Math.round(def.successChance * 100)
    return {
      pct,
      caption: 'Recovery chance',
      barColor: pct >= 60 ? '#4ade80' : '#fbbf24',
    }
  }
  if (def.successChance === 0) {
    return optionId === 'give-up'
      ? { pct: 0, caption: 'Mission ends', barColor: '#f43f5e' }
      : { pct: 0, caption: 'No fix · fly degraded', barColor: '#fb923c' }
  }
  if (key === 'build-delay') {
    return optionId === 'wait'
      ? { pct: null, caption: 'Slips 1 month · preserves testing', barColor: '#60a5fa' }
      : { pct: null, caption: 'Holds schedule · cuts 1 test month', barColor: '#fbbf24' }
  }
  return null
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
  const severity = getEventById(decision.key)?.severity ?? 'major'
  const critical = severity === 'critical'
  const stripeColor = critical ? '#ef4444' : '#f59e0b'

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === '1' || e.key === '2') {
      const idx = Number(e.key) - 1
      const opt = decision.options[idx]
      if (opt) {
        e.preventDefault()
        answerEvent(opt.id)
      }
    }
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onKeyDown={onKeyDown}
      className={`event-in hud-panel overflow-hidden rounded-2xl border shadow-[0_24px_80px_rgba(0,0,0,0.8)] ${
        critical ? 'border-rose-500/60' : 'border-amber-400/60'
      }`}
    >
      {/* Caution hazard stripe */}
      <div
        aria-hidden="true"
        className="h-2 w-full"
        style={{
          backgroundImage: `repeating-linear-gradient(-45deg, ${stripeColor} 0px, ${stripeColor} 10px, #120d05 10px, #120d05 20px)`,
        }}
      />
      {art && (
        <div className="relative h-40 overflow-hidden sm:h-48">
          <img src={assetUrl(art)} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#090d16] via-[#090d16]/30 to-transparent" />
        </div>
      )}
      <div className={`p-5 ${art ? 'relative -mt-10' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={`font-mono text-xs font-semibold uppercase tracking-[0.2em] ${critical ? 'text-rose-400' : 'text-amber-400'}`}>
            Event, {missionClockLabel(decision.turn)}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1 font-mono text-[11px] tabular-nums text-slate-200">
            <span>MAIN {flight.main.toFixed(1)} M</span>
            <span className="text-slate-600" aria-hidden="true">|</span>
            <span className={flight.reserve < 1 ? 'text-amber-300' : 'text-emerald-300'}>
              RESERVE {Math.max(0, flight.reserve).toFixed(1)} M
            </span>
          </div>
        </div>
        <h2 id={titleId} className="mt-1.5 font-display text-2xl font-bold text-amber-50">
          {decision.title}
        </h2>
        <div id={textId} className="mt-2 text-sm leading-relaxed text-slate-200">
          {decision.text}
        </div>
        {decision.realMission && <div className="mt-2 text-xs italic text-slate-400">Real mission: {decision.realMission}</div>}
        <div className="mt-4 space-y-2.5">
          {decision.options.map((o, i) => {
            const prob = optionProbability(decision.key, o.id, o.label)
            return (
              <button
                key={o.id}
                type="button"
                ref={i === 0 ? firstOption : undefined}
                onClick={() => answerEvent(o.id)}
                className={`w-full rounded-xl border p-3 text-left text-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${
                  i === 0
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25'
                    : 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <kbd
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 rounded border border-white/25 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-200"
                  >
                    [{i + 1}]
                  </kbd>
                  <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
                </div>
                {prob && (
                  <div className="mt-2 pl-8">
                    <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-300">
                      <span>{prob.caption}</span>
                      {prob.pct !== null && <span className="font-bold text-white">{prob.pct}%</span>}
                    </div>
                    {prob.pct !== null && (
                      <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(4, prob.pct)}%`, background: prob.barColor }} />
                        <div className="hud-bar-segments pointer-events-none absolute inset-0" />
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
