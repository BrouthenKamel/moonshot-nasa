import { useEffect, useMemo, useRef, useState } from 'react'
import { audio } from '../../assets/audio'
import type { AudioId } from '../../assets/manifest'
import { getGoNoGoSummary } from '../../sim/checks'
import type { CheckResult, Role } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { POLL_ORDER, ROLE_INFO, stations, type Station } from '../../viz/gonogo/stations'
import { fixLocation } from '../../viz/missionMap'

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

function CheckRow({ check }: { check: CheckResult }) {
  const tone = { green: 'border-emerald-500/30 bg-emerald-950/30', yellow: 'border-amber-500/30 bg-amber-950/30', red: 'border-rose-500/40 bg-rose-950/40' }[check.status]
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-semibold text-slate-100">{check.resource}</div>
        <span className={`text-xs font-bold ${LAMP[check.status].text}`}>{LAMP[check.status].label}</span>
      </div>
      <div className="mt-0.5 text-xs text-slate-400">
        {check.value.toFixed(1)} / {check.limit.toFixed(1)} {check.unit}
        {check.margin >= 0 ? ` (+${check.margin.toFixed(1)} margin)` : ` (${check.margin.toFixed(1)} over limit)`}
      </div>
      <div className="mt-1.5 text-sm text-slate-300">{check.reason}</div>
      {check.fixStep && check.status !== 'green' && <div className="mt-1 text-xs text-slate-500">Fix at {fixLocation(check.fixStep)}</div>}
    </div>
  )
}

/** One console of the poll: lamp, who answers, their checks, and in team mode their sign-off */
function StationCard({ station, revealed, active }: { station: Station; revealed: boolean; active: boolean }) {
  const info = ROLE_INFO[station.role]
  const mode = useGameStore((s) => s.mode)
  const player = useGameStore((s) => s.players.find((p) => p.role === station.role))
  const signed = useGameStore((s) => !!s.signOffs.find((o) => o.role === station.role)?.approved)
  const toggleSignOff = useGameStore((s) => s.toggleSignOff)
  const lamp = LAMP[station.status]
  return (
    <div
      className={`relative rounded-2xl border bg-[#070b16] p-4 transition ${active ? 'scale-[1.02] border-white/40' : 'border-white/10'}`}
      style={{ boxShadow: active ? `0 0 0 2px ${info.color}55, 0 10px 40px ${info.color}33` : undefined }}
    >
      <div className="flex items-center gap-2.5">
        <span className={`h-3.5 w-3.5 shrink-0 rounded-full transition ${revealed ? lamp.cls : 'bg-slate-700'}`} />
        <div className="flex-1 font-display text-lg font-bold" style={{ color: info.color }}>
          {station.title}
        </div>
        <div className={`whitespace-nowrap font-mono text-xs font-bold ${revealed ? lamp.text : 'text-slate-600'}`}>{revealed ? lamp.label : '···'}</div>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-slate-400">
        {info.buildingName}
        {player ? ` · ${player.name}` : ''}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        {station.checks.length === 0 ? 'Nothing to check here' : station.checks.map((c) => c.resource).join(' · ')}
      </div>
      {mode === 'team' && player && (
        <button
          onClick={() => toggleSignOff(station.role)}
          aria-pressed={signed}
          className={`mt-3 w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            signed ? 'bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-500/50' : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {signed ? `✔ Signed off by ${player.name}` : `${player.name}: sign off`}
        </button>
      )}
    </div>
  )
}

export function GoNoGoScreen() {
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const startSimulation = useGameStore((s) => s.startSimulation)
  const mode = useGameStore((s) => s.mode)
  const players = useGameStore((s) => s.players)
  const signOffs = useGameStore((s) => s.signOffs)

  // getGoNoGo reads design and difficulty from the store
  const result = useMemo(() => getGoNoGo(), [getGoNoGo, design, difficulty]) // eslint-disable-line react-hooks/exhaustive-deps
  const summary = getGoNoGoSummary(result)
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

  const needSignOffs = mode === 'team' && players.length > 0
  const missingSignOffs = needSignOffs ? players.filter((p) => !signOffs.find((s) => s.role === p.role)?.approved) : []
  const canLaunch = result.canGo && missingSignOffs.length === 0
  const polled = step === POLL_ORDER.length

  const critical = result.checks.filter((c) => c.status === 'red')
  const warnings = result.checks.filter((c) => c.status === 'yellow')
  const passed = result.checks.filter((c) => c.status === 'green')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0b1226] to-[#03050a] p-6">
        <div className="font-mono text-xs tracking-[0.25em] text-sky-400">COMMS CENTER · LUNAR ICE MAPPER · GO / NO-GO</div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">7. Go / No-Go poll</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Before every launch the flight director asks each station, one by one, whether it is go. A station is no-go when a check
              fixed in its building is red.
            </p>
          </div>
          <div className="text-right">
            <div className={`font-display text-5xl font-bold ${result.canGo ? (result.warnings.length ? 'text-amber-300' : 'text-emerald-300') : 'text-rose-400'}`}>
              {result.canGo ? 'GO' : 'NO-GO'}
            </div>
            <div className="max-w-xs text-xs text-slate-400">{summary}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {st.map((s, i) => (
            <StationCard key={s.role} station={s} revealed={step === null || step >= i} active={step === i} />
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setDesignStep('comms')} className="rounded-xl bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10">
            ← Back to Design
          </button>
          <div className="flex flex-wrap items-center gap-3">
            {needSignOffs && missingSignOffs.length > 0 && (
              <span className="text-xs text-amber-300">Waiting for sign-off: {missingSignOffs.map((p) => p.name).join(', ')}</span>
            )}
            <button
              onClick={runPoll}
              disabled={step !== null && step < POLL_ORDER.length}
              className="rounded-xl border border-sky-400/40 bg-sky-500/10 px-5 py-2.5 text-sm font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
            >
              {polled ? 'Poll again' : 'Run the poll'}
            </button>
            <button
              onClick={startSimulation}
              disabled={!canLaunch}
              className={`rounded-xl px-7 py-2.5 font-display text-lg font-bold text-white transition ${
                canLaunch ? `bg-orange-500 hover:bg-orange-400 ${polled ? 'animate-pulse shadow-[0_0_40px_rgba(249,115,22,0.6)]' : ''}` : 'cursor-not-allowed bg-slate-700 opacity-60'
              }`}
            >
              {result.canGo ? 'Launch Mission' : 'Fix Issues First'}
            </button>
          </div>
        </div>
      </div>

      {[
        { list: critical, title: `Critical issues (${critical.length})`, cls: 'text-rose-300' },
        { list: warnings, title: `Warnings (${warnings.length})`, cls: 'text-amber-300' },
        { list: passed, title: `Passed (${passed.length})`, cls: 'text-emerald-300' },
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.title}>
            <h2 className={`mb-3 font-semibold ${g.cls}`}>{g.title}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.list.map((check, i) => (
                <CheckRow key={i} check={check} />
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
