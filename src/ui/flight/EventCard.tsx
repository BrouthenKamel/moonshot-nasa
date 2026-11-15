import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { assetUrl, type ImageId } from '../../assets'
import { audio } from '../../assets/audio'
import { getEventById, type EventType } from '../../data/events'
import { prefersReducedMotion } from '../../scene/space/quality'
import { useGameStore } from '../../state/gameStore'
import { missionClockLabel } from '../../viz/missionMap'
import { Tag } from '../kit'
import { DECISION_CLOCK_MS, decisionClockFraction, decisionClockNote, shouldPauseDecisionClock, standingOrderOptionId } from './decisionClock'

const ART: Partial<Record<EventType, ImageId>> = {
  thruster: 'image.event-thruster',
  'no-signal': 'image.event-no-signal',
  'build-delay': 'image.event-build-delay',
}

interface OptionProbability {
  pct: number | null
  caption: string
  /** Token class for the ruled odds bar */
  bar: string
}

function optionProbability(key: EventType, optionId: string, label: string): OptionProbability | null {
  const oddsMatch = label.match(/About\s+(\d+)%\s+chance of full success/i)
  if (oddsMatch) {
    const pct = Math.min(100, Math.max(0, Number(oddsMatch[1])))
    return { pct, caption: 'Full success odds', bar: pct >= 60 ? 'bg-go' : pct >= 35 ? 'bg-caution' : 'bg-nogo' }
  }
  const def = getEventById(key)?.choices.find((c) => c.id === optionId)
  if (!def) return null
  if (def.successChance > 0 && def.successChance < 1) {
    const pct = Math.round(def.successChance * 100)
    return { pct, caption: 'Recovery chance', bar: pct >= 60 ? 'bg-go' : 'bg-caution' }
  }
  if (def.successChance === 0) {
    return optionId === 'give-up'
      ? { pct: 0, caption: 'Mission ends', bar: 'bg-nogo' }
      : { pct: 0, caption: 'No fix · fly degraded', bar: 'bg-caution' }
  }
  if (key === 'build-delay') {
    return optionId === 'wait'
      ? { pct: null, caption: 'Slips 1 month · preserves testing', bar: 'bg-paper-dim' }
      : { pct: null, caption: 'Holds schedule · cuts 1 test month', bar: 'bg-caution' }
  }
  return null
}

