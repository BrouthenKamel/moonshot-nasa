import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore, type Speed } from '../../state/worldStore'
import { missionFunding } from '../../game/economy'
import { campaign, phaseProgress, type CampaignPhase } from '../../game/campaign'
import { backgroundNews } from '../../game/news'
import type { FeedItem } from '../../game/world'
import { difficultyPresets } from '../../data/brief'
import { isSimComplete } from '../../sim/simulate'
import type { SimState } from '../../sim/types'
import { FlightViewToggle } from '../flight/FlightStage'
import { STAGE_NAMES, missionClockLabel, type MissionLogEntry, type MissionStage, type MissionStatusView } from '../../viz/missionMap'

/*
 * The agency layer on the base screen (numbers from src/game through useWorldStore):
 * the clock and the wallet in the top bar, the mission card on the right, news on the left,
 * and the Headquarters campaign and New mission dialogs.
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
    <div className="flex items-center gap-2">
      <div className="leading-tight" title={waiting ? 'Time waits for your decision' : 'Agency time'}>
        <div className="text-[10px] font-semibold tracking-wider text-slate-300">{waiting ? 'WAITING' : 'AGENCY'}</div>
        <div className="font-display text-xl font-bold tabular-nums">Day {day}</div>
      </div>
      <div className="flex rounded-full border border-white/20 bg-white/5 p-0.5" role="radiogroup" aria-label="Time speed">
        {buttons.map(([s, icon, label]) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            aria-label={label}
            title={label}
            onClick={() => setSpeed(s)}
            className={`flex h-7 w-8 items-center justify-center rounded-full transition ${
              speed === s ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <Icon name={icon} className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

/** A number that flashes green or red for a moment when it changes */
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
  return <span className={`transition-colors duration-500 ${dir === 'up' ? 'text-emerald-300' : dir === 'down' ? 'text-red-300' : ''}`}>{children}</span>
}

