import { useGameStore } from '../../state/gameStore'
import { useWorldStore } from '../../state/worldStore'
import { missionFunding } from '../../game/economy'
import { lunarPapers, paperProgress } from '../../game/research'
import type { FeedItem, MissionPhase } from '../../game/world'
import { difficultyPresets } from '../../data/brief'

/*
 * The agency layer on the base screen: money and popularity in the top bar,
 * and a dashboard on the left with the mission's money, research and news.
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
  const chip = 'flex items-baseline gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1'
  return (
    <div className="flex items-center gap-2" aria-label="Agency">
      <div className={chip} title="Agency money. Government funding comes in all the time; research papers earn more.">
        <span className="text-[10px] font-semibold tracking-wider text-slate-300">FUNDS</span>
        <span className="font-display text-lg font-bold tabular-nums">{money(funds)}</span>
      </div>
      <div className={chip} title="Public support. More support means more daily funding and a bigger government share of each mission.">
        <span className="text-[10px] font-semibold tracking-wider text-slate-300">POPULARITY</span>
        <span className="font-display text-lg font-bold tabular-nums">{Math.round(popularity)}%</span>
      </div>
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

function MissionMoney() {
  const mission = useWorldStore((s) => s.mission)
  const popularity = useWorldStore((s) => s.popularity)
  const difficulty = useGameStore((s) => s.difficulty)
  const flying = useGameStore((s) => !!s.simState)
  const budget = difficultyPresets[difficulty].budgetCap

  // Planning: what the government would pay if the mission launched today
  if (!mission || !flying) {
    const f = missionFunding(budget, popularity)
    return (
      <>
        <p className="mb-1 text-xs text-slate-600">Planning. When you launch, the government pays its share and the agency pays the rest.</p>
        <Row label="Mission budget" value={money(budget)} />
        <Row label={`Government (${Math.round(f.share * 100)}%)`} value={money(f.grant)} />
        <Row label="Agency pays" value={money(f.agencyPays)} strong />
      </>
    )
  }

  const last = mission.last
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-sm font-bold text-slate-900">{mission.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            last.ended ? (last.outcome === 'failed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700') : 'bg-orange-100 text-orange-700'
          }`}
        >
          {phaseName[last.phase]}
        </span>
      </div>
      <Row label="Budget" value={money(mission.budget)} />
      <Row label="Government paid" value={money(mission.grant)} />
      <Row label="Agency paid" value={money(mission.agencyPaid)} />
      {last.launched && <Row label="Ice mapped" value={`${last.coverage.toFixed(0)}%`} strong />}
      {last.launched && <Row label="Data home" value={`${Math.round(last.dataMb)} MB`} />}
      {last.ended && <Row label="Budget returned" value={money(last.leftover)} />}
    </>
  )
}

function Research() {
  const r = useWorldStore((s) => s.research)
  const backlog = Math.max(0, r.received - r.processed)
  return (
    <ul className="space-y-1">
      {lunarPapers.map((spec) => {
        const paper = r.papers.find((p) => p.id === spec.id)
        const done = paper?.publishedDay != null
        const pct = paper && !done ? Math.round(paperProgress(r, paper) * 100) : 0
        return (
          <li key={spec.id} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className={done ? 'text-slate-800' : 'text-slate-500'}>
                {done ? '✓ ' : ''}
                {spec.title}
              </span>
              <span className="shrink-0 tabular-nums text-slate-500">+{money(spec.money)}</span>
            </div>
            {paper && !done && (
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            )}
          </li>
        )
      })}
      {backlog > 0 && <li className="text-[11px] text-slate-500">Lab is processing {Math.round(backlog)} MB of data</li>}
    </ul>
  )
}

function News() {
  const all = useWorldStore((s) => s.feed)
  // Routine news (the monthly downlink) stays out: the mission log already shows the flight month by month
  const feed = all.filter((e) => !e.quiet)
  if (feed.length === 0) return <p className="text-xs text-slate-500">No news yet.</p>
  return (
    <ul className="space-y-1.5">
      {feed.slice(0, 30).map((e, i) => (
        <li key={e.id} className={`flex gap-2 rounded-lg p-1 ${i === 0 ? 'bg-orange-50' : ''}`}>
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneDot[e.tone]}`} />
          <div className="min-w-0 text-xs">
            <div className="text-slate-800">{e.title}</div>
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
        </li>
      ))}
    </ul>
  )
}

export function AgencyDashboard() {
  return (
    <aside
      aria-label="Agency dashboard"
      className="flex max-h-[50vh] min-h-0 flex-col gap-2 overflow-y-auto rounded-2xl bg-[#fbf7ef] p-3 text-slate-800 shadow-xl lg:max-h-none lg:bg-[#fbf7ef]/95 lg:backdrop-blur"
    >
      <h2 className="font-display text-lg font-bold">Agency</h2>
      <Section title="Current mission">
        <MissionMoney />
      </Section>
      <Section title="Research papers">
        <Research />
      </Section>
      <Section title="News">
        <News />
      </Section>
    </aside>
  )
}
