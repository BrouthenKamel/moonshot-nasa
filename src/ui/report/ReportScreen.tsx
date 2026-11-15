import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { assetUrl } from '../../assets'
import { audio } from '../../assets/audio'
import { getGroundStationById } from '../../data/ground'
import { getOrbitById } from '../../data/orbits'
import { getPartById } from '../../data/parts'
import { getRideById } from '../../data/rides'
import type { Report, RequirementResult } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { STEP_NAMES, buildingForStep, buildingName } from '../../viz/missionMap'
import { DetailsPanel, DetailsToggle, Eng, Flap, Sheet, Stamp, Tag, type StampVerdict, type TagTone } from '../kit'
import { FixItPanel, RelaunchButton } from './FixItPanel'
import { ArtemisDebrief } from './ArtemisDebrief'
import { classifyCause } from './fixIt'
import { gradeFor } from './grade'
import { medals } from './medals'

/** The outcome as a stamp: the patch gets a double ring in the same ink, no glow */
const TONE = {
  success: { label: 'Mission Success', text: 'text-go', stamp: 'go', tag: 'go', ring: 'border-kapton outline-ice' },
  partial: { label: 'Partial Success', text: 'text-caution', stamp: 'caution', tag: 'caution', ring: 'border-caution outline-caution' },
  failed: { label: 'Mission Failed', text: 'text-nogo', stamp: 'nogo', tag: 'nogo', ring: 'border-nogo outline-nogo' },
} as const satisfies Record<Report['outcome'], { label: string; text: string; stamp: StampVerdict; tag: TagTone; ring: string }>

const SCORE_PARTS: { key: keyof Report['score']; label: string; max: number; bar: string; main?: boolean }[] = [
  { key: 'coverage', label: 'Ice mapped', max: 400, bar: 'bg-ice', main: true },
  { key: 'data', label: 'Science data', max: 250, bar: 'bg-paper-dim', main: true },
  { key: 'lifetime', label: 'Months in orbit', max: 150, bar: 'bg-paper-dim' },
  { key: 'context', label: 'Sunlit-ground map', max: 100, bar: 'bg-paper-dim' },
  { key: 'money', label: 'Money left', max: 100, bar: 'bg-kapton' },
]

function ScoreBars({ parts, report }: { parts: typeof SCORE_PARTS; report: Report }) {
  return (
    <>
      {parts.map((p) => {
        const v = report.score[p.key] ?? 0
        return (
          <div key={p.key}>
            <div className="flex justify-between gap-2 text-[11px] text-paper-dim">
              <span>{p.label}</span>
              <span className="fp-data text-paper">
                {v} / {p.max}
              </span>
            </div>
            <div className="relative mt-1 h-2 overflow-hidden border border-rule bg-ink-0">
              <div className={`bar-in h-full ${p.bar}`} style={{ width: `${(v / p.max) * 100}%` }} />
              <div className="hud-bar-segments pointer-events-none absolute inset-0" />
            </div>
          </div>
        )
      })}
    </>
  )
}

/** The medals stamp down one after another, after the patch and the score have landed */
const MEDAL_DELAY = [
  '[animation-delay:900ms]',
  '[animation-delay:1150ms]',
  '[animation-delay:1400ms]',
  '[animation-delay:1650ms]',
  '[animation-delay:1900ms]',
  '[animation-delay:2150ms]',
  '[animation-delay:2400ms]',
  '[animation-delay:2650ms]',
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
  const field = 'min-w-0 flex-1 border border-rule bg-ink-1 px-3 py-2 fp-data text-xs text-paper-dim placeholder:text-paper-faint'
  return (
    <Sheet className="p-5">
      <div className="fp-display text-lg text-paper">Share and compare designs</div>
      <p className="mt-1 text-sm text-paper-dim">Send this code to another team: they paste it to fly your exact design and compare scores.</p>
      <div className="mt-3 flex gap-2">
        <input readOnly value={code} aria-label="Design code" onFocus={(e) => e.target.select()} className={field} />
        <button type="button" onClick={copy} className="fp-btn-primary">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a design code" aria-label="Paste a design code" className={field} />
        <button type="button" onClick={load} disabled={!paste.trim()} className="fp-btn-secondary disabled:opacity-40">
          Load
        </button>
      </div>
      {status && <div className="mt-2 text-xs text-paper-dim">{status}</div>}
    </Sheet>
  )
}