export function AgencyWallet() {
  const funds = useWorldStore((s) => s.funds)
  const popularity = useWorldStore((s) => s.popularity)
  const chip = 'flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1'
  return (
    <div className="flex items-center gap-2" aria-label="Agency">
      <div className={chip} title="Agency money. Government funding comes in all the time, more with higher popularity. Papers earn more.">
        <Icon name="coins" className="h-4 w-4 text-amber-300" />
        <span className="text-[10px] font-semibold tracking-wider text-slate-300">FUNDS</span>
        <span className="font-display text-lg font-bold tabular-nums">
          <Flash value={funds}>{money(funds)}</Flash>
        </span>
      </div>
      <div className={chip} title="Public support. Successes and papers raise it; failures lower it. It sets your funding and the government's share of each mission.">
        <Icon name="heart" className="h-4 w-4 text-pink-300" />
        <span className="text-[10px] font-semibold tracking-wider text-slate-300">POPULARITY</span>
        <span className="font-display text-lg font-bold tabular-nums">
          <Flash value={Math.round(popularity)}>{Math.round(popularity)}%</Flash>
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shared look: see-through navy glass                                 */
/* ------------------------------------------------------------------ */

const glass = 'rounded-2xl border border-white/10 bg-[#0b1226]/70 text-white shadow-xl backdrop-blur-md'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-2xl bg-[#fbf7ef] p-5 text-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-200">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
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
const chip: Record<MissionStage, string> = {
  planning: 'bg-violet-400/20 text-violet-200',
  building: 'bg-teal-400/20 text-teal-200',
  transfer: 'bg-orange-400/20 text-orange-200',
  'in-orbit': 'bg-sky-400/20 text-sky-200',
  success: 'bg-emerald-400/20 text-emerald-200',
  partial: 'bg-yellow-400/20 text-yellow-200',
  failed: 'bg-red-400/20 text-red-200',
}

function Stepper({ stage }: { stage: MissionStage }) {
  const at = stepOf[stage]
  const failed = stage === 'failed'
  return (
    <ol className="flex items-center" aria-label="Mission steps">
      {STEPS.map((name, i) => {
        const done = i < at || (i === at && at === 4 && !failed)
        const now = i === at && !done
        return (
          <li key={name} className="flex flex-1 flex-col items-center gap-1 text-[10px]" aria-current={now ? 'step' : undefined}>
            <span className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : i <= at ? 'bg-emerald-400' : 'bg-white/15'}`} />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  done ? 'bg-emerald-400 text-[#0b1226]' : now ? (failed ? 'bg-red-500' : 'bg-orange-500 ring-4 ring-orange-500/30') : 'bg-white/15'
                }`}
              >
                {done && <Icon name="check" className="h-3 w-3" />}
              </span>
              <span className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? 'opacity-0' : i < at ? 'bg-emerald-400' : 'bg-white/15'}`} />
            </span>
            <span className={now ? 'font-semibold text-white' : 'text-slate-400'}>{name}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-display text-base font-bold tabular-nums">{value}</div>
    </div>
  )
}

const toneDot: Record<MissionLogEntry['tone'], string> = {
  info: 'bg-sky-400',
  good: 'bg-emerald-400',
  warning: 'bg-amber-400',
  bad: 'bg-red-400',
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
  const budget = difficultyPresets[difficulty].budgetCap
  const over = !!sim && isSimComplete(sim)
  const pct = Math.round(status.progress * 100)

  if (!missionOpen) {
    return (
      <section aria-label="Current mission" className={`${glass} p-4`}>
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current mission</h2>
        <p className="mt-2 font-display text-lg font-bold">No mission running</p>
        <p className="mt-1 text-xs text-slate-300">Pick the next mission. The government pays part of its budget.</p>
        <button
          type="button"
          onClick={onNewMission}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 font-display font-bold text-white shadow-lg hover:bg-orange-400"
        >
          <Icon name="plus" /> New mission
        </button>
      </section>
    )
  }

  const f = missionFunding(budget, popularity)
  const action = status.opens === 'report' ? 'See the report' : status.opens ? 'Continue' : null

  return (
    <section aria-label="Current mission" className={`${glass} flex min-h-0 flex-col p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold leading-tight">Lunar Ice Mapper</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${chip[status.stage]}`}>{STAGE_NAMES[status.stage]}</span>
      </div>
      <p className="text-[11px] text-slate-400">Map water ice at the Moon's south pole</p>

      <div className="mt-3">
        <Stepper stage={status.stage} />
      </div>

      <div className="mt-3">
        <div className="text-xs text-slate-200">{status.next}</div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Mission progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-orange-400 transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {sim && (
        <div className="mt-3">
          <FlightViewToggle sim={sim} />
        </div>
      )}

      <div className={`mt-3 grid gap-1.5 ${sim ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {sim ? (
          <>
            <Stat label="Ice mapped" value={`${sim.coveragePercent.toFixed(0)}%`} />
            <Stat label="Data home" value={`${Math.round(sim.totalDataReturned)} MB`} />
            <Stat label="Fuel (delta-v)" value={`${Math.max(0, sim.flight.dvLeft).toFixed(0)} m/s`} />
            <Stat label="Budget left" value={`${Math.max(0, sim.flight.main).toFixed(1)}M`} />
          </>
        ) : (
          <>
            <Stat label="Budget" value={money(budget)} />
            <Stat label="Gov pays" value={money(f.grant)} />
            <Stat label="You pay" value={money(f.agencyPays)} />
          </>
        )}
      </div>

      {action && onOpenStatus && (
        <button type="button" onClick={onOpenStatus} className="mt-3 rounded-xl bg-orange-500 py-2 font-display font-bold text-white hover:bg-orange-400">
          {action}
        </button>
      )}

      {sim && (
        <div className="mt-3 flex min-h-0 flex-col border-t border-white/10 pt-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mission log</h3>
          {log.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">Nothing yet.</p>
          ) : (
            <ul className="scroll-quiet mt-1 min-h-0 space-y-1 overflow-y-auto">
              {log.slice(0, 6).map((e) => (
                <li key={e.id} className="flex shrink-0 gap-2 text-xs">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[e.tone]}`} />
                  <span className="min-w-0">
                    <span className="mr-1 text-slate-400">{missionClockLabel(e.month)}</span>
                    <span className="text-slate-100">{e.title}</span>
                  </span>
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
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/15 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Icon name="plus" className="h-3.5 w-3.5" /> New mission
      </button>
    </section>
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
  const locked = [
    { name: 'Crewed lunar landing', why: 'Opens after the ice map' },
    { name: 'Mars survey probe', why: 'Mars phase' },
  ]
  return (
    <Modal title="New mission" onClose={onClose}>
      <p className="mt-1 text-sm text-slate-600">Choose what the agency works on next. One mission at a time.</p>
      <button
        type="button"
        onClick={onStart}
        className="mt-4 w-full rounded-2xl border-2 border-orange-400 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <Icon name="rocket" className="h-5 w-5" />
          </span>
          <div>
            <div className="font-display text-lg font-bold">Lunar Ice Mapper</div>
            <div className="text-xs text-slate-500">A 6U CubeSat maps water ice in the Moon's dark craters</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-100 p-1.5">
            <div className="text-slate-500">Budget</div>
            <div className="font-bold">{money(budget)}</div>
          </div>
          <div className="rounded-lg bg-slate-100 p-1.5">
            <div className="text-slate-500">Government</div>
            <div className="font-bold">{money(f.grant)}</div>
          </div>
          <div className={`rounded-lg p-1.5 ${funds >= f.agencyPays ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <div className="text-slate-500">You pay at launch</div>
            <div className="font-bold">{money(f.agencyPays)}</div>
          </div>
        </div>
        <div className="mt-3 text-right font-display text-sm font-bold text-orange-600">Start planning →</div>
      </button>
      <ul className="mt-3 space-y-2">
        {locked.map((m) => (
          <li key={m.name} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-400">
            <Icon name="lock" />
            <span className="font-semibold">{m.name}</span>
            <span className="ml-auto text-xs">{m.why}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Headquarters: the campaign                                          */
/* ------------------------------------------------------------------ */

const phaseColor: Record<CampaignPhase['id'], string> = {
  satellites: 'bg-sky-500',
  moon: 'bg-orange-500',
  mars: 'bg-red-500',
}

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
      <p className="mt-1 text-sm text-slate-600">From satellites to a base on Mars. Each phase opens the next.</p>
      <div className="mt-4 space-y-3">
        {phases.map((p, i) => {
          const pct = Math.round(phaseProgress(p) * 100)
          const lockedPhase = p.goals.every((g) => g.state === 'locked')
          return (
            <div key={p.id} className={`rounded-xl border p-3 ${lockedPhase ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className={`font-display font-bold ${lockedPhase ? 'text-slate-400' : ''}`}>
                  {i + 1}. {p.name}
                </span>
                <span className="text-sm font-bold tabular-nums text-slate-500">{pct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${phaseColor[p.id]}`} style={{ width: `${pct}%` }} />
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {p.goals.map((g) => (
                  <li key={g.label} className={`flex items-center gap-2 ${g.state === 'locked' ? 'text-slate-400' : 'text-slate-700'}`}>
                    <Icon
                      name={g.state === 'done' ? 'check' : g.state === 'locked' ? 'lock' : 'rocket'}
                      className={`h-3.5 w-3.5 ${g.state === 'done' ? 'text-emerald-600' : g.state === 'active' ? 'text-orange-500' : ''}`}
                    />
                    {g.label}
                    {g.state === 'active' && g.progress !== undefined && (
                      <span className="ml-auto text-xs tabular-nums text-orange-600">{Math.round(g.progress * 100)}%</span>
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
/* Left: notifications                                                 */
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

const kindLook: Record<Kind, { icon: keyof typeof PATHS; badge: string; bar: string }> = {
  money: { icon: 'coins', badge: 'bg-amber-400/20 text-amber-300', bar: 'bg-amber-400' },
  popularity: { icon: 'heart', badge: 'bg-pink-400/20 text-pink-300', bar: 'bg-pink-400' },
  mission: { icon: 'rocket', badge: 'bg-orange-400/20 text-orange-300', bar: 'bg-orange-400' },
  science: { icon: 'flask', badge: 'bg-emerald-400/20 text-emerald-300', bar: 'bg-emerald-400' },
  warning: { icon: 'alert', badge: 'bg-amber-400/20 text-amber-300', bar: 'bg-amber-400' },
  bad: { icon: 'alert', badge: 'bg-red-400/20 text-red-300', bar: 'bg-red-400' },
  news: { icon: 'news', badge: 'bg-sky-400/20 text-sky-300', bar: 'bg-sky-400' },
}

function ago(day: number, today: number): string {
  const d = Math.floor(today) - Math.floor(day)
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d} days ago`
  const m = Math.round(d / 30)
  return `${m} month${m === 1 ? '' : 's'} ago`
}

export function Notifications() {
  const feed = useWorldStore((s) => s.feed)
  const day = useWorldStore((s) => s.day)
  const today = Math.floor(day)
  const items = useMemo(() => {
    const real = feed.filter((e) => !e.quiet)
    return [...real, ...backgroundNews(today - 60, today)].sort((a, b) => b.day - a.day).slice(0, 12)
  }, [feed, today])

  return (
    <section aria-label="Notifications" className="flex min-h-0 flex-col gap-2">
      <h2 className="px-1 text-[10px] font-bold uppercase tracking-wider text-white/80 drop-shadow">Notifications</h2>
      <ul className="scroll-quiet fade-bottom flex min-h-0 flex-col gap-2 overflow-y-auto pb-8">
        {items.map((e, i) => {
          const look = kindLook[kindOf(e)]
          return (
            <li
              key={e.id}
              className={`notif-in relative flex shrink-0 gap-2.5 overflow-hidden rounded-xl border border-white/10 bg-[#0b1226]/60 p-2.5 pl-3.5 text-white shadow-lg backdrop-blur-md ${
                i === 0 ? 'ring-1 ring-white/25' : ''
              }`}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${look.bar}`} />
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${look.badge}`}>
                <Icon name={look.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{e.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{ago(e.day, today)}</span>
                </div>
                {e.detail && <div className="truncate text-xs text-slate-300">{e.detail}</div>}
                {(!!e.money || !!e.popularity) && (
                  <div className="mt-1 flex gap-1.5 text-[11px] font-semibold tabular-nums">
                    {!!e.money && (
                      <span className={`rounded-full px-1.5 ${e.money > 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
                        {e.money > 0 ? '+' : '−'}
                        {money(Math.abs(e.money))}
                      </span>
                    )}
                    {!!e.popularity && (
                      <span className={`rounded-full px-1.5 ${e.popularity > 0 ? 'bg-pink-400/15 text-pink-300' : 'bg-red-400/15 text-red-300'}`}>
                        {e.popularity > 0 ? '+' : '−'}
                        {Math.abs(Math.round(e.popularity))}% popularity
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
