import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore, type Speed } from '../../state/worldStore'
import { fundingPerDay, grantShare, missionFunding, popularityEffects } from '../../game/economy'
import { lunarPapers } from '../../game/research'
import { failedLine, missionResult, type MissionResult } from '../../game/result'
import { useUiStore } from '../../state/uiStore'
import { campaign, phaseProgress } from '../../game/campaign'
import type { FeedItem } from '../../game/world'
import { difficultyPresets } from '../../data/brief'
import { computeBudgets } from '../../sim/budgets'
import { isSimComplete } from '../../sim/simulate'
import type { SimState } from '../../sim/types'
import { FlightViewToggle } from '../flight/FlightStage'
import { STAGE_NAMES, missionClockLabel, type MissionLogEntry, type MissionStage, type MissionStatusView } from '../../viz/missionMap'
import { Eng, Sheet, Stamp, Tag, type StampVerdict, type TagTone } from '../kit'

/*
 * The agency layer on the base screen (numbers from src/game through useWorldStore):
 * the clock and the wallet in the top bar, the mission card on the right, news on the left,
 * and the Headquarters campaign and New mission dialogs.
 * FLIGHT PLAN look: ink sheets, hairline rules, fp-data readouts, Kapton for the one action.
 * Story view keeps the decisions (the budget); detail breakdowns sit in <Eng>.
 */

const money = (m: number) => `$${m.toFixed(1)}M`

/* ------------------------------------------------------------------ */
/* Icons (line icons, no emoji)                                        */
/* ------------------------------------------------------------------ */

const PATHS = {
  pause: 'M7 5v14M17 5v14',
  play: 'M7 5l12 7-12 7z',
  fast: 'M4 6l8 6-8 6zM12 6l8 6-8 6z',
  coins: 'M12 3c4.4 0 8 1.6 8 3.5S16.4 10 12 10 4 8.4 4 6.5 7.6 3 12 3zM4 6.5v5C4 13.4 7.6 15 12 15s8-1.6 8-3.5v-5M4 11.5v5c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  rocket: 'M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10zM9 16l-2 4M15 16l2 4M12 9.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3',
  news: 'M5 5h11v14H6a1 1 0 01-1-1zM16 9h3v9a1 1 0 01-1 1h-2M8 9h5M8 12h5M8 15h3',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z',
  check: 'M5 12l5 5L20 7',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
} as const

function Icon({ name, className = 'h-4 w-4' }: { name: keyof typeof PATHS; className?: string }) {
  const filled = name === 'play' || name === 'fast'
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}


/** A ruled top-bar readout: a small label over an fp-data value */
export function Readout({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col justify-center border-l border-rule pl-3 leading-tight" title={title}>
      <span className="fp-label text-[0.62rem] text-paper-faint">{label}</span>
      <span className="fp-data text-base font-semibold text-paper">{children}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Runs the agency clock while the base screen is open */
export function useAgencyClock() {
  useEffect(() => {
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      useWorldStore.getState().tick(Math.min(1, (now - last) / 1000))
      last = now
    }, 200)
    return () => window.clearInterval(id)
  }, [])
}

