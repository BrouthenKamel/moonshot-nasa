import { useEffect, useMemo, useState } from 'react'
import { assetUrl } from '../../assets'
import { getGroundStationById } from '../../data/ground'
import { getOrbitById } from '../../data/orbits'
import { getPartById } from '../../data/parts'
import { getRideById } from '../../data/rides'
import { prefersReducedMotion } from '../../scene/space/quality'
import type { Report, RequirementResult } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { STEP_NAMES, buildingForStep, buildingName } from '../../viz/missionMap'
import { FixItPanel, RelaunchButton } from './FixItPanel'
import { classifyCause } from './fixIt'
import { gradeFor } from './grade'

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
    <div className="hud-panel rounded-2xl p-5">
      <div className="font-display text-lg font-bold text-white">Share and compare designs</div>
      <p className="mt-1 text-sm text-slate-400">
        Send this code to another team: they paste it to fly your exact design and compare scores.
      </p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={code} aria-label="Design code" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-slate-300" />
        <button type="button" onClick={copy} className="rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-400">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a design code" aria-label="Paste a design code" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-500" />
        <button type="button" onClick={load} disabled={!paste.trim()} className="rounded-lg bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-40">
          Load
        </button>
      </div>
      {status && <div className="mt-2 text-xs text-slate-300">{status}</div>}
    </div>
  )
}

const NASA_CUBESATS = [
  {
    name: 'Lunar IceCube',
    spec: '6U · 14 kg',
    propulsion: 'Busek BIT-3 Ion',
    instrument: 'BIRCHES IR Spectrometer',
    outcome: 'lost contact after deployment',
    tone: 'text-rose-300 border-rose-500/30',
  },
  {
    name: 'Lunar Flashlight',
    spec: '6U · 14 kg',
    propulsion: 'Green Monopropellant',
    instrument: '4-Band Laser Reflectometer',
    outcome: 'thruster underperformed',
    tone: 'text-amber-300 border-amber-500/30',
  },
  {
    name: 'LunaH-Map',
    spec: '6U · 14 kg',
    propulsion: 'Iodine Ion',
    instrument: 'Neutron Spectrometer',
    outcome: 'elliptical polar 15 km pass',
    tone: 'text-emerald-300 border-emerald-500/30',
  },
] as const

function shortPartName(id: string): string {
  return getPartById(id)?.name.replace(/\s*\(.*\)/, '') ?? id
}

function metChain(req: RequirementResult, report: Report): { decision: string; physics: string } {
  const d = report.design
  const orbitName = getOrbitById(d.orbit)?.name.replace(/\s*\(.*\)/, '') ?? d.orbit
  const propName = shortPartName(d.propulsion)
  const rideName = getRideById(d.ride)?.name.replace(/\s*\(.*\)/, '') ?? d.ride
  const radioName = shortPartName(d.radio)
  const stationName = getGroundStationById(d.groundStation)?.name.replace(/\s*\(.*\)/, '') ?? d.groundStation
  const instNames = d.instruments.map(shortPartName).join(' + ') || 'No instruments'

  switch (req.id) {
    case 'capture':
      return { decision: `${propName} · ${rideName}`, physics: `Inserted into ${orbitName}` }
    case 'coverage':
      return { decision: `${instNames} · ${orbitName}`, physics: `Shadow-capable swath within altitude ceiling` }
    case 'data':
      return { decision: `${radioName} · ${stationName}`, physics: `${report.dataReturned.toFixed(0)} MB downlinked (≥ ${req.target} MB)` }
    case 'lifetime':
      return { decision: `${propName} · ${orbitName}`, physics: `Station-keeping held for ${report.turnsInOrbit} months` }
    case 'budget':
      return { decision: `${d.planning.reservePercent}% reserve · ${report.playerCost.toFixed(1)} M plan`, physics: `Covered operations without overdrawing reserve` }
    default:
      return { decision: 'Spacecraft architecture', physics: `Target ${req.target}${req.unit ? ` ${req.unit}` : ''} met` }
  }
}

