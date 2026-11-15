/**
 * The agency's balance sheet for a finished mission: what it cost, what came back,
 * and how popularity moved. Pure: read from the world after the mission settled.
 */
import { popularityEffects } from './economy'
import type { World } from './world'

export interface MissionResult {
  name: string
  outcome: 'success' | 'partial' | 'failed'
  coverage: number // % of the ice map with its data home
  dataMb: number
  launched: boolean
  /** Money, $M: negative is spent */
  money: { label: string; amount: number }[]
  moneyNet: number
  /** Popularity, percentage points */
  popularity: { label: string; amount: number }[]
  popularityNet: number
  papers: { title: string; money: number; popularity: number }[]
}

export function missionResult(world: Pick<World, 'mission' | 'research'>): MissionResult | null {
  const m = world.mission
  if (!m || !m.settled || !m.last.ended) return null
  const outcome = m.last.outcome ?? 'failed'
  const papers = world.research.papers
    .filter((p) => p.publishedDay !== null)
    .map((p) => ({ title: p.title, money: p.money, popularity: p.popularity }))
  const paperMoney = papers.reduce((s, p) => s + p.money, 0)
  const paperPopularity = papers.reduce((s, p) => s + p.popularity, 0)
  const refund = Math.max(0, m.last.leftover)

  const money = [
    { label: 'Your share at launch', amount: -m.agencyPaid },
    { label: 'Unspent budget returned', amount: refund },
    ...(paperMoney > 0 ? [{ label: `Papers (${papers.length})`, amount: paperMoney }] : []),
  ]
  const resultEffect =
    outcome === 'success' ? popularityEffects.missionSuccess : outcome === 'partial' ? popularityEffects.missionPartial : popularityEffects.missionFailed
  const popularity = [
    ...(m.last.launched ? [{ label: 'Launch', amount: popularityEffects.launch }] : []),
    { label: outcome === 'success' ? 'Full success' : outcome === 'partial' ? 'Partial success' : 'Mission failed', amount: resultEffect },
    ...(paperPopularity > 0 ? [{ label: 'Papers', amount: paperPopularity }] : []),
  ]
  return {
    name: m.name,
    outcome,
    coverage: m.last.coverage,
    dataMb: m.last.dataMb,
    launched: m.last.launched,
    money,
    moneyNet: money.reduce((s, r) => s + r.amount, 0),
    popularity,
    popularityNet: popularity.reduce((s, r) => s + r.amount, 0),
    papers,
  }
}
