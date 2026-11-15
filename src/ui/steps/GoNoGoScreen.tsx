import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../assets/audio'
import type { AudioId } from '../../assets/manifest'
import { holdProgress, sweptAngle } from '../../scene/interaction/reactions'
import { glossaryKeyForLabel } from '../../data/glossary'
import { cannotMeetBrief } from '../../sim/checks'
import { percent } from '../../sim/odds'
import type { Budgets, CheckResult } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { checkFigures } from '../../viz/checkMargin'
import { SynergyStrip } from '../../viz/DesignDeltaLine'
import { POLL_ORDER, ROLE_INFO, stations, type Role, type Station } from '../../viz/gonogo/stations'
import { POLL_TIMING, pollEnd } from '../../viz/gonogo/pollEnd'
import { InlineCaptions } from '../kit/Captions'
import { fixLocation } from '../../viz/missionMap'
import { checkHeadline } from '../../viz/gonogo/checkHeadline'
import { Details, Eng, Stamp, Tag, type StampVerdict, type TagTone } from '../kit'
import { Tooltip } from '../Tooltip'
import { goCall } from './gonogo/headline'
import { useSuccessEstimate } from '../useOdds'
import { PlanPanel, PlanRow, PlanRows } from './plan/PlanPanel'

/*
 * Step 08 · Launch: the Go / No-Go poll on one screen. On the left the four stations as lamps
 * and only what needs attention, one line each with its Fix link; on the right one panel with
 * the verdict, the chance of full success and the launch key. Screen budget (Jakob, 15 Nov): the
 * poll runs on entry, the stamp stands alone, at most three numbers show before Details, and every
 * check in full waits behind Details. Every status comes from goNoGo(); this step changes nothing.
 */

const POLL_VOICE: Record<Role, AudioId> = {
  ground: 'voice.poll-ground',
  science: 'voice.poll-science',
  space: 'voice.poll-space',
  launch: 'voice.poll-launch',
}

/** The poll's three answers */
const VERDICT = {
  green: { label: 'GO', stamp: 'go', tag: 'go' },
  yellow: { label: 'CAUTION', stamp: 'caution', tag: 'caution' },
  red: { label: 'NO-GO', stamp: 'nogo', tag: 'nogo' },
} as const satisfies Record<CheckResult['status'], { label: string; stamp: StampVerdict; tag: TagTone }>

const DOT = { green: 'bg-go', yellow: 'bg-caution', red: 'bg-nogo' } as const
const RULE = { green: 'border-l-go', yellow: 'border-l-caution', red: 'border-l-nogo' } as const
const GLOW = {
  green: 'shadow-[0_0_14px_var(--color-go)]',
  yellow: 'shadow-[0_0_14px_var(--color-caution)]',
  red: 'shadow-[0_0_14px_var(--color-nogo)]',
} as const

/**
 * One station of the poll as a lamp (screen budget): its name, its building and its answer, nothing
 * else; hover it for the checks it answers for. stamp: 'static' shows the answer at rest, 'thunk'
 * stamps it down as the station answers, 'none' leaves it open while the poll has not reached it.
 */
function PollLamp({ station, stamp, active, run }: { station: Station; stamp: 'static' | 'thunk' | 'none'; active: boolean; run: number }) {
  const v = VERDICT[station.status]
  const lit = stamp !== 'none'
  return (
    <div
      data-testid="poll-lamp"
      title={`${ROLE_INFO[station.role].buildingName}: ${station.checks.map((c) => c.resource).join(', ') || 'nothing to check'}`}
      className={`flex min-w-0 flex-col items-center gap-2 rounded-lg border bg-ink-1/70 px-3 py-3 text-center transition-colors ${active ? 'border-kapton' : 'border-rule'}`}
    >
      <span
        aria-hidden
        className={`h-4 w-4 rounded-full transition-all ${lit ? `${DOT[station.status]} ${GLOW[station.status]}` : active ? 'animate-pulse bg-kapton' : 'bg-ink-3'}`}
      />
      <div className="min-w-0">
        <div className="font-display text-base font-bold leading-tight text-paper">{station.title}</div>
        <div className="truncate fp-label text-[0.6rem] text-paper-faint">{station.building}</div>
      </div>
      <div className="flex h-7 items-center">
        {lit ? (
          <Stamp key={run} verdict={v.stamp} size="sm" animate={stamp === 'thunk'}>
            {v.label}
          </Stamp>
        ) : (
          <span className="fp-label inline-block border border-dashed border-rule px-2 py-0.5 text-[0.6rem] text-paper-faint">{active ? 'Polling' : 'Awaiting'}</span>
        )}
      </div>
    </div>
  )
}

