import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../assets/audio'
import type { AudioId } from '../../assets/manifest'
import { holdProgress, sweptAngle } from '../../scene/interaction/reactions'
import { glossaryKeyForLabel } from '../../data/glossary'
import { cannotMeetBrief, getGoNoGoSummary } from '../../sim/checks'
import { percent } from '../../sim/odds'
import type { CheckResult } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { POLL_ORDER, stations, type Role, type Station } from '../../viz/gonogo/stations'
import { fixLocation } from '../../viz/missionMap'
import { Stamp, type StampVerdict } from '../kit'
import { Tooltip } from '../Tooltip'
import { goCall } from './gonogo/headline'
import { useSuccessEstimate } from '../useOdds'
import { PlanPanel, PlanRow, PlanRows } from './plan/PlanPanel'

/*
 * Step 08 · Launch: the Go / No-Go poll on one screen. On the left the four stations, each with
 * its checks as coloured chips, and under them only what needs attention, each with the way to
 * fix it. On the right one panel: the verdict, the chance of full success, when the ride leaves,
 * and the launch key. Every status comes from goNoGo(); this step changes nothing in the design.
 */

const POLL_VOICE: Record<Role, AudioId> = {
  ground: 'voice.poll-ground',
  science: 'voice.poll-science',
  space: 'voice.poll-space',
  launch: 'voice.poll-launch',
}

/** The poll's three answers */
const VERDICT = {
  green: { label: 'GO', stamp: 'go', word: 'Go' },
  yellow: { label: 'CAUTION', stamp: 'caution', word: 'Caution' },
  red: { label: 'NO-GO', stamp: 'nogo', word: 'No-go' },
} as const satisfies Record<CheckResult['status'], { label: string; stamp: StampVerdict; word: string }>

const TEXT = { green: 'text-go', yellow: 'text-caution', red: 'text-nogo' } as const
const DOT = { green: 'bg-go', yellow: 'bg-caution', red: 'bg-nogo' } as const
const RULE = { green: 'border-l-go', yellow: 'border-l-caution', red: 'border-l-nogo' } as const

/**
 * One station of the poll: its name, its building, its checks as chips (hover one for its reason)
 * and its answer. stamp: 'static' shows the answer at rest, 'thunk' stamps it down as the station
 * answers, 'none' leaves it open while the poll has not reached it.
 */
