/**
 * How campaign missions move the agency's money and popularity (PROTOTYPE). Pure functions on the
 * agency World (src/game/world.ts), so the campaign uses the same wallet, clock and news feed as
 * mission 1. Same rules as the agency: the government pays a share of each budget that grows with
 * popularity, the agency pays the rest at Go, and a failed mission burns its whole budget.
 * New here: a milestone award on success (a game value, like the milestone payments of NASA's
 * commercial programmes), full the first time, smaller on a repeat flight, half for a partial.
 */
import { clampFunds, clampPopularity, missionFunding, popularityEffects } from '../game/economy'
import { advanceDays, DAYS_PER_TURN, type FeedItem, type World } from '../game/world'
import type { CampaignFlight } from './flight'
import type { CampaignMission, MissionPlan } from './missions'
import type { Outcome } from './scenes/types'

export interface LedgerRow {
  label: string
  amount: number
}

export interface CampaignResult {
  missionId: CampaignMission['id']
  name: string
  outcome: Outcome
  science: number
  money: LedgerRow[]
  moneyNet: number
  popularity: LedgerRow[]
  popularityNet: number
}

function addFeed(world: World, item: Omit<FeedItem, 'id'>): World {
  const id = `c-${Math.floor(item.day)}-${world.feed.length}-${item.title}`
  return { ...world, feed: [{ ...item, id }, ...world.feed].slice(0, 200) }
}

/** What the agency pays at Go for a plan, at today's popularity */
export function agencyShare(plan: MissionPlan, popularity: number): number {
  return missionFunding(plan.budget, popularity).agencyPays
}

export function canAfford(world: Pick<World, 'funds' | 'popularity'>, plan: MissionPlan): boolean {
  return world.funds + 1e-9 >= agencyShare(plan, world.popularity)
}

/** Go: the government pays its share, the agency the rest */
export function approveCampaignMission(world: World, mission: CampaignMission, plan: MissionPlan): { world: World; paid: number } {
  const { grant, agencyPays } = missionFunding(plan.budget, world.popularity)
  const day = Math.floor(world.day)
  let w: World = { ...world, funds: clampFunds(world.funds - agencyPays) }
  w = addFeed(w, {
    day,
    title: `${mission.name} approved`,
    detail: `Government pays $${grant.toFixed(1)}M of the $${plan.budget}M budget`,
    tone: 'info',
    money: -Math.round(agencyPays * 100) / 100,
  })
  return { world: w, paid: agencyPays }
}

export function awardFor(mission: CampaignMission, outcome: Outcome, first: boolean): number {
  const full = first ? mission.award.first : mission.award.repeat
  return outcome === 'success' ? full : outcome === 'partial' ? full / 2 : 0
}

export function popularityFor(mission: CampaignMission, outcome: Outcome, plan: MissionPlan, first: boolean): number {
  const base = mission.popularity[outcome]
  // A repeat success is smaller news than the first
  const scaled = outcome === 'failed' ? base : first ? base : Math.round(base / 2)
  // The design's extra news value counts half: the result itself is the headline
  return scaled + (outcome === 'success' ? Math.round(plan.hype / 2) : 0)
}

/**
 * The flight is over: time passes (the mission's months, with daily funding and popularity
 * drift), then the launch, the result and the award land in the wallet and the feed.
 */
export function settleCampaignFlight(
  world: World,
  mission: CampaignMission,
  flight: CampaignFlight,
  paid: number,
  first: boolean
): { world: World; result: CampaignResult } {
  let w = advanceDays(world, world.day + mission.months * DAYS_PER_TURN).world
  const day = Math.floor(w.day)
  const launched = flight.failedAt !== 'launch'
  const award = awardFor(mission, flight.outcome, first)
  const pop = popularityFor(mission, flight.outcome, flight.plan, first)
  const launchPop = launched ? popularityEffects.launch : 0

  w = { ...w, funds: clampFunds(w.funds + award), popularity: clampPopularity(w.popularity + launchPop + pop) }
  const title =
    flight.outcome === 'success' ? `${mission.name}: full success` : flight.outcome === 'partial' ? `${mission.name}: partial success` : `${mission.name}: mission failed`
  w = addFeed(w, {
    day,
    title,
    detail: flight.beats[flight.beats.length - 1]?.line,
    tone: flight.outcome === 'failed' ? 'bad' : 'good',
    money: award > 0 ? award : undefined,
    popularity: launchPop + pop,
  })

  const money: LedgerRow[] = [
    { label: 'Your share at Go', amount: -paid },
    flight.outcome === 'failed'
      ? { label: 'Failed: whole budget spent', amount: 0 }
      : { label: first && flight.outcome === 'success' ? 'Milestone award' : 'Mission award', amount: award },
  ]
  const popularity: LedgerRow[] = [
    ...(launched ? [{ label: 'Launch', amount: launchPop }] : []),
    { label: flight.outcome === 'success' ? 'Full success' : flight.outcome === 'partial' ? 'Partial success' : 'Mission failed', amount: pop },
  ]
  return {
    world: w,
    result: {
      missionId: mission.id,
      name: mission.name,
      outcome: flight.outcome,
      science: flight.science,
      money,
      moneyNet: money.reduce((s, r) => s + r.amount, 0),
      popularity,
      popularityNet: popularity.reduce((s, r) => s + r.amount, 0),
    },
  }
}

/** Mission 1 settled through main's rules; the campaign adds its milestone award on top */
export function awardIceMapper(world: World, mission: CampaignMission, outcome: Outcome, first: boolean): World {
  const award = awardFor(mission, outcome, first)
  if (award <= 0) return world
  const w = { ...world, funds: world.funds + award }
  return addFeed(w, {
    day: Math.floor(world.day),
    title: first && outcome === 'success' ? 'Campaign milestone: ice map delivered' : 'Ice map data bought by partners',
    detail: 'The Moon landing team can now pick a site',
    tone: 'good',
    money: award,
  })
}
