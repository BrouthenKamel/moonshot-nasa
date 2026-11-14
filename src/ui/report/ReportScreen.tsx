import { useEffect, useMemo, useState } from 'react'
import { assetUrl } from '../../assets'
import { gradeFor } from './grade'
import type { Report } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { prefersReducedMotion } from '../../scene/space/quality'
import { FixItPanel, RelaunchButton } from './FixItPanel'

const TONE = {
  success: { label: 'Mission Success', text: 'text-emerald-300', ring: 'ring-emerald-400/60', glow: 'shadow-[0_0_80px_rgba(52,211,153,0.35)]' },
  partial: { label: 'Partial Success', text: 'text-amber-300', ring: 'ring-amber-400/60', glow: 'shadow-[0_0_80px_rgba(251,191,36,0.3)]' },
  failed: { label: 'Mission Failed', text: 'text-rose-300', ring: 'ring-rose-400/60', glow: 'shadow-[0_0_80px_rgba(244,63,94,0.3)]' },
} as const

/** The score counts up from zero, once, when the report opens */
function useCountUp(target: number, ms = 1600) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const [value, setValue] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced) return
    let raf = 0
    const start = performance.now()
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / ms)
      setValue(Math.round(target * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])
  return value
}

const SCORE_PARTS: { key: keyof Report['score']; label: string; max: number; color: string }[] = [
  { key: 'coverage', label: 'Ice mapped', max: 400, color: '#22d3ee' },
  { key: 'data', label: 'Science data', max: 250, color: '#4ade80' },
  { key: 'lifetime', label: 'Months in orbit', max: 150, color: '#a78bfa' },
  { key: 'context', label: 'Sunlit-ground map', max: 100, color: '#f59e0b' },
  { key: 'money', label: 'Money left', max: 100, color: '#f472b6' },
]

function ShareCode() {
  const exportDesignCode = useGameStore((s) => s.exportDesignCode)
  const importDesignCode = useGameStore((s) => s.importDesignCode)
  const code = useMemo(() => exportDesignCode(), [exportDesignCode])
  const [copied, setCopied] = useState(false)
  const [paste, setPaste] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setStatus('Copy did not work here: select the code and copy it by hand.')
    }
  }
  const load = () => setStatus(importDesignCode(paste.trim()) ? 'Design loaded: walk into a building to change it.' : 'That code is not a Moonshot design.')
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="font-display text-lg font-bold text-white">Share and compare designs</div>
      <p className="mt-1 text-sm text-slate-400">
        Send this code to another team: they paste it to fly your exact design and compare scores.
      </p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={code} aria-label="Design code" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-slate-300" />
        <button onClick={copy} className="rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-400">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a design code" aria-label="Paste a design code" className="min-w-0 flex-1 rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-500" />
        <button onClick={load} disabled={!paste.trim()} className="rounded-lg bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-40">
          Load
        </button>
      </div>
      {status && <div className="mt-2 text-xs text-slate-300">{status}</div>}
    </div>
  )
}