function StationCard({ station, stamp, active, run }: { station: Station; stamp: 'static' | 'thunk' | 'none'; active: boolean; run: number }) {
  const v = VERDICT[station.status]
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-ink-1/70 p-3 transition-colors ${active ? 'border-kapton' : 'border-rule'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-base font-bold leading-tight text-paper">{station.title}</div>
          <div className="truncate fp-label text-[0.6rem] text-paper-faint">{station.building}</div>
        </div>
        <div className="shrink-0">
          {stamp === 'none' ? (
            <span className="fp-label inline-block border border-dashed border-rule px-2 py-1 text-[0.6rem] text-paper-faint">{active ? 'Polling' : 'Awaiting'}</span>
          ) : (
            <Stamp key={run} verdict={v.stamp} size="sm" animate={stamp === 'thunk'}>
              {v.label}
            </Stamp>
          )}
        </div>
      </div>
      {station.checks.length === 0 ? (
        <div className="text-[0.72rem] text-paper-faint">Nothing to check here</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {station.checks.map((c) => (
            <li key={c.resource} title={`${c.resource}: ${c.reason}`} className="flex min-w-0 items-baseline gap-2 text-[0.74rem] leading-snug">
              <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${DOT[c.status]}`} aria-hidden />
              <span className={`w-20 shrink-0 fp-label text-[0.62rem] ${c.status === 'green' ? 'text-paper-dim' : TEXT[c.status]}`}>
                <Tooltip term={glossaryKeyForLabel(c.resource) ?? ''}>{c.resource}</Tooltip>
              </span>
              <span className="sr-only">{VERDICT[c.status].word}:</span>
              <span className={`min-w-0 truncate ${c.status === 'green' ? 'text-paper-dim' : 'text-paper'}`}>{c.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A check that is not go: what it says and where to fix it, one click away */
function Attention({ check }: { check: CheckResult }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  return (
    <div className={`rounded-r-md border-l-2 bg-ink-1/70 px-3 py-2 ${RULE[check.status]}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`fp-label text-[0.68rem] ${TEXT[check.status]}`}>
          {check.resource} · {VERDICT[check.status].word}
        </span>
        {check.fixStep && (
          <button
            type="button"
            onClick={() => setDesignStep(check.fixStep!)}
            className="shrink-0 text-[0.74rem] font-semibold text-kapton underline decoration-2 underline-offset-4 hover:text-paper"
          >
            Fix at {fixLocation(check.fixStep)}
          </button>
        )}
      </div>
      <p title={check.reason} className="mt-0.5 line-clamp-2 text-[0.78rem] leading-snug text-paper">
        {check.reason}
      </p>
    </div>
  )
}

/** F2 (Jakob, 14 Nov): the honest chance of full success, from many flights of this design */
function SuccessOdds() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const odds = useSuccessEstimate(design, difficulty)
  if (!odds) return <div className="fp-data text-[0.74rem] text-paper-faint">Working out the chance of full success…</div>
  const total = odds.success + odds.partial + odds.failed || 1
  const parts = [
    { pct: (odds.success / total) * 100, cls: 'bg-go', label: `Full ${percent(odds.success)}`, text: 'text-go' },
    { pct: (odds.partial / total) * 100, cls: 'bg-caution', label: `Partial ${percent(odds.partial)}`, text: 'text-caution' },
    { pct: (odds.failed / total) * 100, cls: 'bg-nogo', label: `Lost ${percent(odds.failed)}`, text: 'text-nogo' },
  ]
  return (
    <div aria-live="polite" title={`From ${odds.runs} test flights of this design on standing orders`}>
      <div className="fp-data text-[0.86rem] text-paper">{`Chance of full success: about ${percent(odds.success)}`}</div>
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden bg-ink-1">
        {parts.map((p) => p.pct > 0 && <div key={p.label} className={p.cls} style={{ width: `${p.pct}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between fp-data text-[0.62rem]">
        {parts.map((p) => (
          <span key={p.label} className={p.text}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Before the poll: -1 = poll open, nobody answered yet */
const POLL_OPEN = -1

const HOLD_NEED_MS = 1500
const KEY_TURN_RAD = Math.PI / 2

/** Turn the launch key in a circle (or click it), then hold the button for 1.5 s to launch */
function LaunchKey({ canGo, onLaunch }: { canGo: boolean; onLaunch: () => void }) {
  const [angle, setAngle] = useState(0)
  const [heldMs, setHeldMs] = useState(0)
  const [holding, setHolding] = useState(false)
  const dialRef = useRef<HTMLButtonElement>(null)
  const holdTimer = useRef<number | null>(null)
  const launchedRef = useRef(false)
  const holdingRef = useRef(false)

  const armed = angle >= KEY_TURN_RAD * 0.92
  const progress = holdProgress(heldMs, HOLD_NEED_MS)
  const deg = Math.round((Math.min(angle, KEY_TURN_RAD) / KEY_TURN_RAD) * 90)

  useEffect(() => {
    if (!canGo) {
      holdingRef.current = false
      setAngle(0)
      setHeldMs(0)
      setHolding(false)
    }
  }, [canGo])

  useEffect(
    () => () => {
      if (holdTimer.current !== null) cancelAnimationFrame(holdTimer.current)
    },
    [],
  )

  const onKeyPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canGo || e.button !== 0) return
    const el = dialRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let lastX = e.clientX
    let lastY = e.clientY
    let acc = angle

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      const delta = sweptAngle(cx, cy, lastX, lastY, ev.clientX, ev.clientY)
      lastX = ev.clientX
      lastY = ev.clientY
      acc = Math.max(0, Math.min(KEY_TURN_RAD, acc + delta))
      if (acc >= KEY_TURN_RAD * 0.92 && angle < KEY_TURN_RAD * 0.92) {
        acc = KEY_TURN_RAD
        audio.play('sfx.click')
      }
      setAngle(acc)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const startHold = () => {
    if (!canGo || !armed || holdingRef.current) return
    holdingRef.current = true
    launchedRef.current = false
    setHolding(true)
    const t0 = performance.now()
    const tick = () => {
      const ms = performance.now() - t0
      setHeldMs(ms)
      if (ms >= HOLD_NEED_MS) {
        if (!launchedRef.current) {
          launchedRef.current = true
          holdingRef.current = false
          setHolding(false)
          audio.play('sfx.ignition')
          onLaunch()
        }
        return
      }
      holdTimer.current = requestAnimationFrame(tick)
    }
    holdTimer.current = requestAnimationFrame(tick)
  }

  const stopHold = () => {
    if (!holdingRef.current) return
    holdingRef.current = false
    if (holdTimer.current !== null) cancelAnimationFrame(holdTimer.current)
    holdTimer.current = null
    setHolding(false)
    if (!launchedRef.current) {
      audio.play('sfx.fit-error')
      setHeldMs(0)
    }
  }

  const circ = 2 * Math.PI * 19
  return (
    <div className="flex items-center gap-2.5">
      <button
        ref={dialRef}
        type="button"
        data-testid="launch-key"
        disabled={!canGo}
        role="slider"
        aria-label="Turn launch key"
        aria-valuemin={0}
        aria-valuemax={90}
        aria-valuenow={deg}
        onPointerDown={onKeyPointerDown}
        onClick={() => {
          if (!canGo) return
          if (!armed) {
            audio.play('sfx.click')
            setAngle(KEY_TURN_RAD)
          }
        }}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
          !canGo ? 'cursor-not-allowed border-rule opacity-40' : armed ? 'border-kapton bg-ink-3' : 'cursor-grab border-rule-strong bg-ink-1 hover:border-kapton'
        }`}
        title={canGo ? 'Turn the key (drag in a circle or click) to arm the launch' : 'Fix the no-go checks first'}
      >
        <span
          aria-hidden="true"
          className="block h-6 w-1.5 rounded-[1px] transition-transform"
          style={{ background: armed ? 'var(--color-kapton)' : 'var(--color-paper-dim)', transform: `rotate(${deg}deg)` }}
        />
      </button>
      <button
        type="button"
        data-testid="launch-hold"
        disabled={!canGo || !armed}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          startHold()
        }}
        onPointerUp={stopHold}
        onPointerCancel={stopHold}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault()
            startHold()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') stopHold()
        }}
        className="tactical-btn-next relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap disabled:opacity-40"
      >
        <svg className="h-4 w-4 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
          <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)} />
        </svg>
        <span>{!canGo ? 'Fix the no-go first' : holding ? 'Holding…' : armed ? 'Hold 1.5 s to launch' : 'Turn the key first'}</span>
      </button>
    </div>
  )
}