/** The flight note that waits for the player's decision during the flight */
export function EventCard() {
  const decision = useGameStore((s) => s.simState?.pendingDecision)
  const answerEvent = useGameStore((s) => s.answerEvent)
  const flight = useGameStore((s) => s.simState?.flight)
  const titleId = useId()
  const textId = useId()
  const firstOption = useRef<HTMLButtonElement>(null)
  // A new card takes the focus, so the keyboard lands on its first option (QC #43)
  const cardKey = decision ? `${decision.key}-${decision.turn}` : null
  const [clock, setClock] = useState<{ key: string | null; elapsedMs: number }>({ key: null, elapsedMs: 0 })
  const [blurred, setBlurred] = useState(false)
  // Reading is never punished: the clock starts on the player's first move after the card
  // appears (a click, a key, or the pointer leaving the card) and pauses while they read it
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const [hovered, setHovered] = useState(false)
  const [keyboardInside, setKeyboardInside] = useState(false)
  const autoFiredRef = useRef<string | null>(null)
  const reduced = prefersReducedMotion()
  const elapsedMs = clock.key === cardKey ? clock.elapsedMs : 0
  const clockCond = {
    reducedMotion: reduced,
    blurred,
    hasDecision: !!decision,
    armed: armedKey === cardKey,
    reading: hovered || keyboardInside,
  }
  const clockPaused = shouldPauseDecisionClock(clockCond)
  const clockNote = decisionClockNote(clockCond)

  useEffect(() => {
    if (cardKey) firstOption.current?.focus()
  }, [cardKey])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const onBlur = () => setBlurred(true)
    const onFocus = () => setBlurred(document.hidden)
    const onVisibility = () => setBlurred(document.hidden)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!cardKey) return
    const arm = () => setArmedKey(cardKey)
    const onPointerDown = () => {
      setKeyboardInside(false)
      arm()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', arm)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', arm)
    }
  }, [cardKey])

  useEffect(() => {
    if (clockPaused || !cardKey) return
    const id = window.setInterval(() => {
      setClock((prev) => {
        const current = prev.key === cardKey ? prev.elapsedMs : 0
        const next = Math.min(DECISION_CLOCK_MS, current + 100)
        return { key: cardKey, elapsedMs: next }
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [clockPaused, cardKey])

  useEffect(() => {
    if (!decision || !cardKey || elapsedMs < DECISION_CLOCK_MS) return
    if (autoFiredRef.current === cardKey) return
    const optId = standingOrderOptionId(decision)
    if (!optId) return
    autoFiredRef.current = cardKey
    audio.play('sfx.click')
    answerEvent(optId)
  }, [decision, cardKey, elapsedMs, answerEvent])

  if (!decision || !flight) return null

  const art = ART[decision.key]
  const severity = getEventById(decision.key)?.severity ?? 'major'
  const critical = severity === 'critical'
  const remainingFrac = decisionClockFraction(elapsedMs)
  const remainingS = Math.max(0, Math.ceil((DECISION_CLOCK_MS - elapsedMs) / 1000))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Moving through the options by keyboard is reading too
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) setKeyboardInside(true)
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
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false)
        setArmedKey(cardKey)
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardInside(false)
      }}
      className="event-in fp-sheet overflow-hidden border-t-4 border-t-kapton"
      data-tone="raised"
    >
      {/* Note header: a ruled title line, like the top of a flight-plan page */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-ink-1 px-5 py-2">
        <div className="fp-label text-kapton">
          Flight note · <span>Event, {missionClockLabel(decision.turn)}</span>
        </div>
        <Tag tone={critical ? 'nogo' : 'caution'}>{critical ? 'Critical' : 'Major'}</Tag>
      </div>
      {/* 30 s CAPCOM decision clock */}
      <div
        data-testid="decision-clock"
        data-paused={clockPaused ? 'true' : 'false'}
        data-remaining-ms={Math.max(0, DECISION_CLOCK_MS - elapsedMs)}
        className="border-b border-rule bg-ink-1 px-5 py-1.5"
      >
        <div className="flex items-center justify-between gap-2 fp-data text-[11px] text-paper-dim">
          <span className="fp-label">Decision clock · Standing order [1]</span>
          <span className={remainingS <= 5 && !clockNote ? 'font-bold text-nogo' : 'text-kapton'}>
            {clockNote ? `${clockNote} · ${remainingS}s` : `${remainingS}s`}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden border border-rule bg-ink-0">
          <div
            className="h-full bg-kapton transition-[width] duration-100 ease-linear"
            style={{ width: `${(remainingFrac * 100).toFixed(2)}%` }}
          />
        </div>
      </div>
      {art && (
        <div className="h-36 overflow-hidden border-b border-rule sm:h-44">
          <img src={assetUrl(art)} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-end gap-3 fp-data text-[11px] text-paper-dim">
          <span>MAIN {flight.main.toFixed(1)} M</span>
          <span className="text-paper-faint" aria-hidden="true">
            |
          </span>
          <span className={flight.reserve < 1 ? 'text-caution' : 'text-go'}>RESERVE {Math.max(0, flight.reserve).toFixed(1)} M</span>
        </div>
        <h2 id={titleId} className="mt-1 fp-display text-2xl text-paper">
          {decision.title}
        </h2>
        <div id={textId} className="mt-2 text-sm leading-relaxed text-paper">
          {decision.text}
        </div>
        {decision.realMission && (
          <div className="mt-3 border-l-2 border-rule-strong pl-3 text-xs text-paper-dim">
            <span className="fp-label text-[10px]">Real mission:</span> {decision.realMission}
          </div>
        )}
        <div className="mt-4 space-y-2.5">
          {decision.options.map((o, i) => {
            const prob = optionProbability(decision.key, o.id, o.label)
            return (
              <button
                key={o.id}
                type="button"
                ref={i === 0 ? firstOption : undefined}
                onClick={() => answerEvent(o.id)}
                className={`w-full border bg-ink-1 p-3 text-left text-sm text-paper transition-colors hover:bg-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kapton ${
                  i === 0 ? 'border-kapton' : 'border-rule-strong'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <kbd aria-hidden="true" className="mt-0.5 shrink-0 border border-rule-strong px-1.5 py-0.5 fp-data text-[10px] font-bold text-paper-dim">
                    [{i + 1}]
                  </kbd>
                  <span className="min-w-0 flex-1 leading-snug">{o.label}</span>
                  {i === 0 && (
                    <span className="shrink-0 self-center">
                      <Tag tone="caution">Standing order</Tag>
                    </span>
                  )}
                </div>
                {prob && (
                  <div className="mt-2 pl-8">
                    <div className="flex items-center justify-between fp-data text-[10px] text-paper-dim">
                      <span className="fp-label text-[10px]">{prob.caption}</span>
                      {prob.pct !== null && <span className="font-bold text-paper">{prob.pct}%</span>}
                    </div>
                    {prob.pct !== null && (
                      <div className="relative mt-1 h-2 overflow-hidden border border-rule bg-ink-0">
                        <div className={`h-full ${prob.bar}`} style={{ width: `${Math.max(4, prob.pct)}%` }} />
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
