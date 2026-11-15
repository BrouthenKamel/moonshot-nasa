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
import { fixLocation } from '../../viz/missionMap'
import { checkHeadline } from '../../viz/gonogo/checkHeadline'
import { Details, Eng, Stamp, StepHeader, Tag, stepTitle, type StampVerdict, type TagTone } from '../kit'
import { Tooltip } from '../Tooltip'
import { goCall } from './gonogo/headline'
import { useSuccessEstimate } from '../useOdds'

const POLL_VOICE: Record<Role, AudioId> = {
  ground: 'voice.poll-ground',
  science: 'voice.poll-science',
  space: 'voice.poll-space',
  launch: 'voice.poll-launch',
}

/** The poll's three answers, as rubber stamps and inventory tags */
const VERDICT = {
  green: { label: 'GO', stamp: 'go', tag: 'go' },
  yellow: { label: 'CAUTION', stamp: 'caution', tag: 'caution' },
  red: { label: 'NO-GO', stamp: 'nogo', tag: 'nogo' },
} as const satisfies Record<CheckResult['status'], { label: string; stamp: StampVerdict; tag: TagTone }>

const RULE = { green: 'border-l-go', yellow: 'border-l-caution', red: 'border-l-nogo' } as const

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

/** A red or yellow check as one line and its Fix link (screen budget); the full card waits behind Details */
function CheckLine({ check }: { check: CheckResult }) {
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const v = VERDICT[check.status]
  return (
    <div className={`fp-sheet flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-l-2 px-4 py-2.5 ${RULE[check.status]}`} data-tone="raised" data-testid="check-line">
      <div className="flex min-w-0 items-center gap-3">
        <Tag tone={v.tag}>{v.label}</Tag>
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

/** F2 (Jakob, 14 Nov): the honest chance of full success, from many flights of this design */
function SuccessOdds() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const odds = useSuccessEstimate(design, difficulty)
  const total = odds ? odds.success + odds.partial + odds.failed : 1
  const sPct = odds && total > 0 ? (odds.success / total) * 100 : 0
  const pPct = odds && total > 0 ? (odds.partial / total) * 100 : 0
  const fPct = odds && total > 0 ? (odds.failed / total) * 100 : 0

  return (
    <div className="fp-sheet mt-4 p-4 text-paper" data-tone="inset" aria-live="polite">
      {odds ? (
        <>
          <div className="fp-data text-base font-semibold text-paper">{`Chance of full success: about ${percent(odds.success)}`}</div>
          <div className="relative mt-2.5 h-3 overflow-hidden border border-rule bg-ink-0">
            <div className="flex h-full">
              {sPct > 0 && (
                <div style={{ width: `${sPct}%` }} className="bg-go transition-all duration-300" title={`Full Success: ${percent(odds.success)}`} />
              )}
              {pPct > 0 && (
                <div
                  style={{ width: `${pPct}%` }}
                  className="border-l border-ink-0 bg-caution transition-all duration-300"
                  title={`Partial Science: ${percent(odds.partial)}`}
                />
              )}
              {fPct > 0 && (
                <div
                  style={{ width: `${fPct}%` }}
                  className="border-l border-ink-0 bg-nogo transition-all duration-300"
                  title={`Failed: ${percent(odds.failed)}`}
                />
              )}
            </div>
            <div className="hud-bar-segments pointer-events-none absolute inset-0" />
          </div>
        </>
      ) : (
        <div className="fp-data text-sm text-paper-faint">Working out the chance of full success…</div>
      )}
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

/**
 * One station's poll slip: its name, building and the checks it answers for.
 * stamp: 'static' shows the verdict at rest, 'thunk' stamps it down as the station answers,
 * 'none' leaves the box empty while the poll has not reached it.
 */
function PollSlip({ station, stamp, active, run }: { station: Station; stamp: 'static' | 'thunk' | 'none'; active: boolean; run: number }) {
  const v = VERDICT[station.status]
  // A lamp (screen budget): the station and its answer, nothing else
  return (
    <div
      className={`fp-sheet flex items-center justify-between gap-2 px-3 py-2 transition-colors ${active ? 'border-kapton' : ''}`}
      data-tone="raised"
      data-testid="poll-lamp"
      title={`${ROLE_INFO[station.role].buildingName}: ${station.checks.map((c) => c.resource).join(', ') || 'nothing to check'}`}
    >
      <span className="fp-display text-sm text-paper">{station.title}</span>
      {stamp === 'none' ? (
        <span className="fp-label inline-block border border-dashed border-rule px-2 py-0.5 text-paper-faint">{active ? 'Polling' : 'Awaiting'}</span>
      ) : (
        <Stamp key={run} verdict={v.stamp} animate={stamp === 'thunk'}>
          {v.label}
        </Stamp>
      )}
    </div>
  )
}

/** Before the poll: -1 = poll open, nobody answered yet */
const POLL_OPEN = -1

const HOLD_NEED_MS = 1500
const KEY_TURN_RAD = Math.PI / 2

/** Turn the launch key in a circle, then hold for 1.5 s to launch */
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

  useEffect(() => () => {
    if (holdTimer.current !== null) cancelAnimationFrame(holdTimer.current)
  }, [])

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
    <div className="flex flex-wrap items-center gap-3 border border-rule bg-ink-2 px-3 py-2">
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
        title={canGo ? 'Drag in a circle or press Enter to arm the launch key' : 'Fix red checks first'}
      >
        <span
          aria-hidden="true"
          className="block h-6 w-1.5 rounded-[1px] transition-transform"
          style={{
            background: armed ? 'var(--color-kapton)' : 'var(--color-paper-dim)',
            transform: `rotate(${deg}deg)`,
          }}
        />
      </button>

      <div className="flex flex-col gap-0.5">
        <span className="fp-label text-[10px] text-paper-faint">{armed ? 'Key armed' : 'Turn the key'}</span>
        <Eng as="span" className="fp-data text-[10px] text-paper-faint">
          Key: {deg}° / 90° · Hold: {(Math.min(heldMs, HOLD_NEED_MS) / 1000).toFixed(1)} / 1.5 s
        </Eng>
      </div>

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
        className="fp-btn-primary relative flex min-w-[14.5rem] items-center justify-center gap-2.5 disabled:opacity-40"
      >
        <svg className="h-5 w-5 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <circle
            cx="22"
            cy="22"
            r="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
          />
        </svg>
        <span>{holding ? 'Holding to launch…' : armed ? 'Hold to launch' : 'Arm key first'}</span>
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
  // The launch is allowed, but the craft cannot meet the brief: say so, with the reason
  const doomed = cannotMeetBrief(result)
  const scienceCheck = result.checks.find((c) => c.resource === 'Science')
  const st = useMemo(() => stations(result.checks), [result])

  // The poll: stations answer one by one (null = not started, -1 = poll open, POLL_ORDER.length = finished).
  // It runs when the screen opens and after any change (screen budget: no "Run the poll" button;
  // the launch is gated on canGo only, never on the poll)
  const [step, setStep] = useState<number | null>(null)
  // Each run of the poll remounts the stamps so they thunk down again
  const [run, setRun] = useState(0)
  useEffect(() => {
    const timers: number[] = []
    setRun((r) => r + 1)
    setStep(POLL_OPEN)
    audio.say('voice.poll-open')
    const gap = 1700
    st.forEach((s, i) => {
      timers.push(
        window.setTimeout(() => {
          // The station's stamp thunks onto its lamp as its answer is spoken
          setStep(i)
          audio.say(POLL_VOICE[s.role])
          audio.say(s.status === 'red' ? 'voice.no-go' : i === st.length - 1 ? 'voice.go-flight' : 'voice.go')
          audio.play(s.status === 'red' ? 'sfx.error' : 'sfx.select')
          audio.play('sfx.snap')
        }, 2600 + i * gap),
      )
    })
    timers.push(
      window.setTimeout(() => {
        setStep(POLL_ORDER.length)
        audio.say(result.canGo ? 'voice.poll-all-go' : 'voice.poll-hold')
        audio.play(result.canGo ? 'sfx.go' : 'sfx.alarm')
        audio.play('sfx.snap')
      }, 2600 + st.length * gap + 600),
    )
    return () => timers.forEach(window.clearTimeout)
  }, [result, st])

  const polling = step !== null && step < POLL_ORDER.length
  const polled = step === POLL_ORDER.length

  // Honest wording: GO, OVER A LIMIT / GO, BELOW TARGET / GO WITH CAUTION, with the row it is about
  const call = goCall(result)
  const finalStamp: { verdict: StampVerdict; text: string; size: 'md' | 'lg' } = result.canGo
    ? doomed
      ? { verdict: 'caution', text: 'GO, BUT IT CANNOT MEET THE BRIEF', size: 'md' }
      : result.warnings.length
        ? { verdict: 'caution', text: call.label, size: 'md' }
        : { verdict: 'go', text: 'GO FOR LAUNCH', size: 'lg' }
    : { verdict: 'nogo', text: 'NO-GO', size: 'lg' }

  const critical = result.checks.filter((c) => c.status === 'red')
  const warnings = result.checks.filter((c) => c.status === 'yellow')
  const passed = result.checks.filter((c) => c.status === 'green')
  // The science line already sits at the top when the craft cannot meet the brief
  const issues = [...critical, ...warnings].filter((c) => !(doomed && c === scienceCheck))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <StepHeader
        step="go-nogo"
        kicker="Comms Center"
        title={stepTitle('go-nogo')}
        question="Before every launch the flight director asks each station, one by one, whether it is go. A station is no-go when a check fixed in its building is red."
      >
        <div className="flex min-h-[5.5rem] min-w-[14rem] flex-col items-end justify-center gap-2 text-right">
          {polling ? (
            <span className="fp-label inline-block border border-dashed border-rule px-3 py-2 text-paper-faint">Poll in progress</span>
          ) : (
            <Stamp key={run} verdict={finalStamp.verdict} size={finalStamp.size} animate={polled}>
              {finalStamp.text}
            </Stamp>
          )}
          {!polling && result.canGo && call.reason && <div className="fp-data text-xs text-caution">{call.reason}</div>}
        </div>
      </StepHeader>

      <div className="fp-sheet p-5" data-tone="flat">
        {/* The first issue, in one line with its Fix link (screen budget); its full text is under Details */}
        {doomed && scienceCheck && <CheckLine check={scienceCheck} />}
        <SuccessOdds />

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {st.map((s, i) => (
            <PollSlip key={s.role} station={s} run={run} active={step === i} stamp={step === null ? 'static' : step >= i ? 'thunk' : 'none'} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setDesignStep('comms')} className="fp-btn-secondary">
            ← Back to Design
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <LaunchKey canGo={result.canGo} onLaunch={startSimulation} />
            <button type="button" data-testid="launch-accessible" onClick={() => result.canGo && startSimulation()} disabled={!result.canGo} className="fp-btn-secondary">
              {result.canGo ? 'Launch Mission' : 'Fix Issues First'}
            </button>
          </div>
        </div>
      </div>

      {/* Red and yellow checks: one line each with its Fix link */}
      {issues.length > 0 && (
        <div className="space-y-2" data-testid="check-issues">
          {issues.map((check) => (
            <CheckLine key={check.resource} check={check} />
          ))}
        </div>
      )}

      {/* Everything else stays reachable behind the shared Details control (checklist: every resource check) */}
      <Details id="gonogo" label="Details: every check in full">
        <div className="mt-4 space-y-6">
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
  )
}