export function AgencyClock() {
  const day = useWorldStore((s) => Math.floor(s.day))
  const speed = useWorldStore((s) => s.speed)
  const setSpeed = useWorldStore((s) => s.setSpeed)
  const waiting = useGameStore((s) => !!s.simState?.pendingDecision)
  const buttons: [Speed, keyof typeof PATHS, string][] = [
    ['paused', 'pause', 'Pause time'],
    ['normal', 'play', 'Play: 1 day a second'],
    ['fast', 'fast', 'Fast: 10 days a second'],
  ]
  return (
    <div className="flex items-center gap-3">
      <Readout label={waiting ? 'Waiting' : 'Agency'} title={waiting ? 'Time waits for your decision' : 'Agency time'}>
        {/* Plain text, not a Flap: the day ticks every second and a constant roll would blur it */}
        <span className={waiting ? 'text-caution' : ''}>{`Day ${day}`}</span>
      </Readout>
      <div className="flex border border-rule" role="radiogroup" aria-label="Time speed">
        {buttons.map(([s, icon, label], i) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            aria-label={label}
            title={label}
            onClick={() => setSpeed(s)}
            className={`fp-btn-ghost h-7 w-8 justify-center !rounded-none !p-0 ${i > 0 ? 'border-l border-rule' : ''} ${
              speed === s ? '!bg-kapton !text-kapton-ink' : ''
            }`}
          >
            <Icon name={icon} className="h-3 w-3" />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

/** A number that turns go or no-go for a moment when it changes */
function Flash({ value, children }: { value: number; children: ReactNode }) {
  const prev = useRef(value)
  const [dir, setDir] = useState<'up' | 'down' | null>(null)
  useEffect(() => {
    const d = value - prev.current
    prev.current = value
    if (Math.abs(d) < 0.05) return
    setDir(d > 0 ? 'up' : 'down')
    const id = window.setTimeout(() => setDir(null), 900)
    return () => window.clearTimeout(id)
  }, [value])
  return <span className={`transition-colors duration-500 ${dir === 'up' ? 'text-go' : dir === 'down' ? 'text-nogo' : ''}`}>{children}</span>
}

export function AgencyWallet() {
  const funds = useWorldStore((s) => s.funds)
  const popularity = useWorldStore((s) => s.popularity)
  const detail = useUiStore((s) => s.agencyWalletDetail)
  const setDetail = useUiStore((s) => s.setAgencyWalletDetail)
  const toggle = (key: 'funds' | 'popularity') => setDetail(detail === key ? null : key)
  const cell = (active: boolean) =>
    `flex flex-col items-start border px-2.5 py-1 leading-tight transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-kapton ${
      active ? 'border-kapton bg-ink-3' : 'border-rule hover:border-rule-strong hover:bg-ink-2'
    }`
  return (
    <div className="relative flex items-stretch gap-1.5" aria-label="Agency">
      <button
        type="button"
        onClick={() => toggle('funds')}
        aria-pressed={detail === 'funds'}
        className={cell(detail === 'funds')}
        title="Agency money. Click for where it comes from."
      >
        <span className="fp-label text-[0.62rem] text-paper-faint">FUNDS</span>
        <span className="fp-data text-base font-semibold text-paper">
          <Flash value={funds}>{money(funds)}</Flash>
        </span>
      </button>
      <button
        type="button"
        onClick={() => toggle('popularity')}
        aria-pressed={detail === 'popularity'}
        className={cell(detail === 'popularity')}
        title="How much the public backs the agency. Click for what it changes."
      >
        <span className="fp-label text-[0.62rem] text-paper-faint">POPULARITY</span>
        <span className="fp-data text-base font-semibold text-paper">
          <Flash value={Math.round(popularity)}>{Math.round(popularity)}%</Flash>
        </span>
      </button>
      {detail && <WalletBreakdown detail={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

/** Where the money comes from, or what popularity changes (opened from the top bar) */
function WalletBreakdown({ detail, onClose }: { detail: 'funds' | 'popularity'; onClose: () => void }) {
  const popularity = useWorldStore((s) => s.popularity)
  const research = useWorldStore((s) => s.research)
  const difficulty = useGameStore((s) => s.difficulty)
  const budget = difficultyPresets[difficulty].budgetCap
  const next = missionFunding(budget, popularity)
  const papersLeft = lunarPapers
    .filter((spec) => !research.papers.some((p) => p.id === spec.id && p.publishedDay !== null))
    .reduce((sum, spec) => sum + spec.money, 0)
  const rows: [string, string][] =
    detail === 'funds'
      ? [
          ['Government funding', `+${money(fundingPerDay(popularity) * 30)} a month`],
          ['Papers still to publish', `+${money(papersLeft)}`],
          ['Your share of the next launch', `−${money(next.agencyPays)}`],
          ['Unspent mission budget', 'comes back after a success; a failure spends it all'],
        ]
      : [
          ['Government pays per mission', `${Math.round(grantShare(popularity) * 100)}% of the budget`],
          ['Funding multiplier', `${(0.5 + popularity / 100).toFixed(2)}×`],
          ['Launch / full success', `+${popularityEffects.launch}% / +${popularityEffects.missionSuccess}%`],
          ['Mission failed', `${popularityEffects.missionFailed}%`],
        ]
  return (
    <Sheet tone="raised" className="absolute right-0 top-full z-40 mt-2 w-72 p-3 text-paper">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="fp-label">{detail === 'funds' ? 'Where money comes from' : 'What popularity changes'}</span>
        <button type="button" aria-label="Close" onClick={onClose} className="fp-btn-ghost !p-1">
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="text-xs">
        {rows.map(([k, v]) => (
          <li key={k} className="flex justify-between gap-3 border-b border-rule py-1 last:border-b-0">
            <span className="text-paper-dim">{k}</span>
            <span className={`text-right text-paper ${/\d/.test(v) ? 'fp-data' : 'text-paper-dim'}`}>{v}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Shared: modal sheet, ruled stat cell, ops-log tone rules            */
/* ------------------------------------------------------------------ */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/80 p-4" onClick={onClose}>
      <Sheet
        tone="raised"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg p-5 text-paper"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-rule pb-2">
          <h2 className="fp-display text-lg text-paper">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="fp-btn-ghost !p-1">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </Sheet>
    </div>
  )
}

/** A ruled data cell: label over an fp-data value */
function Stat({ label, value, tone = 'text-paper' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border-l border-rule px-2 py-1">
      <div className="fp-label text-[0.6rem] text-paper-faint">{label}</div>
      <div className={`fp-data text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

/** The 3px left rule of an ops-log row */
const logRule: Record<MissionLogEntry['tone'], string> = {
  info: 'border-l-rule-strong',
  good: 'border-l-go',
  warning: 'border-l-caution',
  bad: 'border-l-nogo',
}

/* ------------------------------------------------------------------ */
/* Right: the current mission                                          */
/* ------------------------------------------------------------------ */

const STEPS = ['Plan', 'Build', 'Travel', 'Map', 'Done'] as const
const stepOf: Record<MissionStage, number> = {
  planning: 0,
  building: 1,
  transfer: 2,
  'in-orbit': 3,
  success: 4,
  partial: 4,
  failed: 4,
}
const stageTone: Record<MissionStage, TagTone> = {
  planning: 'neutral',
  building: 'kapton',
  transfer: 'kapton',
  'in-orbit': 'kapton',
  success: 'go',
  partial: 'caution',
  failed: 'nogo',
}

function Stepper({ stage }: { stage: MissionStage }) {
  const at = stepOf[stage]
  const failed = stage === 'failed'
  return (
    <ol className="grid grid-cols-5 border border-rule" aria-label="Mission steps">
      {STEPS.map((name, i) => {
        const done = i < at || (i === at && at === 4 && !failed)
        const now = i === at && !done
        return (
          <li
            key={name}
            aria-current={now ? 'step' : undefined}
            className={`flex flex-col gap-0.5 px-1.5 py-1 ${i > 0 ? 'border-l border-rule' : ''} ${now ? 'bg-ink-3' : ''}`}
          >
            <span className={`h-[3px] w-full ${done ? 'bg-go' : now ? (failed ? 'bg-nogo' : 'bg-kapton') : 'bg-rule'}`} />
            <span className={`fp-label text-[0.6rem] ${now ? 'text-paper' : done ? 'text-paper-dim' : 'text-paper-faint'}`}>{name}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function MissionPanel({
  status,
  onOpenStatus,
  log,
  sim,
  missionOpen,
  onNewMission,
}: {
  status: MissionStatusView
  onOpenStatus?: () => void
  log: MissionLogEntry[]
  sim: SimState | null
  missionOpen: boolean
  onNewMission: () => void
}) {
  const popularity = useWorldStore((s) => s.popularity)
  const difficulty = useGameStore((s) => s.difficulty)
  const design = useGameStore((s) => s.design)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const budget = difficultyPresets[difficulty].budgetCap
  const over = !!sim && isSimComplete(sim)
  const pct = Math.round(status.progress * 100)

  if (!missionOpen) {
    return (
      <Sheet as="section" tone="raised" aria-label="Current mission" className="p-4 text-paper">
        <h2 className="fp-label">Current mission</h2>
        <p className="mt-2 fp-display text-base text-paper">No mission running</p>
        <p className="mt-1 text-xs text-paper-dim">Pick the next mission. The government pays part of its budget.</p>
        <button type="button" onClick={onNewMission} className="fp-btn-primary mt-3 w-full justify-center">
          <Icon name="plus" className="h-3.5 w-3.5" /> New mission
        </button>
      </Sheet>
    )
  }

  const f = missionFunding(budget, popularity)
  const action = status.opens === 'report' ? 'See the report' : status.opens ? 'Continue' : null
  // The core's projection for the design being planned or flown: 0% means it can never map ice
  const flownDesign = sim?.design ?? design
  const projectedIce = computeBudgets(flownDesign, difficulty).projectedCoverage
  const instrumentsChosen = !!sim || visitedSteps.includes('instruments')
  const cannotMapIce = instrumentsChosen && projectedIce < 0.5 && !(sim && sim.coveragePercent > 0)

  return (
    <Sheet as="section" tone="raised" aria-label="Current mission" className="flex min-h-0 flex-col p-4 text-paper">
      <div className="flex items-center justify-between gap-2">
        <span className="fp-label text-[0.62rem] text-paper-faint">Current mission</span>
        <Tag tone={stageTone[status.stage]}>{STAGE_NAMES[status.stage]}</Tag>
      </div>
      <h2 className="mt-1 fp-display text-lg leading-tight text-paper">Lunar Ice Mapper</h2>
      <p className="text-[11px] text-paper-dim">Map water ice at the Moon's south pole</p>

      <div className="mt-3">
        <Stepper stage={status.stage} />
      </div>

      <div className="mt-3">
        <div className="text-xs text-paper">{status.next}</div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden border border-rule bg-ink-0"
          role="progressbar"
          aria-label="Mission progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-kapton transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {cannotMapIce && (
        <div role="note" className="mt-3 border-l-[3px] border-caution bg-caution/10 px-2.5 py-2 text-xs text-paper">
          <span className="fp-label mr-1 text-caution">Caution</span>
          <span className="font-semibold">This craft cannot map ice.</span> The ice hides in craters that never see the
          Sun; only a laser reflectometer or a neutron spectrometer sees there, and only in a low enough orbit.
          {sim && !over ? ' Ice mapped will stay at 0%.' : ' Change the instruments at the Research Lab.'}
        </div>
      )}

      {sim && (
        <div className="mt-3">
          <FlightViewToggle sim={sim} />
        </div>
      )}

      {sim ? (
        <div className="mt-3 border-y border-rule py-1">
          <Stat label="Ice mapped" value={`${sim.coveragePercent.toFixed(0)}%`} tone="text-ice" />
          <Eng as="div" className="mt-1 grid grid-cols-3 border-t border-rule pt-1">
            <Stat label="Data home" value={`${Math.round(sim.totalDataReturned)} MB`} />
            <Stat label="Fuel (delta-v)" value={`${Math.max(0, sim.flight.dvLeft).toFixed(0)} m/s`} />
            <Stat label="Budget left" value={`${Math.max(0, sim.flight.main).toFixed(1)}M`} />
          </Eng>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 border-y border-rule py-1">
          <Stat label="Budget" value={money(budget)} />
          <Stat label="Gov pays" value={money(f.grant)} />
          <Stat label="You pay" value={money(f.agencyPays)} tone="text-kapton" />
        </div>
      )}

      {action && onOpenStatus && (
        <button type="button" onClick={onOpenStatus} className="fp-btn-primary mt-3 w-full justify-center">
          {action}
        </button>
      )}

      {sim && (
        <div className="mt-3 flex min-h-0 flex-col">
          <h3 className="fp-label border-b border-rule pb-1">Mission log</h3>
          {log.length === 0 ? (
            <p className="mt-1 text-xs text-paper-faint">Nothing yet.</p>
          ) : (
            <ul className="scroll-quiet min-h-0 overflow-y-auto">
              {log.slice(0, 6).map((e) => (
                <li key={e.id} className={`flex shrink-0 gap-2 border-b border-l-[3px] border-b-rule py-1 pl-2 text-xs ${logRule[e.tone]}`}>
                  <span className="fp-data shrink-0 text-[10px] text-paper-faint">{missionClockLabel(e.month)}</span>
                  <span className="min-w-0 text-paper">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onNewMission}
        disabled={!over}
        title={over ? 'Choose the next mission' : 'One mission at a time: finish this one first'}
        className="fp-btn-secondary mt-3 justify-center disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="plus" className="h-3.5 w-3.5" /> New mission
      </button>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* New mission                                                         */
/* ------------------------------------------------------------------ */

export function NewMissionDialog({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const popularity = useWorldStore((s) => s.popularity)
  const funds = useWorldStore((s) => s.funds)
  const difficulty = useGameStore((s) => s.difficulty)
  const budget = difficultyPresets[difficulty].budgetCap
  const f = missionFunding(budget, popularity)
  const affordable = funds >= f.agencyPays
  const locked = [
    { name: 'Crewed lunar landing', why: 'Opens after the ice map' },
    { name: 'Mars survey probe', why: 'Mars phase' },
  ]
  return (
    <Modal title="New mission" onClose={onClose}>
      <p className="mt-2 text-sm text-paper-dim">Choose what the agency works on next. One mission at a time.</p>
      <button
        type="button"
        onClick={onStart}
        className="mt-4 block w-full border border-kapton/60 bg-ink-1 text-left transition-colors hover:border-kapton hover:bg-ink-2"
      >
        <div className="flex items-baseline gap-3 px-3 pt-3">
          <span className="fp-data text-xs text-kapton">01</span>
          <div className="min-w-0">
            <div className="fp-display text-base text-paper">Lunar Ice Mapper</div>
            <div className="text-xs text-paper-dim">A 6U CubeSat maps water ice in the Moon's dark craters</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 border-y border-rule">
          <div className="px-3 py-1.5">
            <div className="fp-label text-[0.6rem] text-paper-faint">Budget</div>
            <div className="fp-data text-sm font-semibold text-paper">{money(budget)}</div>
          </div>
          <div className="border-l border-rule px-3 py-1.5">
            <div className="fp-label text-[0.6rem] text-paper-faint">Government</div>
            <div className="fp-data text-sm font-semibold text-paper">{money(f.grant)}</div>
          </div>
          <div className={`border-l border-rule px-3 py-1.5 ${affordable ? '' : 'bg-nogo/10'}`}>
            <div className="fp-label text-[0.6rem] text-paper-faint">You pay at launch</div>
            <div className={`fp-data text-sm font-semibold ${affordable ? 'text-go' : 'text-nogo'}`}>{money(f.agencyPays)}</div>
          </div>
        </div>
        <div className="flex justify-end p-3">
          <span className="fp-btn-primary">Start planning →</span>
        </div>
      </button>
      <ul className="mt-3 border-t border-rule">
        {locked.map((m, i) => (
          <li key={m.name} className="flex items-center gap-3 border-b border-rule px-3 py-2 text-paper-faint">
            <span className="fp-data text-xs">{String(i + 2).padStart(2, '0')}</span>
            <Icon name="lock" className="h-3.5 w-3.5" />
            <span className="text-sm font-semibold">{m.name}</span>
            <span className="fp-label ml-auto text-[0.62rem] text-paper-faint">{m.why}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Headquarters: the campaign                                          */
/* ------------------------------------------------------------------ */

/** Campaign progress for the Headquarters label, 0-1 per phase */
export function useCampaignProgress() {
  const mission = useWorldStore((s) => s.mission)
  return useMemo(() => {
    const [sat, moon, mars] = campaign({ mission })
    return { satellites: phaseProgress(sat), moon: phaseProgress(moon), mars: phaseProgress(mars) }
  }, [mission])
}

export function CampaignDialog({ onClose }: { onClose: () => void }) {
  const mission = useWorldStore((s) => s.mission)
  const phases = campaign({ mission })
  return (
    <Modal title="Headquarters: the campaign" onClose={onClose}>
      <p className="mt-2 text-sm text-paper-dim">From satellites to a base on Mars. Each phase opens the next.</p>
      <div className="mt-4 space-y-3">
        {phases.map((p, i) => {
          const pct = Math.round(phaseProgress(p) * 100)
          const lockedPhase = p.goals.every((g) => g.state === 'locked')
          return (
            <div key={p.id} className={`border border-rule p-3 ${lockedPhase ? 'bg-ink-1' : 'bg-ink-2'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`flex items-baseline gap-2 ${lockedPhase ? 'text-paper-faint' : 'text-paper'}`}>
                  <span className="fp-data text-xs text-paper-faint">{i + 1}.</span>
                  <span className="fp-display text-sm">{p.name}</span>
                </span>
                <span className="fp-data text-xs text-paper-dim">{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 border border-rule bg-ink-0">
                <div className={`hud-bar-segments h-full ${pct >= 100 ? 'bg-go' : 'bg-kapton'}`} style={{ width: `${pct}%` }} />
              </div>
              <ul className="mt-2 text-sm">
                {p.goals.map((g) => (
                  <li
                    key={g.label}
                    className={`flex items-center gap-2 border-b border-rule py-1 last:border-b-0 ${g.state === 'locked' ? 'text-paper-faint' : 'text-paper'}`}
                  >
                    <Icon
                      name={g.state === 'done' ? 'check' : g.state === 'locked' ? 'lock' : 'rocket'}
                      className={`h-3.5 w-3.5 shrink-0 ${g.state === 'done' ? 'text-go' : g.state === 'active' ? 'text-kapton' : ''}`}
                    />
                    {g.label}
                    {g.state === 'active' && g.progress !== undefined && (
                      <span className="fp-data ml-auto text-xs text-kapton">{Math.round(g.progress * 100)}%</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Left: notifications, an ops-log teletype                            */
/* ------------------------------------------------------------------ */

type Kind = 'money' | 'popularity' | 'mission' | 'science' | 'warning' | 'bad' | 'news'

function kindOf(e: FeedItem): Kind {
  if (e.tone === 'bad') return 'bad'
  if (e.tone === 'warning') return 'warning'
  if (e.title.startsWith('Paper')) return 'science'
  if (e.title.includes('Lunar Ice Mapper') || e.title.includes('launched')) return 'mission'
  if ((e.money ?? 0) > 0) return 'money'
  if ((e.popularity ?? 0) !== 0) return 'popularity'
  return 'news'
}

/** Tone of each kind: the row's 3px left rule and its teletype code */
const kindLook: Record<Kind, { rule: string; code: string }> = {
  money: { rule: 'border-l-go', code: 'FUND' },
  popularity: { rule: 'border-l-go', code: 'PRESS' },
  mission: { rule: 'border-l-kapton', code: 'MSN' },
  science: { rule: 'border-l-go', code: 'SCI' },
  warning: { rule: 'border-l-caution', code: 'CAUT' },
  bad: { rule: 'border-l-nogo', code: 'ALRT' },
  news: { rule: 'border-l-rule-strong', code: 'NEWS' },
}

function ago(day: number, today: number): string {
  const d = Math.floor(today) - Math.floor(day)
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d} days ago`
  const m = Math.round(d / 30)
  return `${m} month${m === 1 ? '' : 's'} ago`
}

/** The real events of the agency and its mission, newest first. No events: nothing shown. */
export function useRealNews(): FeedItem[] {
  const feed = useWorldStore((s) => s.feed)
  return useMemo(() => feed.filter((e) => !e.quiet).slice(0, 12), [feed])
}

export function Notifications({ onHide }: { onHide?: () => void } = {}) {
  const items = useRealNews()
  const day = useWorldStore((s) => s.day)
  const today = Math.floor(day)
  if (items.length === 0) return null

  return (
    <Sheet as="section" tone="inset" aria-label="Notifications" className="flex min-h-0 flex-col text-paper">
      <div className="flex items-center justify-between border-b border-rule-strong px-3 py-2">
        <h2 className="fp-label">Notifications</h2>
        {onHide && (
          <button type="button" onClick={onHide} aria-label="Hide notifications" className="fp-label text-paper-dim hover:text-paper">
            Hide ◂
          </button>
        )}
      </div>
      <ul className="scroll-quiet fade-bottom flex min-h-0 flex-col overflow-y-auto pb-8">
        {items.map((e, i) => {
          const look = kindLook[kindOf(e)]
          return (
            <li key={e.id} className={`notif-in shrink-0 border-b border-l-[3px] border-b-rule px-3 py-2 ${look.rule} ${i === 0 ? 'bg-ink-2' : ''}`}>
              <div className="fp-data flex items-baseline justify-between gap-2 text-[10px] text-paper-faint">
                <span>{look.code}</span>
                <span>{ago(e.day, today)}</span>
              </div>
              <div className="text-sm font-semibold leading-snug text-paper">{e.title}</div>
              {e.detail && <div className="truncate text-xs text-paper-dim">{e.detail}</div>}
              {(!!e.money || !!e.popularity) && (
                <Eng as="div" className="fp-data mt-0.5 flex gap-3 text-[11px]">
                  {!!e.money && (
                    <span className={e.money > 0 ? 'text-go' : 'text-nogo'}>
                      {e.money > 0 ? '+' : '−'}
                      {money(Math.abs(e.money))}
                    </span>
                  )}
                  {!!e.popularity && (
                    <span className={e.popularity > 0 ? 'text-go' : 'text-nogo'}>
                      {e.popularity > 0 ? '+' : '−'}
                      {Math.abs(Math.round(e.popularity))}% popularity
                    </span>
                  )}
                </Eng>
              )}
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Mission result                                                      */
/* ------------------------------------------------------------------ */

const OUTCOME_LOOK: Record<MissionResult['outcome'], { title: string; line: string; stamp: string; verdict: StampVerdict }> = {
  success: {
    title: 'Mission complete',
    line: 'Full success: the ice map is done and its data is home.',
    stamp: 'Success',
    verdict: 'go',
  },
  partial: {
    title: 'Mission over',
    line: 'Partial success: some of the ice map made it home.',
    stamp: 'Partial',
    verdict: 'caution',
  },
  failed: {
    title: 'Mission failed',
    line: 'The mission missed its goals. The report shows what went wrong.',
    stamp: 'Failed',
    verdict: 'nogo',
  },
}

const signedMoney = (x: number) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x))}`
const signedPoints = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x))}%`

/** A ruled ledger: detail rows (engineer view) over a net line (always shown) */
function Ledger({
  title,
  rows,
  net,
  fmt,
  total,
}: {
  title: string
  rows: { label: string; amount: number }[]
  net: number
  fmt: (x: number) => string
  /** Replaces the Net line when the headline is not a signed sum (money: left of the budget) */
  total?: { label: string; text: string }
}) {
  return (
    <div className="border border-rule bg-ink-1 p-2.5">
      <div className="fp-label text-[0.62rem]">{title}</div>
      <Eng as="ul" className="mt-1 block text-xs">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-2 border-b border-rule py-0.5">
            <span className="text-paper-dim">{r.label}</span>
            <span className={`fp-data ${r.amount >= 0 ? 'text-go' : 'text-nogo'}`}>{fmt(r.amount)}</span>
          </li>
        ))}
      </Eng>
      <div className="mt-1 flex justify-between text-sm font-semibold">
        <span className="text-paper">{total?.label ?? 'Net'}</span>
        <span className={`fp-data whitespace-nowrap ${total ? 'text-paper' : net >= 0 ? 'text-go' : 'text-nogo'}`}>{total?.text ?? fmt(net)}</span>
      </div>
    </div>
  )
}

/** Pops up once when a mission ends, success or failure: results and what the agency gained or lost */
export function MissionResultDialog({
  sim,
  onReport,
  onNewMission,
}: {
  sim: SimState | null
  onReport?: () => void
  onNewMission: () => void
}) {
  const mission = useWorldStore((s) => s.mission)
  const research = useWorldStore((s) => s.research)
  const seen = useWorldStore((s) => s.resultSeenSeed)
  const markSeen = useWorldStore((s) => s.markResultSeen)
  const result = useMemo(() => missionResult({ mission, research }), [mission, research])
  if (!result || !mission || seen === mission.seed || !sim || sim.seed !== mission.seed) return null

  const look = OUTCOME_LOOK[result.outcome]
  // Say what actually happened: the craft lost, or a craft that flew but could not reach the goals
  // (the same end reason the report gives: failedLine)
  const line = result.outcome !== 'failed' ? look.line : failedLine(sim.flight.end, sim.phase === 'failed', result.coverage)
  const close = () => markSeen(mission.seed)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/80 p-4" onClick={close}>
      <Sheet
        tone="raised"
        role="dialog"
        aria-modal="true"
        aria-label={look.title}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="w-full max-w-md text-paper"
      >
        <div className="flex items-start justify-between gap-4 border-b border-rule p-5 pb-4">
          <div className="min-w-0">
            <div className="fp-label text-[0.62rem] text-paper-faint">{result.name}</div>
            <h2 className="fp-display mt-0.5 text-xl text-paper">{look.title}</h2>
            <p className="mt-1 text-sm text-paper-dim">{line}</p>
          </div>
          <Stamp verdict={look.verdict} animate className="mt-2 shrink-0 text-xl">
            {look.stamp}
          </Stamp>
        </div>

        <div className="grid grid-cols-3 border-b border-rule px-3 py-1.5">
          <Stat label="Ice mapped" value={`${result.coverage.toFixed(0)}%`} tone="text-ice" />
          <Stat label="Data home" value={`${Math.round(result.dataMb)} MB`} />
          <Stat label="Science months" value={`${sim.flight.scienceTurns}`} />
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pt-4">
          <Ledger
            title="Money"
            rows={result.money}
            net={result.moneyNet}
            fmt={signedMoney}
            total={{ label: 'Left', text: `${money(result.moneyLeft)} of ${money(result.budget)}` }}
          />
          <Ledger title="Popularity" rows={result.popularity} net={result.popularityNet} fmt={signedPoints} />
        </div>

        {result.papers.length > 0 && (
          <div className="mx-5 mt-2 border border-rule bg-ink-1 p-2.5">
            <div className="fp-label text-[0.62rem]">Papers published</div>
            <ul className="mt-1 text-xs text-paper">
              {result.papers.map((p) => (
                <li key={p.title} className="truncate border-b border-rule py-0.5 last:border-b-0">
                  {p.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-2 border-t border-rule p-4">
          {onReport && (
            <button
              type="button"
              onClick={() => {
                close()
                onReport()
              }}
              className="fp-btn-secondary flex-1 justify-center"
            >
              See the report
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              close()
              onNewMission()
            }}
            className="fp-btn-primary flex-1 justify-center"
          >
            New mission
          </button>
          <button type="button" onClick={close} aria-label="Close" className="fp-btn-ghost px-3">
            <Icon name="close" />
          </button>
        </div>
      </Sheet>
    </div>
  )
}
