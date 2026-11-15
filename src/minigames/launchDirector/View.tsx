import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { audio, useAudioSettings } from '../../assets/audio'
import type { AudioId } from '../../assets/manifest'
import { roomCue, sayRoom } from '../../assets/ihVoice'
import { advanceAgency, useAgencyStore } from '../../state/agencyStore'
import { useCampusStore } from '../../state/campusStore'
import { useGameStore } from '../../state/gameStore'
import type { Role } from '../../viz/gonogo/stations'
import { ROOMS } from '../../world/rooms/registry'
import type { MinigameProps } from '../contract'
import {
  AUTO_SCRUB_AT_S,
  COUNT_FROM_S,
  HOLD_DAYS,
  SCRUB_DAYS,
  buildResult,
  consoleStates,
  newCountdown,
  resolveHold,
  rng,
  rollHold,
  tickCountdown,
  type Countdown,
  type HoldChoice,
} from './logic'
import { standPoint } from './layout'
import { MissionControlScene } from './Scene'

type Phase = 'poll' | 'board' | 'weather' | 'count' | 'liftoff'

const POLL_VOICE: Record<Role, AudioId> = {
  ground: 'voice.poll-ground',
  science: 'voice.poll-science',
  space: 'voice.poll-space',
  launch: 'voice.poll-launch',
}
const TONE = { green: 'text-go', yellow: 'text-caution', red: 'text-nogo' } as const
const RULE = { green: 'border-l-go', yellow: 'border-l-caution', red: 'border-l-nogo' } as const

/** Longest wait for one voice line before the poll moves on anyway */
const VOICE_MAX_MS = 4500
const LIFTOFF_HANDOFF_MS = 2600

/** Hold days move the agency clock (cash flow and all), like any day at the base */
function slipDays(days: number) {
  if (days <= 0) return
  useAgencyStore.setState((s) => advanceAgency(s, s.day + days))
}

