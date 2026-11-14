/**
 * The agency world: one clock (days), one wallet, popularity, an activity
 * feed, research and the real mission's bookkeeping.
 *
 * Pure functions only. The mission itself runs in the mission model
 * (src/sim); this file only sees snapshots of it (MissionSnapshot), so the
 * two sides can change independently. src/game/missionLink.ts makes the
 * snapshots.
 */
import {
  clampFunds,
  clampPopularity,
  driftPopularity,
  fundingPerDay,
  missionFunding,
  popularityEffects,
} from './economy'
import { emptyResearch, processResearch, receiveData, type ResearchState } from './research'
import {
  DEMO_START_DAY,
  DEMO_START_FUNDS,
  DEMO_START_POPULARITY,
  scriptedEvents,
  seedHistory,
} from '../data/agency'

/** One mission turn is one month of agency time */
export const DAYS_PER_TURN = 30

export type Tone = 'info' | 'good' | 'warning' | 'bad'

export interface FeedItem {
  id: string
  day: number
  title: string
  detail?: string
  tone: Tone
  money?: number // $M change it caused
  popularity?: number // points it caused
  /** Routine news: kept in the log, never shown as a pop-up */
  quiet?: boolean
}

export type MissionPhase = 'build' | 'test' | 'wait' | 'transfer' | 'capture' | 'orbit' | 'complete' | 'failed'

/** What the agency needs to know about the real mission after each turn */
export interface MissionSnapshot {
  seed: number
  turn: number
  phase: MissionPhase
  launched: boolean
  launchTurn: number // turn the ride leaves (moves if a ride is missed)
  captured: boolean
  coverage: number // % of the ice map whose data is home
  dataMb: number // science data home
  ended: boolean
  outcome: 'success' | 'partial' | 'failed' | null
  leftover: number // $M of the mission budget not spent
  decisionTitle: string | null // event card waiting for the player
}

export interface AgencyMission {
  seed: number
  name: string
  approvedDay: number
  budget: number // $M
  grant: number // $M paid by the government
  agencyPaid: number // $M paid by the agency
  last: MissionSnapshot
  settled: boolean
}

export interface HistoryPoint {
  day: number
  funds: number
  popularity: number
}

export interface World {
  day: number // continuous
  funds: number // $M
  popularity: number // %
  history: HistoryPoint[]
  feed: FeedItem[]
  mission: AgencyMission | null
  research: ResearchState
}

const round2 = (x: number) => Math.round(x * 100) / 100

function addFeed(world: World, item: Omit<FeedItem, 'id'>): World {
  const id = `${Math.floor(item.day)}-${world.feed.length}-${item.title}`
  return { ...world, feed: [{ ...item, id }, ...world.feed].slice(0, 200) }
}

export function initialWorld(): World {
  const feed: FeedItem[] = scriptedEvents
    .filter((e) => e.day <= DEMO_START_DAY)
    .sort((a, b) => b.day - a.day)
    .map((e) => ({ id: `s-${e.id}`, day: e.day, title: e.title, detail: e.detail, tone: e.tone }))
  return {
    day: DEMO_START_DAY,
    funds: DEMO_START_FUNDS,
    popularity: DEMO_START_POPULARITY,
    history: seedHistory(),
    feed,
    mission: null,
    research: emptyResearch(),
  }
}

/* ------------------------------------------------------------------ */
/* Time passing                                                        */
/* ------------------------------------------------------------------ */

/**
 * Let time pass up to `toDay`: daily funding, popularity drift, scripted
 * events and research. Does not touch the mission (see missionTurned).
 * `notable` is true if something worth stopping a skip happened.
 */
export function advanceDays(world: World, toDay: number): { world: World; notable: boolean } {
  let w = world
  let notable = false
  while (w.day < toDay) {
    const nextBoundary = Math.floor(w.day) + 1
    const step = Math.min(toDay, nextBoundary)
    const dt = step - w.day
    w = {
      ...w,
      day: step,
      funds: w.funds + fundingPerDay(w.popularity) * dt,
      popularity: driftPopularity(w.popularity, dt),
    }
    if (step !== nextBoundary) break

    // A new day starts
    const today = nextBoundary
    for (const e of scriptedEvents) {
      if (e.day === today) {
        w = addFeed(w, { day: today, title: e.title, detail: e.detail, tone: e.tone })
        notable = true
      }
    }

    const { state: research, published } = processResearch(w.research, 1, today)
    w = { ...w, research }
    for (const paper of published) {
      w = {
        ...w,
        funds: w.funds + paper.money,
        popularity: clampPopularity(w.popularity + paper.popularity),
      }
      w = addFeed(w, {
        day: today,
        title: 'Paper published',
        detail: paper.title,
        tone: 'good',
        money: paper.money,
        popularity: paper.popularity,
      })
      notable = true
    }

    w = { ...w, history: [...w.history, { day: today, funds: round2(w.funds), popularity: round2(w.popularity) }].slice(-500) }
  }
  return { world: w, notable }
}

/* ------------------------------------------------------------------ */
/* The real mission                                                    */
/* ------------------------------------------------------------------ */

/** Day the mission's next turn falls on */
export function nextMissionTurnDay(mission: AgencyMission): number {
  return mission.approvedDay + (mission.last.turn + 1) * DAYS_PER_TURN
}