const NASA_CUBESATS = [
  {
    name: 'Lunar IceCube',
    spec: '6U · 14 kg',
    propulsion: 'Busek BIT-3 Ion',
    instrument: 'BIRCHES IR Spectrometer',
    outcome: 'lost contact after deployment',
    tone: 'text-nogo',
  },
  {
    name: 'Lunar Flashlight',
    spec: '6U · 14 kg',
    propulsion: 'Green Monopropellant',
    instrument: '4-Band Laser Reflectometer',
    outcome: 'thruster underperformed',
    tone: 'text-caution',
  },
  {
    name: 'LunaH-Map',
    spec: '6U · 14 kg',
    propulsion: 'Iodine Ion',
    instrument: 'Neutron Spectrometer',
    outcome: 'elliptical polar 15 km pass',
    tone: 'text-go',
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

/** One column of the Decision -> Physics -> Outcome chain */
function ChainCell({ label, children, tone = 'text-paper-faint' }: { label: string; children: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className={`fp-label text-[10px] ${tone}`}>{label}</div>
      <div className="mt-0.5 text-paper">{children}</div>
    </div>
  )
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

  useEffect(() => {
    if (!report) return
    if (report.outcome === 'success') {
      audio.play('sfx.go')
      audio.say('voice.end-success')
    } else if (report.outcome === 'partial') {
      audio.play('sfx.select')
      audio.say('voice.end-partial')
    } else {
      audio.play('sfx.error')
      // "We have lost the mission." only when the craft is gone (QC, 15 Nov)
      if (report.craftLost) audio.say('voice.end-failed')
    }
  }, [report?.outcome, report?.craftLost])

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-paper-dim">No missions completed yet</div>
          <button type="button" onClick={newGame} className="fp-btn-primary mt-4">
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
  const won = medals(report)
  const wonCount = won.filter((m) => m.earned).length

  return (
    <div data-role="ground" className="mx-auto max-w-4xl space-y-6 pb-10">
      {/* After-action title block */}
      <div className="hud-step-header flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
        <div className="fp-label text-[var(--role-accent)]">COMMS CENTER · LUNAR ICE MAPPER · AFTER-ACTION REPORT</div>
        <Tag tone={tone.tag}>{tone.label}</Tag>
      </div>

      {/* Verdict & mission rating */}
      <Sheet className="report-in p-6 sm:p-8">
        <div className="flex flex-col items-center gap-8 sm:flex-row">
          <div className="patch-in shrink-0 -rotate-3">
            <img
              src={assetUrl('image.patch')}
              alt="Lunar Ice Mapper mission patch"
              className={`h-40 w-40 rounded-full border-4 outline outline-2 outline-offset-4 sm:h-48 sm:w-48 ${tone.ring} ${report.outcome === 'failed' ? 'grayscale-[0.7]' : ''}`}
            />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="fp-label">Lunar Ice Mapper · mission report</div>
            <div className="mt-4 mb-3">
              <Stamp verdict={tone.stamp} size="lg" animate className="max-sm:!text-2xl">
                {tone.label}
              </Stamp>
            </div>
            <div className="mt-6 text-paper-dim">{report.outcomeReason}</div>
            <div className="mt-5 flex items-end justify-center gap-6 sm:justify-start">
              <div className="border-l-2 border-kapton pl-3">
                <div className="fp-label text-[10px]">Mission rating</div>
                <Flap value={`${report.score.total} / 1000`} className="text-4xl font-semibold text-paper sm:text-5xl" />
                <div className="mt-1 fp-data text-xs text-paper-faint">
                  {report.requirementsMet} of {report.requirementsTotal} requirements met
                  {best > 0 && runHistory.length > 1 ? ` · best so far ${best}` : ''}
                </div>
              </div>
              <div className="text-center">
                <div className="fp-label text-[10px]">Grade</div>
                <Stamp verdict={tone.stamp} size="md" animate className="mt-1 text-4xl [animation-delay:400ms]">
                  {grade}
                </Stamp>
              </div>
            </div>
          </div>
        </div>

        {/* Medals: only the count here; the chips are under Details */}
        <div className="mt-7 flex items-baseline justify-between gap-2 border-t border-rule pt-4">
          <div className="fp-label">Medals</div>
          <div className="fp-data text-xs text-paper-faint">
            {wonCount} of {won.length}
          </div>
        </div>
        {wonCount < won.length && (
          <div className="mt-1 text-xs text-paper-dim">Missing: {won.filter((m) => !m.earned).map((m) => m.name).join(', ')}</div>
        )}

        {/* Where the points came from */}
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-4">
          <ScoreBars parts={SCORE_PARTS.filter((p) => p.main || (report.score[p.key] ?? 0) < p.max)} report={report} />
        </div>
        {(report.scoreNotes ?? []).length > 0 && (
          <div className="mt-5 border-l-2 border-caution bg-ink-1 p-3.5 text-sm">
            <div className="fp-label text-paper">What cost you points</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-paper-dim">
              {(report.scoreNotes ?? []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        {report.outreachReturned > 0 && (
          <div className="mt-4 text-xs text-paper-faint">
            {report.outreachReturned.toFixed(0)} MB of camera pictures came home: great for the public, but not science data.
          </div>
        )}
      </Sheet>

      <FixItPanel report={report} />

      <div className="flex flex-wrap gap-3">
        {currentReport && <RelaunchButton report={currentReport} />}
        {currentReport && simState && simState.turnLogs.length > 0 && (
          <button type="button" onClick={() => openReplay()} className="fp-btn-secondary flex-1 justify-center py-3">
            Watch replay
          </button>
        )}
        <button type="button" onClick={newGame} className="fp-btn-secondary flex-1 justify-center py-3">
          New Mission
        </button>
        <DetailsToggle id="report" />
      </div>

      <DetailsPanel id="report">
        <div className="space-y-6">
          <Sheet className="p-5">
          <div>
            <div className="fp-label">Medals</div>
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            {won.map((m, i) => (
              <li key={m.id} title={m.how}>
                {m.earned ? (
                  <Stamp verdict={m.tone} size="sm" animate className={MEDAL_DELAY[i % MEDAL_DELAY.length]}>
                    {m.name}
                  </Stamp>
                ) : (
                  <Tag className="opacity-40">{m.name}</Tag>
                )}
                <Eng as="div" className="mt-1 max-w-[11rem] text-[10px] text-paper-faint">
                  {m.how}
                </Eng>
              </li>
            ))}
          </ul>
          </div>
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-rule pt-4 sm:grid-cols-3">
              <ScoreBars parts={SCORE_PARTS.filter((p) => !p.main && (report.score[p.key] ?? 0) >= p.max)} report={report} />
            </div>
          </Sheet>

          <ArtemisDebrief report={report} />

      {/* Decision -> Physics -> Outcome, as flight-plan line items */}
      <div className="space-y-3">
        <div className="border-b border-rule pb-1 fp-label">Mission Requirements · Decision → Physics → Outcome</div>
        {report.requirements.map((req, n) => {
          const metTrace = req.met ? metChain(req, report) : null
          const missedSteps = Array.from(
            new Set((req.causes ?? []).map((c) => classifyCause(c)?.step).filter((s): s is NonNullable<typeof s> => !!s)),
          )
          return (
            <Sheet key={req.id} className={`border-l-2 p-4 ${req.met ? 'border-l-go' : 'border-l-nogo'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="fp-data text-[11px] text-paper-faint">{`1.${n + 1}`}</span>
                  <span className="fp-display text-base text-paper">{req.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {req.unit && (
                    <span className="fp-data text-xs text-paper-dim">
                      {req.actual} / {req.target} {req.unit}
                    </span>
                  )}
                  <Tag tone={req.met ? 'go' : 'nogo'}>{req.met ? 'Passed' : 'Missed'}</Tag>
                  {!req.met &&
                    missedSteps.map((step) => (
                      <button key={step} type="button" onClick={() => reviseAt(step)} className="fp-btn-secondary !px-2.5 !py-1 !text-[11px]">
                        {`Adjust ${STEP_NAMES[step]} · ${buildingName(buildingForStep(step))}`}
                      </button>
                    ))}
                </div>
              </div>

              {req.met && metTrace && (
                <div className="mt-3 grid gap-3 border-t border-dashed border-rule pt-3 text-xs sm:grid-cols-3">
                  <ChainCell label="Decision">{metTrace.decision}</ChainCell>
                  <Eng as="div">
                    <ChainCell label="Physics">{metTrace.physics}</ChainCell>
                  </Eng>
                  <ChainCell label="Outcome" tone="text-go">
                    {req.reason}
                  </ChainCell>
                </div>
              )}

              {!req.met && (
                <div className="mt-3 space-y-2">
                  {(req.causes?.length ? req.causes : [req.reason]).map((c, i) => {
                    const hit = classifyCause(c)
                    return (
                      <div key={i} className="grid gap-3 border-t border-dashed border-rule pt-3 text-xs sm:grid-cols-3">
                        <ChainCell label="Decision" tone="text-kapton">
                          {hit ? `${hit.decision} (${buildingName(buildingForStep(hit.step))})` : 'Flight operations & margin'}
                        </ChainCell>
                        <ChainCell label="Physics">{c}</ChainCell>
                        <ChainCell label="Outcome" tone="text-nogo">
                          {req.reason}
                        </ChainCell>
                      </div>
                    )
                  })}
                </div>
              )}
            </Sheet>
          )
        })}
      </div>

      {/* Real NASA lunar CubeSats, side by side with yours */}
      <Sheet as="section" aria-labelledby="nasa-compare-title" className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="fp-label">Historical Flight Reference</div>
            <h2 id="nasa-compare-title" className="fp-display text-lg text-paper">
              Your CubeSat vs. Real NASA Lunar CubeSats
            </h2>
          </div>
          <div className="fp-data text-[11px] text-paper-faint">6U · 14 kg class</div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-kapton bg-ink-1 p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="fp-label text-paper">Your CubeSat</span>
              <span className="fp-data text-[10px] text-kapton">{`6U · ${report.playerMass.toFixed(1)} kg`}</span>
            </div>
            <div className="mt-2 space-y-1 text-paper-dim">
              <div>
                <span className="fp-label text-[10px] text-paper-faint">Prop: </span>
                {playerPropulsion}
              </div>
              <div>
                <span className="fp-label text-[10px] text-paper-faint">Payload: </span>
                {playerInstruments}
              </div>
              <div>
                <span className="fp-label text-[10px] text-paper-faint">Orbit: </span>
                {playerOrbit}
              </div>
            </div>
            <div className={`mt-2.5 border-t border-rule pt-2 fp-data text-[11px] font-semibold ${tone.text}`}>
              {`${tone.label} · ${report.coverageAchieved.toFixed(0)}% ice · ${report.dataReturned.toFixed(0)} MB`}
            </div>
          </div>

          {NASA_CUBESATS.map((sat) => (
            <div key={sat.name} className="border border-rule bg-ink-1 p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="fp-label text-paper">{sat.name}</span>
                <span className="fp-data text-[10px] text-paper-faint">{sat.spec}</span>
              </div>
              <div className="mt-2 space-y-1 text-paper-dim">
                <div>
                  <span className="fp-label text-[10px] text-paper-faint">Prop: </span>
                  {sat.propulsion}
                </div>
                <div>
                  <span className="fp-label text-[10px] text-paper-faint">Payload: </span>
                  {sat.instrument}
                </div>
              </div>
              <div className={`mt-2.5 border-t border-rule pt-2 fp-data text-[11px] font-semibold ${sat.tone}`}>{sat.outcome}</div>
            </div>
          ))}
        </div>
      </Sheet>

      <ShareCode />

      {runHistory.length > 1 && (
        <Sheet className="p-5">
          <div className="fp-display text-lg text-paper">Run History</div>
          <div className="mt-3 space-y-2">
            {runHistory.slice(0, 6).map((entry) => {
              const t = TONE[entry.report.outcome]
              return (
                <div key={entry.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => loadDesignFromHistory(entry.id)}
                    className="flex flex-1 items-center gap-3 border-b border-rule p-2 text-left text-sm hover:bg-ink-3"
                    title="Load this design"
                  >
                    <span className={`w-8 fp-display ${t.text}`}>{gradeFor(entry.report.score.total)}</span>
                    <span className="flex-1">
                      <span className={t.text}>{t.label}</span>
                      <span className="fp-data text-paper-faint"> · score {entry.report.score.total}</span>
                    </span>
                    <span className="relative h-2 w-28 overflow-hidden border border-rule bg-ink-0">
                      <span className="block h-full bg-kapton" style={{ width: `${entry.report.score.total / 10}%` }} />
                      <span className="hud-bar-segments pointer-events-none absolute inset-0" />
                    </span>
                  </button>
                  {entry.run && (
                    <button type="button" onClick={() => openReplay(entry.id)} className="fp-btn-ghost">
                      Replay
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Sheet>
      )}
        </div>
      </DetailsPanel>
    </div>
  )
}
