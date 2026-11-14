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
import { Tooltip } from '../Tooltip'
import { useSuccessEstimate } from '../useOdds'

const POLL_VOICE: Record<Role, AudioId> = {
  ground: 'voice.poll-ground',
  science: 'voice.poll-science',
  space: 'voice.poll-space',
  launch: 'voice.poll-launch',
}

const LAMP = {
  green: { label: 'GO', cls: 'bg-emerald-500 shadow-[0_0_24px_rgba(16,185,129,0.8)]', text: 'text-emerald-300' },
  yellow: { label: 'CAUTION', cls: 'bg-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.8)]', text: 'text-amber-300' },
  red: { label: 'NO-GO', cls: 'bg-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.85)]', text: 'text-rose-300' },
}

function CheckRow({ check, budgets }: { check: CheckResult; budgets: Budgets }) {
  const fig = checkFigures(check, budgets)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const tone = {
    green: 'border-emerald-500/35 bg-emerald-950/30',
    yellow: 'border-amber-500/35 bg-amber-950/30',
    red: 'border-rose-500/45 bg-rose-950/40',
  }[check.status]
  return (
    <div className={`hud-panel p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-100">
            <Tooltip term={glossaryKeyForLabel(check.resource) ?? ''}>{check.resource}</Tooltip>
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-300">
            {fig.value.toFixed(1)} / {fig.limit.toFixed(1)} {check.unit}
            {check.resource === 'Budget' && ' spendable'}
            {/* A red row with room left on paper: its blocking reason is right below, no "+ margin" */}
            {!fig.margin.startsWith('Blocked') && ` (${fig.margin})`}
            {fig.note && ` · ${fig.note}`}
          </div>
        </div>
        <span className={`rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs font-bold ${LAMP[check.status].text}`}>
          {LAMP[check.status].label}
        </span>
      </div>
      <div className="mt-2 text-sm text-slate-200">{check.reason}</div>
      {/* The brightest line of the card: where to fix it, one click away (QC contrast round) */}
      {check.fixStep && (
        <button
          type="button"
          onClick={() => setDesignStep(check.fixStep!)}
          className="mt-2 text-sm font-semibold text-white underline decoration-2 underline-offset-2 hover:text-amber-100"
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
    <div className="hud-panel mt-4 bg-slate-950/75 p-4 text-slate-200" aria-live="polite">
      {odds ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="font-mono text-base font-bold tabular-nums text-cyan-300">
              {`Chance of full success: about ${percent(odds.success)}`}
            </div>
            <div className="font-mono text-[11px] tabular-nums text-slate-400">
              <span className="text-emerald-300">Full {percent(odds.success)}</span> ·{' '}
              <span className="text-amber-300">Partial {percent(odds.partial)}</span> ·{' '}
              <span className="text-rose-300">Mission Lost {percent(odds.failed)}</span>
            </div>
          </div>
          <div className="relative mt-2.5 h-4 overflow-hidden rounded border border-slate-700/70 bg-slate-900">
            <div className="flex h-full">
              {sPct > 0 && (
                <div
                  style={{ width: `${sPct}%` }}
                  className="bg-emerald-500/85 transition-all duration-300"
                  title={`Full Success: ${percent(odds.success)}`}
                />
              )}
              {pPct > 0 && (
                <div
                  style={{ width: `${pPct}%` }}
                  className="border-l border-slate-950 bg-amber-400/85 transition-all duration-300"
                  title={`Partial Science: ${percent(odds.partial)}`}
                />
              )}
              {fPct > 0 && (
                <div
                  style={{ width: `${fPct}%` }}
                  className="border-l border-slate-950 bg-rose-500/85 transition-all duration-300"
                  title={`Mission Lost: ${percent(odds.failed)}`}
                />
              )}
            </div>
            <div className="hud-bar-segments pointer-events-none absolute inset-0" />
          </div>
          <div className="mt-2 font-mono text-xs tabular-nums text-slate-400">
            {`From ${odds.runs} test flights of this design on standing orders: ${percent(odds.partial)} return only part of the science, ${percent(odds.failed)} fail.`}
          </div>
        </>
      ) : (
        <div className="font-mono text-sm text-slate-400">Working out the chance of full success…</div>
      )}
    </div>
  )
}

/** One console of the poll: lamp, its building, and the checks it answers for */
function StationCard({ station, revealed, active }: { station: Station; revealed: boolean; active: boolean }) {
  const info = ROLE_INFO[station.role]
  const lamp = LAMP[station.status]
  return (
    <div
      className={`hud-panel relative bg-[#070b16]/90 p-4 transition ${active ? 'scale-[1.02] border-white/40' : ''}`}
      style={{ boxShadow: active ? `0 0 0 2px ${info.color}55, 0 10px 40px ${info.color}33` : undefined }}
    >
      <div className="flex items-center gap-2.5">
        <span className={`h-3.5 w-3.5 shrink-0 rounded-full transition ${revealed ? lamp.cls : 'bg-slate-700'}`} />
        <div className="flex-1 font-display text-lg font-bold" style={{ color: info.color }}>
          {station.title}
        </div>
        <div className={`whitespace-nowrap font-mono text-xs font-bold ${revealed ? lamp.text : 'text-slate-600'}`}>{revealed ? lamp.label : '···'}</div>
      </div>
      <div className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-wider text-slate-400">{info.buildingName}</div>
      <div className="mt-2 text-xs text-slate-400">
        {station.checks.length === 0 ? 'Nothing to check here' : station.checks.map((c) => c.resource).join(' · ')}
      </div>
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
  const summary = getGoNoGoSummary(result)
  // The launch is allowed, but the craft cannot meet the brief: say so, with the reason
  const doomed = cannotMeetBrief(result)
  const scienceReason = result.checks.find((c) => c.resource === 'Science')?.reason
  const st = useMemo(() => stations(result.checks), [result])

  // The poll: stations answer one by one (null = not started, POLL_ORDER.length = finished)
  const [step, setStep] = useState<number | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])
  // A changed design means a new poll
  useEffect(() => setStep(null), [result])

  const runPoll = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setStep(0)
    audio.say('voice.poll-open')
    const gap = 1700
    st.forEach((s, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStep(i)
          audio.say(POLL_VOICE[s.role])
          audio.say(s.status === 'red' ? 'voice.no-go' : i === st.length - 1 ? 'voice.go-flight' : 'voice.go')
          audio.play(s.status === 'red' ? 'sfx.error' : 'sfx.select')
        }, 2600 + i * gap),
      )
    })
    timers.current.push(
      window.setTimeout(() => {
        setStep(POLL_ORDER.length)
        audio.say(result.canGo ? 'voice.poll-all-go' : 'voice.poll-hold')
        audio.play(result.canGo ? 'sfx.go' : 'sfx.alarm')
      }, 2600 + st.length * gap + 600),
    )
  }

  const polled = step === POLL_ORDER.length
  const verdictColor = result.canGo ? (result.warnings.length || doomed ? 'text-amber-300' : 'text-emerald-300') : 'text-rose-400'

  const critical = result.checks.filter((c) => c.status === 'red')
  const warnings = result.checks.filter((c) => c.status === 'yellow')
  const passed = result.checks.filter((c) => c.status === 'green')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="hud-step-header">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--role-accent)]">
          COMMS CENTER · LUNAR ICE MAPPER · GO / NO-GO
        </div>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="font-display text-3xl font-bold text-slate-50">7. Go / No-Go poll</h1>
            <p className="mt-1 text-sm text-slate-300">
              Before every launch the flight director asks each station, one by one, whether it is go. A station is no-go when a check
              fixed in its building is red.
            </p>
          </div>
          <div className="max-w-sm text-right">
            <div className={`font-display text-4xl font-bold ${verdictColor}`}>
              {result.canGo ? (doomed ? 'GO, BUT IT CANNOT MEET THE BRIEF' : 'GO') : 'NO-GO'}
            </div>
            <div className="font-mono text-xs tabular-nums text-slate-300">{summary}</div>
          </div>
        </div>
        {doomed && scienceReason && <div className="hud-panel mt-3 border-amber-400/35 bg-amber-500/10 p-3 text-sm text-amber-200">{scienceReason}</div>}
        <SuccessOdds />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {st.map((s, i) => (
            <StationCard key={s.role} station={s} revealed={step === null || step >= i} active={step === i} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDesignStep('comms')}
            className="tactical-btn-back"
          >
            ← Back to Design
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runPoll}
              disabled={step !== null && step < POLL_ORDER.length}
              className="rounded-lg border border-sky-400/45 bg-sky-500/15 px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-50"
            >
              {polled ? 'Poll again' : 'Run the poll'}
            </button>
            <button
              type="button"
              onClick={() => result.canGo && startSimulation()}
              disabled={!result.canGo}
              className={`rounded-lg px-7 py-2.5 font-display text-lg font-bold text-white transition ${
                result.canGo
                  ? `bg-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.5)] hover:bg-orange-400 ${polled ? 'animate-pulse shadow-[0_0_40px_rgba(249,115,22,0.7)]' : ''}`
                  : 'cursor-not-allowed border border-slate-700 bg-slate-800 text-slate-400 opacity-70'
              }`}
            >
              {result.canGo ? 'Launch Mission' : 'Fix Issues First'}
            </button>
          </div>
        </div>
      </div>

      <SynergyStrip step="go-nogo" />

      {[
        { list: critical, title: `Critical Issues (${critical.length})`, cls: 'text-rose-300' },
        { list: warnings, title: `Warnings (${warnings.length})`, cls: 'text-amber-300' },
        { list: passed, title: `Passed (${passed.length})`, cls: 'text-emerald-300' },
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.title}>
            <h2 className={`mb-3 font-mono text-xs uppercase tracking-[0.18em] ${g.cls}`}>{g.title}</h2>
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
