import { useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import { useUiStore } from '../../state/uiStore'
import { fundingPerDay, grantShare, missionFunding } from '../../game/economy'
import { lunarPapers, paperProgress, type PaperSpec } from '../../game/research'
import { isSimComplete } from '../../sim/simulate'
import type { FeedItem, MissionPhase } from '../../game/world'
import { difficultyPresets } from '../../data/brief'
import { buildingForStep, buildingName, suggestedStep } from '../../viz/missionMap'

/*
 * The agency layer on the base screen: money and popularity in the top bar,
 * and a collapsible interactive dashboard on the left with the mission's money, research and news.
 * Numbers come from the agency rules (src/game) through useWorldStore.
 */

const money = (m: number) => `$${m.toFixed(1)}M`
const signed = (x: number, unit: string) => `${x > 0 ? '+' : ''}${unit === '$' ? `$${x.toFixed(1)}M` : `${Math.round(x)}%`}`

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

export function AgencyWallet() {
  const funds = useWorldStore((s) => s.funds)
  const popularity = useWorldStore((s) => s.popularity)
  const detail = useUiStore((s) => s.agencyWalletDetail)
  const setDetail = useUiStore((s) => s.setAgencyWalletDetail)
  const setOpen = useUiStore((s) => s.setAgencyDashboardOpen)

  const toggle = (key: 'funds' | 'popularity') => {
    if (detail === key) {
      setDetail(null)
    } else {
      setDetail(key)
      setOpen(true)
    }
  }

  const chip = (active: boolean) =>
    `flex cursor-pointer items-baseline gap-1.5 rounded-full border px-3 py-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 ${
      active
        ? 'border-orange-400 bg-orange-500/20 text-white shadow-[0_0_12px_rgba(251,146,60,0.3)]'
        : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/15'
    }`

  return (
    <div className="flex items-center gap-2" aria-label="Agency">
      <button
        type="button"
        onClick={() => toggle('funds')}
        aria-pressed={detail === 'funds'}
        className={chip(detail === 'funds')}
        title="Agency funds. Click for funding breakdown."
      >
        <span className="text-[10px] font-semibold tracking-wider text-slate-300">FUNDS</span>
        <span className="font-display text-lg font-bold tabular-nums">{money(funds)}</span>
      </button>
      <button
        type="button"
        onClick={() => toggle('popularity')}
        aria-pressed={detail === 'popularity'}
        className={chip(detail === 'popularity')}
        title="Agency popularity. Click for government grant breakdown."
      >
        <span className="text-[10px] font-semibold tracking-wider text-slate-300">POPULARITY</span>
        <span className="font-display text-lg font-bold tabular-nums">{Math.round(popularity)}%</span>
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Left dashboard                                                      */
/* ------------------------------------------------------------------ */

const phaseName: Record<MissionPhase, string> = {
  build: 'Building',
  test: 'Testing',
  wait: 'Waiting for the ride',
  transfer: 'On the way to the Moon',
  capture: 'Braking into orbit',
  orbit: 'Mapping the ice',
  complete: 'Mission complete',
  failed: 'Mission lost',
}

const toneDot: Record<FeedItem['tone'], string> = {
  info: 'bg-sky-500',
  good: 'bg-emerald-500',
  warning: 'bg-amber-500',
  bad: 'bg-red-500',
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-slate-900' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
      <h3 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function WalletDetailCard() {
  const detail = useUiStore((s) => s.agencyWalletDetail)
  const setDetail = useUiStore((s) => s.setAgencyWalletDetail)
  const popularity = useWorldStore((s) => s.popularity)
  const researchState = useWorldStore((s) => s.research)
  const difficulty = useGameStore((s) => s.difficulty)
  if (!detail) return null

  const monthlyIncome = fundingPerDay(popularity) * 30
  const sharePct = Math.round(grantShare(popularity) * 100)
  const budget = difficultyPresets[difficulty].budgetCap
  const nextFunding = missionFunding(budget, popularity)
  const unpublishedMoney = lunarPapers
    .filter((spec) => !researchState.papers.some((p) => p.id === spec.id && p.publishedDay !== null))
    .reduce((sum, spec) => sum + spec.money, 0)

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/90 p-2.5 text-xs text-slate-700 shadow-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-orange-800">
          {detail === 'funds' ? 'Agency Funds Breakdown' : 'Popularity & Grant Share'}
        </span>
        <button
          type="button"
          onClick={() => setDetail(null)}
          aria-label="Close breakdown"
          className="rounded px-1.5 py-0.5 text-xs font-bold text-slate-500 hover:bg-orange-200/50 hover:text-slate-800"
        >
          ×
        </button>
      </div>
      {detail === 'funds' ? (
        <div className="space-y-1">
          <Row label="Monthly income" value={`+${money(monthlyIncome)} / mo`} strong />
          <Row label="Available paper awards" value={`+${money(unpublishedMoney)}`} />
          <Row label="Next mission share" value={`-${money(nextFunding.agencyPays)}`} />
          <p className="pt-0.5 text-[11px] text-slate-500">
            Unspent mission reserve returns when the mission concludes.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <Row label="Government share" value={`${sharePct}% of budget`} strong />
          <Row label="Income rate multiplier" value={`${(0.5 + popularity / 100).toFixed(2)}x`} />
          <Row label="Launch / Success bonus" value="+2% / +10%" />
          <p className="pt-0.5 text-[11px] text-slate-500">
            Higher popularity cuts the agency share on every launch (30%–80% grant).
          </p>
        </div>
      )}
    </div>
  )
}

function MissionMoney() {
  const mission = useWorldStore((s) => s.mission)
  const popularity = useWorldStore((s) => s.popularity)
  const difficulty = useGameStore((s) => s.difficulty)
  const simState = useGameStore((s) => s.simState)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const currentReport = useGameStore((s) => s.currentReport)
  const openBuilding = useGameStore((s) => s.openBuilding)
  const showReport = useGameStore((s) => s.showReport)
  const flightView = useUiStore((s) => s.flightView)
  const setFlightView = useUiStore((s) => s.setFlightView)
  const flying = !!simState
  const budget = difficultyPresets[difficulty].budgetCap

  // Planning: what the government would pay if the mission launched today
  if (!mission || !flying) {
    const f = missionFunding(budget, popularity)
    const nextStep = suggestedStep(visitedSteps)
    const nextBld = buildingForStep(nextStep)
    return (
      <button
        type="button"
        onClick={() => openBuilding(nextBld)}
        className="group w-full cursor-pointer rounded-xl border border-slate-200/90 bg-white/75 p-2 text-left transition hover:border-orange-300 hover:bg-orange-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
      >
        <p className="mb-1.5 text-xs text-slate-600">
          Planning. When you launch, the government pays its share and the agency pays the rest.
        </p>
        <div className="space-y-0.5">
          <Row label="Mission budget" value={money(budget)} />
          <Row label={`Government (${Math.round(f.share * 100)}%)`} value={money(f.grant)} />
          <Row label="Agency pays" value={money(f.agencyPays)} strong />
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-200/70 pt-1.5 text-[11px] font-semibold text-orange-700">
          <span>Open {buildingName(nextBld)}</span>
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </div>
      </button>
    )
  }

  const last = mission.last
  const finished = !!simState && isSimComplete(simState) && !!currentReport
  const canSwitchView = !!simState && simState.flight.launchedTurn !== null
  const interactive = finished || canSwitchView

  const handleClick = () => {
    if (finished) showReport()
    else if (canSwitchView) setFlightView(flightView === 'space' ? 'island' : 'space')
  }

  const body = (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold text-slate-900">{mission.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            last.ended ? (last.outcome === 'failed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700') : 'bg-orange-100 text-orange-700'
          }`}
        >
          {phaseName[last.phase]}
        </span>
      </div>
      <div className="space-y-0.5">
        <Row label="Budget" value={money(mission.budget)} />
        <Row label="Government paid" value={money(mission.grant)} />
        <Row label="Agency paid" value={money(mission.agencyPaid)} />
        {last.launched && <Row label="Ice mapped" value={`${last.coverage.toFixed(0)}%`} strong />}
        {last.launched && <Row label="Data home" value={`${Math.round(last.dataMb)} MB`} />}
        {last.ended && <Row label="Budget returned" value={money(last.leftover)} />}
      </div>
      {interactive && (
        <div className="mt-2 flex items-center justify-between border-t border-slate-200/70 pt-1.5 text-[11px] font-semibold text-orange-700">
          <span>{finished ? 'See mission report' : flightView === 'space' ? 'Switch to Base Island' : 'Switch to Space View'}</span>
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </div>
      )}
    </>
  )

  if (!interactive) {
    return <div className="rounded-xl border border-slate-200/80 bg-white/60 p-2">{body}</div>
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group w-full cursor-pointer rounded-xl border border-slate-200/90 bg-white/75 p-2 text-left transition hover:border-orange-300 hover:bg-orange-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
    >
      {body}
    </button>
  )
}

function triggerLabel(spec: PaperSpec): string {
  return spec.trigger.kind === 'processed'
    ? `Requires ${spec.trigger.mb} MB processed at the Research Lab`
    : `Requires ${spec.trigger.percent}% Lunar south pole mapped`
}

function Research() {
  const r = useWorldStore((s) => s.research)
  const simState = useGameStore((s) => s.simState)
  const openBuilding = useGameStore((s) => s.openBuilding)
  const reviseAt = useGameStore((s) => s.reviseAt)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const backlog = Math.max(0, r.received - r.processed)
  const canOpenLab = !simState || isSimComplete(simState)

  return (
    <ul className="space-y-1">
      {lunarPapers.map((spec) => {
        const paper = r.papers.find((p) => p.id === spec.id)
        const done = paper?.publishedDay != null
        const pct = paper && !done ? Math.round(paperProgress(r, paper) * 100) : 0
        const open = selectedId === spec.id
        return (
          <li key={spec.id} className="text-xs">
            <button
              type="button"
              onClick={() => setSelectedId(open ? null : spec.id)}
              aria-expanded={open}
              className={`w-full cursor-pointer rounded-lg px-1.5 py-1 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 ${
                open ? 'bg-orange-50/90 ring-1 ring-orange-200' : 'hover:bg-slate-200/50'
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className={done ? 'font-medium text-slate-900' : 'text-slate-700'}>
                  {done ? '✓ ' : ''}
                  {spec.title}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-emerald-700">+{money(spec.money)}</span>
              </div>
              {paper && !done && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
              )}
            </button>
            {open && (
              <div className="mt-1 rounded-lg border border-slate-200 bg-white/85 px-2.5 py-2 text-[11px] text-slate-600">
                <div>{triggerLabel(spec)}</div>
                <div className="mt-0.5 font-semibold text-slate-800">
                  Award: +{money(spec.money)} · +{spec.popularity}% popularity
                </div>
                <div className="mt-0.5 text-slate-500">
                  {done ? 'Status: Published' : paper ? `Status: Processing (${pct}%)` : 'Status: Not started'}
                </div>
                {canOpenLab && (
                  <button
                    type="button"
                    onClick={() => (simState ? reviseAt('instruments') : openBuilding('research-lab'))}
                    className="mt-1.5 cursor-pointer rounded-md bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-800 hover:bg-orange-500/25"
                  >
                    Open Research Lab →
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
      {backlog > 0 && <li className="px-1.5 text-[11px] text-slate-500">Lab is processing {Math.round(backlog)} MB of data</li>}
    </ul>
  )
}

function News() {
  const all = useWorldStore((s) => s.feed)
  const simState = useGameStore((s) => s.simState)
  const openBuilding = useGameStore((s) => s.openBuilding)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Routine news (the monthly downlink) stays out: the mission log already shows the flight month by month
  const feed = all.filter((e) => !e.quiet)
  if (feed.length === 0) return <p className="text-xs text-slate-500">No news yet.</p>

  return (
    <ul className="space-y-1">
      {feed.slice(0, 30).map((e, i) => {
        const open = selectedId === e.id
        return (
          <li
            key={e.id}
            className={`rounded-lg transition ${
              open ? 'bg-orange-100/75 ring-1 ring-orange-200' : i === 0 ? 'bg-orange-50' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => setSelectedId(open ? null : e.id)}
              aria-expanded={open}
              className="flex w-full cursor-pointer gap-2 rounded-lg p-1.5 text-left transition hover:bg-orange-100/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[e.tone]}`} />
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-medium text-slate-800">{e.title}</div>
                {e.detail && <div className="text-slate-500">{e.detail}</div>}
                {(!!e.money || !!e.popularity) && (
                  <div className="mt-0.5 flex gap-2 font-semibold tabular-nums">
                    {!!e.money && <span className={e.money > 0 ? 'text-emerald-600' : 'text-red-600'}>{signed(e.money, '$')}</span>}
                    {!!e.popularity && (
                      <span className={e.popularity > 0 ? 'text-emerald-600' : 'text-red-600'}>{signed(e.popularity, '%')} popularity</span>
                    )}
                  </div>
                )}
              </div>
            </button>
            {open && !simState && (
              <div className="px-5 pb-1.5">
                <button
                  type="button"
                  onClick={() => openBuilding(e.title.includes('Research') ? 'research-lab' : 'comms-center')}
                  className="cursor-pointer rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800 hover:bg-orange-500/25"
                >
                  {e.title.includes('Research') ? 'Visit Research Lab →' : 'Open Comms Center →'}
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function AgencyDashboard() {
  const open = useUiStore((s) => s.agencyDashboardOpen)
  const setOpen = useUiStore((s) => s.setAgencyDashboardOpen)

  return (
    <aside
      aria-label="Agency dashboard"
      className="flex max-h-[50vh] min-h-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-[#d6c9b2] bg-[#fbf7ef] p-3 text-slate-800 shadow-xl lg:max-h-none lg:bg-[#fbf7ef]/95 lg:backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
        >
          <h2 className="font-display text-lg font-bold text-[#14213d]">Agency</h2>
          <span className="rounded-full border border-slate-300/80 bg-white/80 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100">
            {open ? 'Hide' : 'Show'}
          </span>
        </button>
      </div>
      {open && (
        <>
          <WalletDetailCard />
          <Section title="Current mission">
            <MissionMoney />
          </Section>
          <Section title="Research papers">
            <Research />
          </Section>
          <Section title="News">
            <News />
          </Section>
        </>
      )}
    </aside>
  )
}
