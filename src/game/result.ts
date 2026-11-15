/**
 * The agency's balance sheet for a finished mission: what it cost, what came back,
 * and how popularity moved. Pure: read from the world after the mission settled.
 */
import { popularityEffects } from './economy'
import type { World } from './world'
import { craftWasLost, endingSentence } from '../sim/evaluate'

export interface MissionResult {
  name: string
  outcome: 'success' | 'partial' | 'failed'
  coverage: number // % of the ice map with its data home
  dataMb: number
  launched: boolean
  /** Money, $M: negative is spent */
  money: { label: string; amount: number }[]
  moneyNet: number
  /** The mission budget and how much of it was left ($M): the same framing as the report's "Money left" */
  budget: number
  moneyLeft: number
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
  // A failed mission burns its whole budget (Jakob, 15 Nov): the same rule as game/world.ts
  const refund = outcome === 'failed' ? 0 : Math.max(0, m.last.leftover)

  const money = [
    { label: 'Your share at launch', amount: -m.agencyPaid },
    outcome === 'failed'
      ? { label: 'Failed: whole budget spent', amount: 0 }
      : { label: 'Unspent budget returned', amount: refund },
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
    budget: m.budget,
    moneyLeft: refund,
    popularity,
    popularityNet: popularity.reduce((s, r) => s + r.amount, 0),
    papers,
  }
}

/**
 * The mission-result dialog's line for a failed mission. It names the same end as the report's
 * verdict (endingSentence), and only says "the spacecraft was lost" when it was: a mission that
 * ran out of money in orbit still had a working craft (number truth, 15 Nov).
 */
export function failedLine(end: string, simFailed: boolean, coverage: number): string {
  if (simFailed)
    return craftWasLost(end)
      ? `${endingSentence(end)} The spacecraft was lost. The report shows what went wrong.`
      : `${endingSentence(end)} The spacecraft still worked, but the mission had to stop. The report shows what went wrong.`
  return coverage < 1
    ? 'The spacecraft flew, but mapped no ice. The report shows why.'
    : 'The spacecraft flew, but the ice map fell short. The report shows why.'
}
