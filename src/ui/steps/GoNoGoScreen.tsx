import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../assets/audio'
import type { AudioId } from '../../assets/manifest'
import { glossaryKeyForLabel } from '../../data/glossary'
import { cannotMeetBrief, getGoNoGoSummary } from '../../sim/checks'
import { percent } from '../../sim/odds'
import type { Budgets, CheckResult } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { checkFigures } from '../../viz/checkMargin'
import { SynergyStrip } from '../../viz/DesignDeltaLine'
import { POLL_ORDER, ROLE_INFO, stations, type Role, type Station } from '../../viz/gonogo/stations'
import { fixLocation } from '../../viz/missionMap'
import { Eng, Stamp, StepHeader, Tag, type StampVerdict, type TagTone } from '../kit'
import { Tooltip } from '../Tooltip'
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="fp-data text-base font-semibold text-paper">{`Chance of full success: about ${percent(odds.success)}`}</div>
            <div className="fp-data text-[11px] text-paper-faint">
              <span className="text-go">Full {percent(odds.success)}</span> ·{' '}
              <span className="text-caution">Partial {percent(odds.partial)}</span> ·{' '}
              <span className="text-nogo">Mission Lost {percent(odds.failed)}</span>
            </div>
          </div>
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
                  title={`Mission Lost: ${percent(odds.failed)}`}
                />
              )}
            </div>
            <div className="hud-bar-segments pointer-events-none absolute inset-0" />
          </div>
          <Eng as="div" className="mt-2 fp-data text-xs text-paper-faint">
            {`From ${odds.runs} test flights of this design on standing orders: ${percent(odds.partial)} return only part of the science, ${percent(odds.failed)} fail.`}
          </Eng>
        </>
      ) : (
        <div className="fp-data text-sm text-paper-faint">Working out the chance of full success…</div>
      )}
    </div>
  )
}

/**
 * One station's poll slip: its name, building and the checks it answers for.
 * stamp: 'static' shows the verdict at rest, 'thunk' stamps it down as the station answers,
 * 'none' leaves the box empty while the poll has not reached it.
 */
function PollSlip({ station, n, stamp, active, run }: { station: Station; n: number; stamp: 'static' | 'thunk' | 'none'; active: boolean; run: number }) {
  const info = ROLE_INFO[station.role]
  const v = VERDICT[station.status]
  return (
    <div className={`fp-sheet relative min-h-[9.5rem] p-4 transition-colors ${active ? 'border-kapton' : ''}`} data-tone="raised">
      <div className="flex items-baseline justify-between gap-2 border-b border-rule pb-1.5">
        <span className="fp-label text-paper-faint">Poll slip</span>
        <span className="fp-data text-[11px] text-paper-faint">
          {String(n).padStart(2, '0')} / {String(POLL_ORDER.length).padStart(2, '0')}
        </span>
      </div>
      <div className="mt-2 fp-display text-lg text-paper">{station.title}</div>
      <div className="truncate fp-label">{info.buildingName}</div>
      <div className="mt-2 pr-16 text-xs text-paper-dim">
        {station.checks.length === 0 ? 'Nothing to check here' : station.checks.map((c) => c.resource).join(' · ')}
      </div>
      <div className="absolute bottom-3 right-3">
        {stamp === 'none' ? (
          <span className="fp-label inline-block border border-dashed border-rule px-2 py-1 text-paper-faint">{active ? 'Polling' : 'Awaiting'}</span>
        ) : (
          <Stamp key={run} verdict={v.stamp} animate={stamp === 'thunk'}>
            {v.label}
          </Stamp>
        )}
      </div>
    </div>
  )
}

/** Before the poll: -1 = poll open, nobody answered yet */
const POLL_OPEN = -1

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
  const summary = getGoNoGoSummary(result)
  // The launch is allowed, but the craft cannot meet the brief: say so, with the reason
  const doomed = cannotMeetBrief(result)
  const scienceReason = result.checks.find((c) => c.resource === 'Science')?.reason
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
          // The station's stamp thunks onto its slip as its answer is spoken
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

  const finalStamp: { verdict: StampVerdict; text: string; size: 'md' | 'lg' } = result.canGo
    ? doomed
      ? { verdict: 'caution', text: 'GO, BUT IT CANNOT MEET THE BRIEF', size: 'md' }
      : { verdict: result.warnings.length ? 'caution' : 'go', text: 'GO FOR LAUNCH', size: 'lg' }
    : { verdict: 'nogo', text: 'NO-GO', size: 'lg' }

  const critical = result.checks.filter((c) => c.status === 'red')
  const warnings = result.checks.filter((c) => c.status === 'yellow')
  const passed = result.checks.filter((c) => c.status === 'green')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <StepHeader
        step="go-nogo"
        kicker="COMMS CENTER · LUNAR ICE MAPPER · GO / NO-GO"
        title="Go / No-Go poll"
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
          <div className="fp-data text-xs text-paper-dim">{summary}</div>
        </div>
      </StepHeader>

      <div className="fp-sheet p-5" data-tone="flat">
        {doomed && scienceReason && <div className="fp-sheet border-l-2 border-l-caution p-3 text-sm text-paper">{scienceReason}</div>}
        <SuccessOdds />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {st.map((s, i) => (
            <PollSlip
              key={s.role}
              station={s}
              n={i + 1}
              run={run}
              active={step === i}
              stamp={step === null ? 'static' : step >= i ? 'thunk' : 'none'}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setDesignStep('comms')} className="fp-btn-secondary">
            ← Back to Design
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={runPoll} disabled={polling} className="fp-btn-secondary disabled:opacity-50">
              {polled ? 'Poll again' : 'Run the poll'}
            </button>
            <button type="button" onClick={() => result.canGo && startSimulation()} disabled={!result.canGo} className="fp-btn-primary">
              {result.canGo ? 'Launch Mission' : 'Fix Issues First'}
            </button>
          </div>
        </div>
      </div>

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
  )
}