export function GoNoGoScreen() {
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const startSimulation = useGameStore((s) => s.startSimulation)

  const budgets = getBudgets()
  // getGoNoGo reads the design and difficulty from the store
  const result = useMemo(() => getGoNoGo(), [getGoNoGo, design, difficulty])
  const st = useMemo(() => stations(result.checks), [result])

  // The poll: stations answer one by one (null = not started, -1 = poll open, POLL_ORDER.length = finished)
  const [step, setStep] = useState<number | null>(null)
  // Each run of the poll remounts the stamps so they thunk down again
  const [run, setRun] = useState(0)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])
  // A changed design means a new poll
  useEffect(() => setStep(null), [result])

  const runPoll = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setRun((r) => r + 1)
    setStep(POLL_OPEN)
    audio.say('voice.poll-open')
    const gap = 1700
    st.forEach((s, i) => {
      timers.current.push(
        window.setTimeout(() => {
          // The station's stamp thunks onto its card as its answer is spoken
          setStep(i)
          audio.say(POLL_VOICE[s.role])
          audio.say(s.status === 'red' ? 'voice.no-go' : i === st.length - 1 ? 'voice.go-flight' : 'voice.go')
          audio.play(s.status === 'red' ? 'sfx.error' : 'sfx.select')
          audio.play('sfx.snap')
        }, 2600 + i * gap),
      )
    })
    timers.current.push(
      window.setTimeout(() => {
        setStep(POLL_ORDER.length)
        audio.say(result.canGo ? 'voice.poll-all-go' : 'voice.poll-hold')
        audio.play(result.canGo ? 'sfx.go' : 'sfx.alarm')
        audio.play('sfx.snap')
      }, 2600 + st.length * gap + 600),
    )
  }

  const polling = step !== null && step < POLL_ORDER.length
  const polled = step === POLL_ORDER.length

  // Honest wording: GO, OVER A LIMIT / GO, BELOW TARGET / GO WITH CAUTION, with the row it is about
  const call = goCall(result)
  // A Go must not read as an endorsement of a craft that cannot meet the brief (Jakob, 14 Nov)
  const label = result.canGo && cannotMeetBrief(result) ? 'GO, BUT IT CANNOT MEET THE BRIEF' : call.label
  const verdict: StampVerdict = !result.canGo ? 'nogo' : result.warnings.length ? 'caution' : 'go'
  const line = !result.canGo
    ? getGoNoGoSummary(result)
    : (call.reason ?? (result.warnings.length ? getGoNoGoSummary(result) : 'Every station is go. Turn the key to launch.'))

  const attention = [...result.checks.filter((c) => c.status === 'red'), ...result.checks.filter((c) => c.status === 'yellow')]
  const passed = result.checks.length - attention.length
  const transfer = budgets.transferTurns === null ? 'no way there' : budgets.transferTurns === 0 ? 'about 5 days' : `${budgets.transferTurns} months`

  return (
    <div className="flex h-full min-h-[560px] gap-4 overflow-hidden p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="fp-label text-[0.7rem] tracking-[0.16em] text-paper">Go / No-Go poll · each station answers for its checks</h2>
          <span className="fp-data text-[0.7rem] text-paper-faint">
            {passed} of {result.checks.length} checks go
          </span>
        </div>
        <div className="grid shrink-0 grid-cols-2 items-start gap-3">
          {st.map((s, i) => (
            <StationCard key={s.role} station={s} run={run} active={step === i} stamp={step === null ? 'static' : step >= i ? 'thunk' : 'none'} />
          ))}
        </div>

        <h2 className={`mt-1 fp-label text-[0.7rem] tracking-[0.16em] ${attention.length ? 'text-paper' : 'text-go'}`}>
          {attention.length ? `Needs attention (${attention.length})` : 'Nothing needs attention'}
        </h2>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          {attention.length ? (
            attention.map((c) => <Attention key={c.resource} check={c} />)
          ) : (
            <p className="text-sm text-paper-dim">Every check is go: the craft is ready to fly.</p>
          )}
        </div>
      </div>

      <PlanPanel>
        <div>
          <div className="fp-label text-[0.66rem] tracking-[0.16em] text-kapton">Launch · the flight director's call</div>
          <div className="mt-3 flex min-h-[3.25rem] items-center justify-center px-2">
            {polling ? (
              <span className="fp-label inline-block border border-dashed border-rule px-3 py-2 text-paper-faint">Poll in progress</span>
            ) : (
              <Stamp key={run} verdict={verdict} size={label.length > 14 ? 'md' : 'lg'} animate={polled} className="max-w-full whitespace-normal text-center leading-tight">
                {label}
              </Stamp>
            )}
          </div>
          <p className={`mt-3 line-clamp-2 text-[0.76rem] leading-snug ${TEXT[verdict === 'go' ? 'green' : verdict === 'caution' ? 'yellow' : 'red']}`}>{line}</p>
        </div>
        <SuccessOdds />
        <PlanRows>
          <PlanRow label="Ready" value={`month ${budgets.totalPrepTurns}`} sub={`build ${budgets.buildTurns} · test ${budgets.testTurns}`} />
          <PlanRow label="Ride leaves" value={`month ${budgets.rideTurn}`} tone={budgets.timeMarginTurns < 0 ? 'red' : undefined} />
          <PlanRow label="To the Moon" value={transfer} tone={budgets.transferTurns === null ? 'red' : undefined} />
          <PlanRow label="Budget left" value={`$${budgets.budgetMargin.toFixed(1)}M`} tone={budgets.budgetMargin < 0 ? 'red' : undefined} />
        </PlanRows>

        <div className="mt-auto flex flex-col gap-2">
          <button type="button" onClick={runPoll} disabled={polling} className="tactical-btn-back w-full bg-ink-1 disabled:opacity-50">
            {polled ? 'Poll again' : 'Run the poll'}
          </button>
          <LaunchKey canGo={result.canGo} onLaunch={startSimulation} />
          <div className="flex gap-2">
            <button type="button" onClick={() => setDesignStep('comms')} className="tactical-btn-back flex-1 whitespace-nowrap bg-ink-1">
              ← Back
            </button>
            <button
              type="button"
              data-testid="launch-accessible"
              onClick={() => result.canGo && startSimulation()}
              disabled={!result.canGo}
              className="tactical-btn-back flex-1 whitespace-nowrap bg-ink-1 disabled:opacity-40"
              title="Launch without the key"
            >
              {result.canGo ? 'Launch now' : 'Fix issues first'}
            </button>
          </div>
        </div>
      </PlanPanel>
    </div>
  )
}