export default function LaunchDirector({ design, difficulty, onComplete, onExit, replay }: MinigameProps) {
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  // getGoNoGo reads design and difficulty from the store; they are the deps that change it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => getGoNoGo(), [getGoNoGo, design, difficulty])
  const consoles = useMemo(() => consoleStates(result), [result])
  const red = consoles.filter((c) => c.status === 'red')

  const [phase, setPhase] = useState<Phase>('poll')
  const [answered, setAnswered] = useState(-1)
  const [asking, setAsking] = useState<Role | null>(null)
  const [near, setNear] = useState<Role | null>(null)
  const [walkTo, setWalkTo] = useState<{ x: number; z: number; n: number } | null>(null)
  const [caption, setCaption] = useState<string | null>(null)

  // Today's weather and range, rolled once per visit
  const rand = useMemo(() => rng((Math.random() * 2 ** 31) | 0), [])
  const hold = useMemo(() => rollHold(rand), [rand])
  const [choice, setChoice] = useState<HoldChoice | null>(null)
  const [countdown, setCountdown] = useState<Countdown>(() => newCountdown())
  const holding = useRef(false)
  const daysLost = useRef(0)
  const startedAt = useRef(performance.now())
  const timers = useRef<number[]>([])
  const done = useRef(false)

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  /* ---------- the poll ---------- */
  const afterPoll = useCallback(
    (anyRed: boolean) => {
      if (anyRed) {
        setPhase('board')
        sayRoom('mission-control', 'hint')
        return
      }
      if (hold) {
        setPhase('weather')
        audio.say('ih.launch.hold')
        setCaption(hold.text)
      } else {
        setPhase('count')
        sayRoom('mission-control', 'success')
        audio.say('ih.launch.countdown')
      }
    },
    [hold],
  )

  // Each poll run gets a token; leaving the room or polling again cancels the older run
  const pollRun = useRef(0)
  useEffect(
    () => () => {
      pollRun.current += 1
      // Leaving the room: the poll's queued lines go with it
      audio.hush()
    },
    [],
  )

  /** Speak, then wait until the voice queue is quiet, so the consoles light as their answer is heard */
  const speak = useCallback((id: AudioId, maxMs = VOICE_MAX_MS) => {
    audio.say(id)
    return new Promise<void>((resolve) => {
      const t0 = performance.now()
      const check = () => {
        if (!useAudioSettings.getState().caption && performance.now() - t0 > 150) return resolve()
        if (performance.now() - t0 > maxMs) return resolve()
        window.setTimeout(check, 80)
      }
      window.setTimeout(check, 80)
    })
  }, [])

  const runPoll = useCallback(
    async (withIntro: boolean) => {
      const run = ++pollRun.current
      const live = () => pollRun.current === run
      setPhase('poll')
      setAnswered(-1)
      setAsking(null)
      if (withIntro) await speak(roomCue('mission-control', 'intro'))
      if (!live()) return
      await speak('voice.poll-open')
      for (const [i, c] of consoles.entries()) {
        if (!live()) return
        setAsking(c.role)
        await speak(POLL_VOICE[c.role])
        if (!live()) return
        setAnswered(i)
        setAsking(null)
        audio.play(c.status === 'red' ? 'sfx.error' : 'sfx.select')
        await speak(c.status === 'red' ? 'voice.no-go' : i === consoles.length - 1 ? 'voice.go-flight' : 'voice.go')
      }
      if (!live()) return
      const anyRed = consoles.some((c) => c.status === 'red')
      audio.play(anyRed ? 'sfx.alarm' : 'sfx.go')
      await speak(anyRed ? 'voice.poll-hold' : 'voice.poll-all-go')
      if (live()) afterPoll(anyRed)
    },
    [consoles, speak, afterPoll],
  )

  useEffect(() => {
    void runPoll(true)
    // once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- weather hold ---------- */
  const decide = (c: HoldChoice) => {
    if (!hold || choice) return
    setChoice(c)
    const out = resolveHold(hold, c, rand())
    if (c === 'hold') {
      daysLost.current += HOLD_DAYS
      slipDays(HOLD_DAYS)
      audio.play('sfx.snap')
      setCaption(`Holding ${HOLD_DAYS} day. ${hold.kind === 'wind' ? 'The wind dropped overnight.' : 'The range is clear this morning.'} Hands on the key.`)
    } else {
      audio.play('sfx.click')
      setCaption(`Pressing on: ${Math.round(hold.scrubChance * 100)}% chance the sequencer stops us at T-${AUTO_SCRUB_AT_S}.`)
    }
    setCountdown(newCountdown(out.scrubAtT3))
    setPhase('count')
    audio.say('ih.launch.countdown')
  }

  /* ---------- hold-to-launch ---------- */
  useEffect(() => {
    if (phase !== 'count') return
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      holding.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      e.preventDefault()
      holding.current = false
    }
    const release = () => (holding.current = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerup', release)
    window.addEventListener('blur', release)
    let last = performance.now()
    let raf = requestAnimationFrame(function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      setCountdown((c) => tickCountdown(c, dt, holding.current))
      raf = requestAnimationFrame(loop)
    })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('blur', release)
    }
  }, [phase])

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    const r = buildResult({
      consoles,
      hold,
      choice,
      daysLost: daysLost.current,
      scrubs: countdown.scrubs,
      durationS: (performance.now() - startedAt.current) / 1000,
    })
    onComplete(r)
    // Hand over to the flight exactly as the classic Go / No-Go launch key does
    useGameStore.getState().startSimulation()
  }, [consoles, hold, choice, countdown.scrubs, onComplete])

  // Sounds and captions on countdown transitions
  const prev = useRef(countdown)
  useEffect(() => {
    const p = prev.current
    prev.current = countdown
    if (countdown.phase === 'counting' && p.phase !== 'counting') {
      audio.play('sfx.click')
      setCaption(null)
    }
    if (countdown.phase === 'counting' && Math.ceil(countdown.t) < Math.ceil(p.t)) audio.play('sfx.click')
    if (countdown.phase === 'scrubbed' && p.phase === 'counting') {
      if (countdown.reason === 'weather' && hold) {
        daysLost.current += SCRUB_DAYS
        slipDays(SCRUB_DAYS)
        audio.play('sfx.alarm')
        setCaption(
          hold.kind === 'wind'
            ? `Gust over ${hold.limit} kn at T-${AUTO_SCRUB_AT_S}: the sequencer scrubbed. Recycle cost ${SCRUB_DAYS} days. Let go, then hold again.`
            : `The boat is still in the zone at T-${AUTO_SCRUB_AT_S}: range safety scrubbed. Recycle cost ${SCRUB_DAYS} days. Let go, then hold again.`,
        )
      } else {
        audio.play('sfx.fit-error')
        setCaption(`You let go at T-${Math.ceil(p.t)}: scrub. Let go, then hold the key again from T-${COUNT_FROM_S}.`)
      }
    }
    if (countdown.phase === 'liftoff' && p.phase !== 'liftoff') {
      setPhase('liftoff')
      audio.play('sfx.ignition')
      audio.say('ih.launch.liftoff')
      later(finish, LIFTOFF_HANDOFF_MS)
    }
  }, [countdown, hold, later, finish])

  /* ---------- walking ---------- */
  const goToConsole = useCallback((role: Role) => {
    const s = standPoint(role)
    setWalkTo((w) => ({ ...s, n: (w?.n ?? 0) + 1 }))
  }, [])
  const onFloorClick = useCallback((p: THREE.Vector3) => setWalkTo((w) => ({ x: p.x, z: p.z, n: (w?.n ?? 0) + 1 })), [])

  const skip = () => {
    if (!result.canGo) return
    finish()
  }

  // Not during the poll, and not during the count (the key is the only thing that matters then)
  const nearConsole = near && (phase === 'board' || phase === 'weather') ? consoles.find((c) => c.role === near) : null

  const objective =
    phase === 'poll'
      ? 'Flight is polling the consoles…'
      : phase === 'board'
        ? `${red.map((c) => c.title).join(' and ')} said NO-GO. Walk to ${red.length > 1 ? 'a red console' : 'the red console'} to see the fix.`
        : phase === 'weather'
          ? 'Every console is GO. Now the weather: your call, Director.'
          : phase === 'count'
            ? countdown.phase === 'counting'
              ? `Keep holding… T-${Math.ceil(countdown.t)}`
              : `Hold SPACE (or the LAUNCH key) from T-${COUNT_FROM_S}. Let go and it scrubs.`
            : 'Liftoff!'

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-0 text-paper" data-testid="launch-director" data-phase={phase} data-answered={answered} data-countdown={countdown.phase}>
      <div className="absolute inset-0">
        <MissionControlScene
          consoles={consoles}
          answered={answered}
          asking={asking}
          countdown={countdown}
          hold={phase === 'weather' || (choice === 'proceed' && phase !== 'liftoff') ? hold : null}
          holdOpen={phase === 'weather'}
          walkTo={walkTo}
          controlsEnabled={phase !== 'count' && phase !== 'liftoff'}
          onNear={setNear}
          onConsoleClick={goToConsole}
          onFloorClick={onFloorClick}
        />
      </div>

      {/* HUD 1: one objective line */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
        <p className="rounded-full bg-ink-1/80 px-4 py-1.5 text-sm text-paper shadow" data-testid="objective">
          {objective}
        </p>
      </div>

      {/* HUD 2: the console you stand at (≤ 30% of the screen) */}
      {nearConsole && (
        <div
          className={`absolute right-4 top-16 z-20 w-[min(22rem,30vw)] border-l-2 bg-ink-1/90 p-3 shadow ${RULE[nearConsole.status]}`}
          data-testid="console-card"
          data-role={nearConsole.role}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="fp-label text-paper-dim">{nearConsole.title} console</span>
            <span className={`fp-data text-sm font-bold ${TONE[nearConsole.status]}`}>{nearConsole.call}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {nearConsole.lines.map((l) => (
              <li key={l.check.resource} className={`fp-data text-xs ${TONE[l.check.status]}`}>
                {l.headline}
              </li>
            ))}
            {nearConsole.lines.length === 0 && <li className="fp-data text-xs text-paper-faint">Nothing to check at this console.</li>}
          </ul>
          {nearConsole.lines[0] && nearConsole.lines[0].check.status !== 'green' && (
            <p className="mt-2 text-xs text-paper">{nearConsole.lines[0].check.reason}</p>
          )}
          {nearConsole.status === 'red' && <p className="mt-2 text-xs text-nogo">A red console cannot say GO. Fix it, then come back.</p>}
          {nearConsole.fixRoom && (
            <button
              type="button"
              data-testid="fix-room"
              className="mt-3 text-sm font-semibold text-kapton underline decoration-2 underline-offset-4 hover:text-paper"
              onClick={() => useCampusStore.getState().enterRoom(nearConsole.fixRoom!)}
            >
              Go back to the {ROOMS[nearConsole.fixRoom].title}
            </button>
          )}
        </div>
      )}

      {/* HUD 3: the one thing to do now */}
      <div className="absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4">
        {caption && (
          <div className="max-w-[40rem] border-l-2 border-kapton bg-ink-1/90 px-4 py-2 text-sm text-paper shadow" role="status" data-testid="caption">
            {caption}
          </div>
        )}
        {phase === 'weather' && hold && (
          <div className="flex gap-3" data-testid="hold-choice">
            <button type="button" className="fp-btn-secondary" data-testid="choose-hold" onClick={() => decide('hold')}>
              Hold the count · +{HOLD_DAYS} day
            </button>
            <button type="button" className="fp-btn-primary" data-testid="choose-proceed" onClick={() => decide('proceed')}>
              Proceed · {Math.round(hold.scrubChance * 100)}% scrub risk
            </button>
          </div>
        )}
      </div>

      {phase === 'count' && (
        <div className="absolute bottom-8 right-8 z-20 flex flex-col items-center gap-1">
          <button
            type="button"
            data-testid="launch-key"
            aria-label="Hold to launch"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              holding.current = true
            }}
            onPointerUp={() => (holding.current = false)}
            onPointerLeave={() => (holding.current = false)}
            onContextMenu={(e) => e.preventDefault()}
            className={`fp-data h-20 w-20 touch-none select-none rounded-full border-4 text-sm font-bold tracking-widest shadow-lg transition-colors ${
              countdown.phase === 'counting' ? 'border-kapton bg-kapton text-kapton-ink' : 'border-nogo bg-ink-2 text-paper'
            }`}
          >
            LAUNCH
          </button>
          <span className="fp-label text-[10px] text-paper-faint">hold · or SPACE</span>
        </div>
      )}

      <div className="absolute left-4 top-4 z-30 flex gap-3">
        <button type="button" className="fp-label text-paper-dim hover:text-paper" onClick={onExit} data-testid="leave" disabled={phase === 'liftoff'}>
          ← Campus
        </button>
        {phase === 'board' && (
          <button type="button" className="fp-label text-paper-dim hover:text-paper" onClick={() => void runPoll(false)} data-testid="repoll">
            Poll again
          </button>
        )}
        {replay && result.canGo && phase !== 'liftoff' && (
          <button type="button" className="fp-label text-kapton" onClick={skip} data-testid="skip">
            Skip to launch
          </button>
        )}
      </div>
    </div>
  )
}