export function ReportScreen() {
  const currentReport = useGameStore((s) => s.currentReport)
  const runHistory = useGameStore((s) => s.runHistory)
  const newGame = useGameStore((s) => s.newGame)
  const loadDesignFromHistory = useGameStore((s) => s.loadDesignFromHistory)
  const openReplay = useGameStore((s) => s.openReplay)
  const simState = useGameStore((s) => s.simState)
  const report = currentReport ?? runHistory[0]?.report
  const score = useCountUp(report?.score.total ?? 0)

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-slate-400">No missions completed yet</div>
          <button onClick={newGame} className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-white">
            Start a Mission
          </button>
        </div>
      </div>
    )
  }

  const tone = TONE[report.outcome]
  const grade = gradeFor(report.score.total)
  const best = runHistory.reduce((m, r) => Math.max(m, r.report.score.total), 0)
  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      {/* Verdict */}
      <div className="report-in relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1226] via-[#0a0f1f] to-black p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <img
            src={assetUrl('image.patch')}
            alt="Lunar Ice Mapper mission patch"
            className={`patch-in h-40 w-40 shrink-0 rounded-full ring-4 sm:h-48 sm:w-48 ${tone.ring} ${tone.glow} ${report.outcome === 'failed' ? 'grayscale-[0.7]' : ''}`}
          />
          <div className="flex-1 text-center sm:text-left">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Lunar Ice Mapper · mission report</div>
            <div className={`mt-2 font-display text-4xl font-bold ${tone.text}`}>{tone.label}</div>
            <div className="mt-2 text-slate-300">{report.outcomeReason}</div>
            <div className="mt-4 flex items-end justify-center gap-5 sm:justify-start">
              <div>
                <div className="font-display text-5xl font-bold tabular-nums text-white">{score} / 1000</div>
                <div className="text-xs text-slate-400">
                  {report.requirementsMet} of {report.requirementsTotal} requirements met
                  {best > 0 && runHistory.length > 1 ? ` · best so far ${best}` : ''}
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-400">Grade</div>
                <div className={`font-display text-4xl font-bold ${tone.text}`}>{grade}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Where the points came from */}
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
          {SCORE_PARTS.map((p) => {
            const v = report.score[p.key] ?? 0
            return (
              <div key={p.key}>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>{p.label}</span>
                  <span className="tabular-nums text-slate-200">
                    {v} / {p.max}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="bar-in h-full rounded-full" style={{ width: `${(v / p.max) * 100}%`, background: p.color }} />
                </div>
              </div>
            )
          })}
        </div>
        {(report.scoreNotes ?? []).length > 0 && (
          <div className="mt-5 text-sm text-slate-300">
            <div className="font-semibold text-slate-200">What cost you points</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-400">
              {(report.scoreNotes ?? []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        {report.outreachReturned > 0 && (
          <div className="mt-4 text-xs text-slate-400">
            {report.outreachReturned.toFixed(0)} MB of camera pictures came home: great for the public, but not science data.
          </div>
        )}
      </div>

      <FixItPanel report={report} />

      {/* Why: each requirement and its causes, from the core */}
      <div className="space-y-3">
        {report.requirements.map((req) => (
          <div key={req.id} className={`rounded-2xl border p-4 ${req.met ? 'border-emerald-500/30 bg-emerald-950/30' : 'border-rose-500/30 bg-rose-950/30'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className={`font-semibold ${req.met ? 'text-emerald-300' : 'text-rose-300'}`}>
                {req.met ? '✔' : '✘'} {req.name}
              </div>
              <div className="text-sm text-slate-400">{req.reason}</div>
            </div>
            {req.causes?.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {req.causes.map((c, i) => (
                  <li key={i}>
                    <span className="text-rose-400">why:</span> {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {currentReport && <RelaunchButton report={currentReport} />}
        {currentReport && simState && simState.turnLogs.length > 0 && (
          <button onClick={() => openReplay()} className="flex-1 rounded-xl bg-indigo-600 py-3 font-display font-bold text-white hover:bg-indigo-500">
            Watch replay
          </button>
        )}
        <button onClick={newGame} className="flex-1 rounded-xl bg-white/10 py-3 font-display font-bold text-white hover:bg-white/20">
          New Mission
        </button>
      </div>

      <ShareCode />

      {runHistory.length > 1 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="font-display text-lg font-bold text-white">Run History</div>
          <div className="mt-3 space-y-2">
            {runHistory.slice(0, 6).map((entry) => {
              const t = TONE[entry.report.outcome]
              return (
                <div key={entry.id} className="flex items-center gap-3">
                  <button onClick={() => loadDesignFromHistory(entry.id)} className="flex flex-1 items-center gap-3 rounded-lg bg-white/5 p-2 text-left text-sm hover:bg-white/10" title="Load this design">
                    <span className={`w-8 font-display font-bold ${t.text}`}>{gradeFor(entry.report.score.total)}</span>
                    <span className="flex-1">
                      <span className={t.text}>{t.label}</span>
                      <span className="text-slate-400"> · score {entry.report.score.total}</span>
                    </span>
                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full bg-orange-400" style={{ width: `${entry.report.score.total / 10}%` }} />
                    </span>
                  </button>
                  {entry.run && (
                    <button onClick={() => openReplay(entry.id)} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm text-white hover:bg-indigo-600">
                      Replay
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