/** A red or yellow check as one line and its Fix link (screen budget); the full card waits behind Details */
function CheckLine({ check }: { check: CheckResult }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  return (
    <div data-testid="check-line" className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-r-md border-l-2 bg-ink-1/70 px-3 py-2 ${RULE[check.status]}`}>
      <div className="flex min-w-0 items-center gap-3">
        <Tag tone={VERDICT[check.status].tag}>{VERDICT[check.status].label}</Tag>
        <span className="text-sm text-paper">
          <span className="fp-label mr-2 text-paper-dim">{check.resource}</span>
          {checkHeadline(check)}
        </span>
      </div>
      {check.fixStep && (
        <button
          type="button"
          onClick={() => setDesignStep(check.fixStep!)}
          className="text-sm font-semibold text-kapton underline decoration-2 underline-offset-4 hover:text-paper"
        >
          Fix at {fixLocation(check.fixStep)}
        </button>
      )}
    </div>
  )
}

function CheckRow({ check, budgets }: { check: CheckResult; budgets: Budgets }) {
  const fig = checkFigures(check, budgets)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const v = VERDICT[check.status]
  return (
    <div className={`fp-sheet border-l-2 p-4 ${RULE[check.status]}`} data-tone="raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="fp-label text-paper">
            <Tooltip term={glossaryKeyForLabel(check.resource) ?? ''}>{check.resource}</Tooltip>
          </div>
          <Eng as="div" className="mt-1 fp-data text-xs text-paper-dim">
            {fig.value.toFixed(1)} / {fig.limit.toFixed(1)} {check.unit}
            {check.resource === 'Budget' && ' spendable'}
            {/* A red row with room left on paper: its blocking reason is right below, no "+ margin" */}
            {!fig.margin.startsWith('Blocked') && ` (${fig.margin})`}
            {fig.note && ` · ${fig.note}`}
          </Eng>
        </div>
        <Tag tone={v.tag}>{v.label}</Tag>
      </div>
      <div className="mt-2 text-sm text-paper">{check.reason}</div>
      {/* The brightest line of the card: where to fix it, one click away (QC contrast round) */}
      {check.fixStep && (
        <button
          type="button"
          onClick={() => setDesignStep(check.fixStep!)}
          className="mt-2 text-sm font-semibold text-kapton underline decoration-2 underline-offset-4 hover:text-paper"
        >
          Fix at {fixLocation(check.fixStep)}
        </button>
      )}
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
    { pct: (odds.success / total) * 100, cls: 'bg-go', title: `Full success: ${percent(odds.success)}` },
    { pct: (odds.partial / total) * 100, cls: 'bg-caution', title: `Part of the science: ${percent(odds.partial)}` },
    { pct: (odds.failed / total) * 100, cls: 'bg-nogo', title: `Failed: ${percent(odds.failed)}` },
  ]
  return (
    <div aria-live="polite">
      <div className="fp-data text-[0.86rem] text-paper">{`Chance of full success: about ${percent(odds.success)}`}</div>
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden bg-ink-1">
        {parts.map((p) => p.pct > 0 && <div key={p.cls} title={p.title} className={p.cls} style={{ width: `${p.pct}%` }} />)}
      </div>
    </div>
  )
}

/** The odds in full, for Details: what the bar's three colours are */
function OddsBreakdown() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const odds = useSuccessEstimate(design, difficulty)
  if (!odds) return null
  return (
    <p className="fp-data text-xs text-paper-dim">
      {`From ${odds.runs} test flights of this design on standing orders: `}
      <span className="text-go">full success {percent(odds.success)}</span>
      {', '}
      <span className="text-caution">part of the science {percent(odds.partial)}</span>
      {', '}
      <span className="text-nogo">failed {percent(odds.failed)}</span>.
    </p>
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
        <span>{!canGo ? 'Fix the no-go first' : holding ? 'Holding to launch…' : armed ? 'Hold to launch' : 'Turn the key'}</span>
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

  // The poll: stations answer one by one (null = not started, -1 = poll open, POLL_ORDER.length = finished).
  // It runs when the screen opens and after any change (screen budget: no "Run the poll" button;
  // the launch is gated on canGo only, never on the poll)
  const [step, setStep] = useState<number | null>(null)
  // Each run of the poll remounts the stamps so they thunk down again
  const [run, setRun] = useState(0)
  // Only the first poll on entry plays at full length, with every station's voice; a re-poll after a
  // design change runs about 3× faster with snaps only, so the new lamps show almost at once.
  // Keyed on the result itself: React's StrictMode runs this effect twice for the same result in dev
  const lastPolled = useRef<typeof result | null>(null)
  useEffect(() => {
    const end = pollEnd(result, cannotMeetBrief(result), st)
    const full = lastPolled.current === null || lastPolled.current === result
    lastPolled.current = result
    const timers: number[] = []
    let cancelled = false
    const answer = (s: Station, i: number) => {
      setStep(i)
      audio.play(s.status === 'red' ? 'sfx.error' : 'sfx.select')
      audio.play('sfx.snap')
    }
    const close = () => {
      setStep(POLL_ORDER.length)
      // The closing line matches the stamp: never "all stations are go" over a caution (QC, 15 Nov)
      if (end.kind === 'caution') void audio.note(end.text)
      else void audio.say(end.voice)
      audio.play(end.kind === 'nogo' ? 'sfx.alarm' : 'sfx.go')
      audio.play('sfx.snap')
    }
    setRun((r) => r + 1)
    setStep(POLL_OPEN)
    if (full) {
      // The full poll waits for its words: the director asks, the station's stamp thunks as it answers.
      // Paced by the voice loop, no line is crowded out (the queue keeps 4) and lamps and voice stay together.
      // Started on a timer so React's StrictMode double effect cancels it before anything is said.
      timers.push(
        window.setTimeout(async () => {
          await audio.say('voice.poll-open')
          for (const [i, s] of st.entries()) {
            if (cancelled) return
            await audio.say(POLL_VOICE[s.role])
            if (cancelled) return
            answer(s, i)
            await audio.say(s.status === 'red' ? 'voice.no-go' : i === st.length - 1 ? 'voice.go-flight' : 'voice.go')
          }
          if (!cancelled) close()
        }, 0),
      )
    } else {
      // A re-poll after a design change: about 3× faster, snaps only, then the closing line
      const t = POLL_TIMING.fast
      st.forEach((s, i) => timers.push(window.setTimeout(() => answer(s, i), t.open + i * t.gap)))
      timers.push(window.setTimeout(close, t.open + st.length * t.gap + t.end))
    }
    return () => {
      cancelled = true
      timers.forEach(window.clearTimeout)
      // Words of a poll that no longer applies are not spoken
      audio.hush()
    }
  }, [result, st])

  const polling = step !== null && step < POLL_ORDER.length
  const polled = step === POLL_ORDER.length

  // Honest wording: GO, OVER A LIMIT / GO, BELOW TARGET / GO WITH CAUTION, with the row it is about.
  // A Go must not read as an endorsement of a craft that cannot meet the brief (Jakob, 14 Nov)
  const call = goCall(result)
  const doomed = cannotMeetBrief(result)
  const verdict: StampVerdict = !result.canGo ? 'nogo' : result.warnings.length ? 'caution' : 'go'
  const label = !result.canGo ? 'NO-GO' : doomed ? 'GO, BUT IT CANNOT MEET THE BRIEF' : result.warnings.length ? call.label : 'GO FOR LAUNCH'

  const critical = result.checks.filter((c) => c.status === 'red')
  const warnings = result.checks.filter((c) => c.status === 'yellow')
  const passed = result.checks.filter((c) => c.status === 'green')
  const issues = [...critical, ...warnings]
  const transfer = budgets.transferTurns === null ? 'no way there' : budgets.transferTurns === 0 ? 'about 5 days' : `${budgets.transferTurns} months`

  // One screen: lamps and issues on the left, the call on the right, every check in full behind
  // Details under the issues (the Details panel comes last in the page: the screen-budget rule)
  return (
    <div className="grid h-full min-h-[560px] grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 overflow-hidden p-4">
      <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-3">
        <h2 className="fp-label text-[0.7rem] tracking-[0.16em] text-paper">Go / No-Go poll · each station answers for its checks</h2>
        <div className="grid grid-cols-4 gap-3">
          {st.map((s, i) => (
            <PollLamp key={s.role} station={s} run={run} active={step === i} stamp={step === null ? 'static' : step >= i ? 'thunk' : 'none'} />
          ))}
        </div>
        {/* The poll's voice loop, under the lamps it narrates instead of over the header and the step tabs */}
        <InlineCaptions />
        <h2 className={`mt-1 fp-label text-[0.7rem] tracking-[0.16em] ${issues.length ? 'text-paper' : 'text-go'}`}>
          {issues.length ? 'Needs attention' : 'Nothing needs attention: every check is go'}
        </h2>
        {issues.length > 0 && (
          <div className="flex flex-col gap-2" data-testid="check-issues">
            {issues.map((c) => (
              <CheckLine key={c.resource} check={c} />
            ))}
          </div>
        )}
      </div>

      <div className="col-start-2 row-span-2 row-start-1 flex min-h-0">
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
            {!polling && result.canGo && call.reason && <p className="mt-3 text-center text-[0.76rem] leading-snug text-caution">{call.reason}</p>}
          </div>
          <SuccessOdds />
          <div className="mt-auto flex flex-col gap-2">
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

      {/* Everything else stays reachable behind the shared Details control (checklist: every resource check) */}
      <div className="col-start-1 row-start-2 min-h-0 overflow-y-auto pr-1">
        <Details id="gonogo" label="Details: every check in full">
          <div className="mt-3 space-y-5">
            <PlanRows>
              <PlanRow label="Ready" value={`month ${budgets.totalPrepTurns}`} sub={`build ${budgets.buildTurns} · test ${budgets.testTurns}`} />
              <PlanRow label="Ride leaves" value={`month ${budgets.rideTurn}`} tone={budgets.timeMarginTurns < 0 ? 'red' : undefined} />
              <PlanRow label="To the Moon" value={transfer} tone={budgets.transferTurns === null ? 'red' : undefined} />
              <PlanRow label="Budget left" value={`$${budgets.budgetMargin.toFixed(1)}M`} tone={budgets.budgetMargin < 0 ? 'red' : undefined} />
            </PlanRows>
            <OddsBreakdown />
            <SynergyStrip step="go-nogo" />
            {[
              { list: critical, title: `Critical Issues (${critical.length})`, cls: 'text-nogo' },
              { list: warnings, title: `Warnings (${warnings.length})`, cls: 'text-caution' },
              { list: passed, title: `Passed (${passed.length})`, cls: 'text-go' },
            ]
              .filter((g) => g.list.length > 0)
              .map((g) => (
                <div key={g.title}>
                  <h2 className={`mb-3 border-b border-rule pb-1 fp-label ${g.cls}`}>{g.title}</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.list.map((check, i) => (
                      <CheckRow key={i} check={check} budgets={budgets} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </Details>
      </div>
    </div>
  )
}
