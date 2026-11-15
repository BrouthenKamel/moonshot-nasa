/**
 * The "why" layer for campaign missions 2-4: where the chance of success comes from, which picks
 * were the biggest risks, and whether the agency can afford another try. Pure; the numbers are the
 * same game values the outcome model rolls against (missions.ts, flight.ts).
 */
import { missionFunding } from '../game/economy'
import { pickedOption, planOf, type CampaignMission, type Picks } from './missions'
import type { CampaignFlight } from './flight'

export interface ChancePart {
  choiceId: string
  /** "Engine" */
  short: string
  /** The picked option's name */
  option: string
  /** Percentage points this pick adds to (or takes from) the chance of success, rounded */
  points: number
}

/** Chance of success in percent, as the Go screen shows it */
export const chancePercent = (mission: CampaignMission, picks: Picks) => Math.round(planOf(mission, picks).success * 100)

/**
 * Each pick's share of the chance of success: the chance with the pick, minus the chance with a
 * neutral pick in its place (one that adds nothing). Includes the launch odds and the caps, so the
 * parts are what the player really gains or loses.
 */
export function chanceParts(mission: CampaignMission, picks: Picks): ChancePart[] {
  const withAll = planOf(mission, picks).success
  return mission.choices.map((c) => {
    const opt = pickedOption(c, picks)
    const neutral: CampaignMission = {
      ...mission,
      choices: mission.choices.map((x) => (x.id === c.id ? { ...x, options: x.options.map((o) => (o.id === opt.id ? { ...o, reliability: 0 } : o)) } : x)),
    }
    const without = planOf(neutral, picks).success
    return { choiceId: c.id, short: c.short, option: opt.name, points: Math.round((withAll - without) * 100) }
  })
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0')

/** "Engine −8 · Site −10 · Payload +3" for the Go screen */
export function chanceLine(mission: CampaignMission, picks: Picks): string {
  return chanceParts(mission, picks)
    .map((p) => `${p.short} ${signed(p.points)}`)
    .join(' · ')
}

/**
 * One sentence naming the biggest risks a flight took, with their real chance deltas:
 * "Cheap pressure-fed: −8 points of your chance; Shackleton crater rim: −10."
 */
export function riskSentence(mission: CampaignMission, flight: CampaignFlight, picks: Picks): string {
  if (flight.failedAt === 'launch')
    return `The rocket failed on the way up: a ${Math.round((1 - mission.launchReliability) * 100)}% risk that no design choice changes.`
  const risks = chanceParts(mission, picks)
    .filter((p) => p.points < 0)
    .sort((a, b) => a.points - b.points)
    .slice(0, 2)
  const chance = chancePercent(mission, picks)
  if (risks.length === 0)
    return flight.outcome === 'success'
      ? `No choice lowered your chance; you flew at ${chance}%.`
      : `No choice lowered your chance: at ${chance}%, a landing can still go wrong.`
  const named = risks.map((r) => `${r.option}: ${signed(r.points)} points of your chance`).join('; ')
  return `${flight.outcome === 'success' ? 'Risks you got away with' : 'Biggest risks'}: ${named}.`
}

export interface RetryCost {
  /** The agency's share for the same choices again, $M */
  same: number
  /** The agency's share with the cheapest choices, $M */
  cheapest: number
  canSame: boolean
  canCheapest: boolean
  text: string
}

const money = (m: number) => `$${m.toFixed(1)}M`

/** Can the agency afford to fly this mission again, with the same choices or the cheapest ones? */
export function retryCost(mission: CampaignMission, picks: Picks, funds: number, popularity: number): RetryCost {
  const share = (p: Picks) => missionFunding(planOf(mission, p).budget, popularity).agencyPays
  const cheapestPicks = Object.fromEntries(mission.choices.map((c) => [c.id, [...c.options].sort((a, b) => a.cost - b.cost)[0].id]))
  const same = share(picks)
  const cheapest = share(cheapestPicks)
  const canSame = funds + 1e-9 >= same
  const canCheapest = funds + 1e-9 >= cheapest
  const text = canSame
    ? `You can afford to try again: your share would be ${money(same)} of your ${money(funds)}.`
    : canCheapest
      ? `Not with the same choices (${money(same)}), but cheaper choices would cost ${money(cheapest)} of your ${money(funds)}.`
      : `You can't afford to try again yet: the cheapest try costs ${money(cheapest)}, you have ${money(funds)}.`
  return { same, cheapest, canSame, canCheapest, text }
}