export function ReportScreen() {
  const currentReport = useGameStore((s) => s.currentReport)
  const runHistory = useGameStore((s) => s.runHistory)
  const newGame = useGameStore((s) => s.newGame)
  const loadDesignFromHistory = useGameStore((s) => s.loadDesignFromHistory)
  const openReplay = useGameStore((s) => s.openReplay)
  const reviseAt = useGameStore((s) => s.reviseAt)
  const simState = useGameStore((s) => s.simState)
  const report = currentReport ?? runHistory[0]?.report
  const score = useCountUp(report?.score.total ?? 0)

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-slate-400">No missions completed yet</div>
          <button type="button" onClick={newGame} className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-white">
            Start a Mission
          </button>
        </div>
      </div>
    )
  }

  const tone = TONE[report.outcome]
  const grade = gradeFor(report.score.total)
  const best = runHistory.reduce((m, r) => Math.max(m, r.report.score.total), 0)
  const playerPropulsion = shortPartName(report.design.propulsion)
  const playerInstruments = report.design.instruments.map(shortPartName).join(' + ') || 'None'
  const playerOrbit = getOrbitById(report.design.orbit)?.name.replace(/\s*\(.*\)/, '') ?? report.design.orbit

  return (
    <div data-role="ground" className="mx-auto max-w-4xl space-y-6 pb-10">
      {/* Tactical After-Action Header */}
      <div className="hud-step-header rounded-2xl px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--role-accent)]">
            COMMS CENTER · LUNAR ICE MAPPER · AFTER-ACTION REPORT
          </div>
          <div className={`rounded-full border border-white/15 bg-white/5 px-3 py-0.5 font-mono text-xs font-bold uppercase ${tone.text}`}>
            {tone.label}
          </div>
        </div>
      </div>

      {/* Verdict & Score */}
      <div className="report-in hud-panel relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
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
                <div className="font-mono text-4xl font-bold tabular-nums text-white sm:text-5xl">{`${score} / 1000`}</div>
                <div className="mt-1 font-mono text-xs tabular-nums text-slate-400">
                  {report.requirementsMet} of {report.requirementsTotal} requirements met
                  {best > 0 && runHistory.length > 1 ? ` · best so far ${best}` : ''}
                </div>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-center">
                <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Grade</div>
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
                  <span className="font-mono tabular-nums text-slate-200">
                    {v} / {p.max}
                  </span>
                </div>
                <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="bar-in h-full rounded-full" style={{ width: `${(v / p.max) * 100}%`, background: p.color }} />
                  <div className="hud-bar-segments pointer-events-none absolute inset-0" />
                </div>
              </div>
            )
          })}
        </div>
        {(report.scoreNotes ?? []).length > 0 && (
          <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-3.5 text-sm text-slate-300">
            <div className="font-semibold text-slate-200">What cost you points</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-slate-400">
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

      {/* Decision -> Physics -> Outcome Causal Chain Cards */}
      <div className="space-y-3">
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Mission Requirements · Decision → Physics → Outcome
        </div>
        {report.requirements.map((req) => {
          const metTrace = req.met ? metChain(req, report) : null
          const missedSteps = Array.from(
            new Set((req.causes ?? []).map((c) => classifyCause(c)?.step).filter((s): s is NonNullable<typeof s> => !!s)),
          )
          return (
            <div
              key={req.id}
              className={`hud-panel rounded-2xl border p-4 ${
                req.met ? 'border-emerald-500/35 border-l-4 border-l-emerald-400' : 'border-rose-500/40 border-l-4 border-l-rose-500'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`font-display text-base font-bold ${req.met ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {req.met ? '✔' : '✘'} {req.name}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {req.unit ? (
                    <span className="rounded-md border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-200">
                      {req.actual} / {req.target} {req.unit}
                    </span>
                  ) : (
                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold uppercase ${
                        req.met ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300' : 'border-rose-400/30 bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {req.met ? 'Passed' : 'Missed'}
                    </span>
                  )}
                  {!req.met &&
                    missedSteps.map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => reviseAt(step)}
                        className="rounded-lg border border-orange-400/50 bg-orange-500/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-orange-200 transition hover:bg-orange-500/35"
                      >
                        {`Adjust ${STEP_NAMES[step]} · ${buildingName(buildingForStep(step))}`}
                      </button>
                    ))}
                </div>
              </div>

              {req.met && metTrace && (
                <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 text-xs sm:grid-cols-3">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Decision</div>
                    <div className="mt-0.5 font-medium text-slate-200">{metTrace.decision}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Physics</div>
                    <div className="mt-0.5 text-slate-300">{metTrace.physics}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">Outcome</div>
                    <div className="mt-0.5 text-emerald-200">{req.reason}</div>
                  </div>
                </div>
              )}

              {!req.met && (
                <div className="mt-3 space-y-2">
                  {(req.causes?.length ? req.causes : [req.reason]).map((c, i) => {
                    const hit = classifyCause(c)
                    return (
                      <div key={i} className="grid gap-2 rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs sm:grid-cols-3">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-orange-300">Decision</div>
                          <div className="mt-0.5 font-medium text-slate-100">
                            {hit ? `${hit.decision} (${buildingName(buildingForStep(hit.step))})` : 'Flight operations & margin'}
                          </div>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-amber-300">Physics</div>
                          <div className="mt-0.5 text-slate-200">{c}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-rose-400">Outcome</div>
                          <div className="mt-0.5 text-rose-200">{req.reason}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Real NASA Lunar CubeSat Comparison Strip */}
      <section aria-labelledby="nasa-compare-title" className="hud-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-400">
              Historical Flight Reference
            </div>
            <h2 id="nasa-compare-title" className="font-display text-lg font-bold text-white">
              Your CubeSat vs. Real NASA Lunar CubeSats
            </h2>
          </div>
          <div className="font-mono text-[11px] text-slate-400">6U · 14 kg class</div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-400/40 bg-blue-950/25 p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-bold text-white">Your CubeSat</span>
              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-blue-200">
                {`6U · ${report.playerMass.toFixed(1)} kg`}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-slate-300">
              <div>
                <span className="font-mono text-[10px] uppercase text-slate-400">Prop: </span>
                {playerPropulsion}
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase text-slate-400">Payload: </span>
                {playerInstruments}
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase text-slate-400">Orbit: </span>
                {playerOrbit}
              </div>
            </div>
            <div className={`mt-2.5 border-t border-white/10 pt-2 font-mono text-[11px] font-semibold ${tone.text}`}>
              {`${tone.label} · ${report.coverageAchieved.toFixed(0)}% ice · ${report.dataReturned.toFixed(0)} MB`}
            </div>
          </div>

          {NASA_CUBESATS.map((sat) => (
            <div key={sat.name} className={`rounded-xl border bg-black/30 p-3.5 text-xs ${sat.tone.split(' ')[1]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-slate-100">{sat.name}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-300">{sat.spec}</span>
              </div>
              <div className="mt-2 space-y-1 text-slate-300">
                <div>
                  <span className="font-mono text-[10px] uppercase text-slate-400">Prop: </span>
                  {sat.propulsion}
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase text-slate-400">Payload: </span>
                  {sat.instrument}
                </div>
              </div>
              <div className={`mt-2.5 border-t border-white/10 pt-2 font-mono text-[11px] font-semibold ${sat.tone.split(' ')[0]}`}>
                {sat.outcome}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        {currentReport && <RelaunchButton report={currentReport} />}
        {currentReport && simState && simState.turnLogs.length > 0 && (
          <button type="button" onClick={() => openReplay()} className="flex-1 rounded-xl bg-indigo-600 py-3 font-display font-bold text-white hover:bg-indigo-500">
            Watch replay
          </button>
        )}
        <button type="button" onClick={newGame} className="flex-1 rounded-xl bg-white/10 py-3 font-display font-bold text-white hover:bg-white/20">
          New Mission
        </button>
      </div>

      <ShareCode />

      {runHistory.length > 1 && (
        <div className="hud-panel rounded-2xl p-5">
          <div className="font-display text-lg font-bold text-white">Run History</div>
          <div className="mt-3 space-y-2">
            {runHistory.slice(0, 6).map((entry) => {
              const t = TONE[entry.report.outcome]
              return (
                <div key={entry.id} className="flex items-center gap-3">
                  <button type="button" onClick={() => loadDesignFromHistory(entry.id)} className="flex flex-1 items-center gap-3 rounded-lg bg-white/5 p-2 text-left text-sm hover:bg-white/10" title="Load this design">
                    <span className={`w-8 font-display font-bold ${t.text}`}>{gradeFor(entry.report.score.total)}</span>
                    <span className="flex-1">
                      <span className={t.text}>{t.label}</span>
                      <span className="font-mono tabular-nums text-slate-400"> · score {entry.report.score.total}</span>
                    </span>
                    <span className="relative h-2 w-28 overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full bg-orange-400" style={{ width: `${entry.report.score.total / 10}%` }} />
                      <span className="hud-bar-segments pointer-events-none absolute inset-0" />
                    </span>
                  </button>
                  {entry.run && (
                    <button type="button" onClick={() => openReplay(entry.id)} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm text-white hover:bg-indigo-600">
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