/** Day of the mission's ride */
export function missionLaunchDay(mission: AgencyMission): number {
  return mission.approvedDay + mission.last.launchTurn * DAYS_PER_TURN
}

/** Is the mission still flying and not waiting for the player? */
export function missionCanStep(mission: AgencyMission | null): mission is AgencyMission {
  return !!mission && !mission.last.ended && !mission.last.decisionTitle
}

/** The player approved a mission (Go): split the budget and pay the agency's share */
export function approveMission(
  world: World,
  args: { name: string; budget: number; snapshot: MissionSnapshot }
): World {
  const { grant, agencyPays } = missionFunding(args.budget, world.popularity)
  const day = Math.floor(world.day)
  const replaced = !!world.mission && !world.mission.last.ended
  const shortBy = agencyPays - world.funds
  let w: World = {
    ...world,
    funds: clampFunds(world.funds - agencyPays),
    mission: {
      seed: args.snapshot.seed,
      name: args.name,
      approvedDay: day,
      budget: args.budget,
      grant,
      agencyPaid: agencyPays,
      last: args.snapshot,
      settled: false,
    },
    research: emptyResearch(),
  }
  w = addFeed(w, {
    day,
    title: `${args.name} approved`,
    detail: `Government pays $${grant.toFixed(1)}M of the $${args.budget}M budget`,
    tone: 'info',
    money: -round2(agencyPays),
  })
  if (replaced) {
    w = addFeed(w, {
      day,
      title: 'Previous flight replaced',
      detail: 'A new plan was launched while the old one still flew',
      tone: 'warning',
    })
  }
  if (shortBy > 0.05) {
    w = addFeed(w, {
      day,
      title: 'Approved without enough money',
      detail: `$${shortBy.toFixed(1)}M short: the agency is at zero`,
      tone: 'warning',
    })
  }
  return w
}

const phaseNews: Partial<Record<MissionPhase, { title: string; detail: string; tone: Tone }>> = {
  test: { title: 'Testing started', detail: 'Vibration and thermal-vacuum tests', tone: 'info' },
  wait: { title: 'Spacecraft ready', detail: 'Waiting at the launch site for the ride', tone: 'good' },
  orbit: { title: 'Captured into lunar orbit', detail: 'The science phase begins', tone: 'good' },
}

/**
 * The mission model moved (one or more turns, or an event card was answered).
 * Turns the change into feed items, research, popularity and, at the end,
 * the settlement. `pause` asks the clock to stop (decision or mission over).
 */
export function missionTurned(world: World, now: MissionSnapshot): { world: World; notable: boolean; pause: boolean } {
  const mission = world.mission
  if (!mission || mission.seed !== now.seed) return { world, notable: false, pause: false }
  const before = mission.last
  const day = Math.floor(world.day)
  const name = mission.name
  let w = world
  let notable = false
  let pause = false

  if (now.phase !== before.phase && phaseNews[now.phase]) {
    const news = phaseNews[now.phase]!
    w = addFeed(w, { day, title: `${name}: ${news.title}`, detail: news.detail, tone: news.tone })
    notable = true
  }

  if (now.launchTurn > before.launchTurn && !now.launched) {
    w = addFeed(w, {
      day,
      title: `${name} missed the ride`,
      detail: `Next ride on mission turn ${now.launchTurn}`,
      tone: 'warning',
    })
    notable = true
  }

  if (now.launched && !before.launched) {
    w = {
      ...w,
      popularity: clampPopularity(w.popularity + popularityEffects.launch),
    }
    w = addFeed(w, {
      day,
      title: `${name} launched`,
      detail: 'Deployed from the rideshare, heading for the Moon',
      tone: 'good',
      popularity: popularityEffects.launch,
    })
    notable = true
  }

  if (now.dataMb > before.dataMb) {
    const mb = now.dataMb - before.dataMb
    w = addFeed(w, {
      day,
      title: `${Math.round(mb)} MB of science data home`,
      detail: `Ice map ${now.coverage.toFixed(0)}% complete`,
      tone: 'info',
      quiet: true,
    })
    w = { ...w, research: receiveData(w.research, now.dataMb, now.coverage, day) }
  }

  if (now.decisionTitle && now.decisionTitle !== before.decisionTitle) {
    w = addFeed(w, {
      day,
      title: `Decision needed: ${now.decisionTitle}`,
      detail: 'Open the Communications Center',
      tone: 'warning',
    })
    notable = true
    pause = true
  }

  let settled = mission.settled
  if (now.ended && !mission.settled) {
    const effect =
      now.outcome === 'success'
        ? popularityEffects.missionSuccess
        : now.outcome === 'partial'
          ? popularityEffects.missionPartial
          : popularityEffects.missionFailed
    const refund = Math.max(0, now.leftover)
    w = {
      ...w,
      funds: w.funds + refund,
      popularity: clampPopularity(w.popularity + effect),
    }
    w = addFeed(w, {
      day,
      title:
        now.outcome === 'success'
          ? `${name}: full success`
          : now.outcome === 'partial'
            ? `${name}: partial success`
            : `${name}: mission lost`,
      detail: refund > 0 ? `Unspent budget returned` : undefined,
      tone: now.outcome === 'failed' ? 'bad' : 'good',
      money: refund > 0 ? round2(refund) : undefined,
      popularity: effect,
    })
    settled = true
    notable = true
    pause = true
  }

  w = { ...w, mission: { ...mission, last: now, settled } }
  return { world: w, notable, pause }
}
