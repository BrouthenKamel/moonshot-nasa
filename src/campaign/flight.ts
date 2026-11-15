/**
 * The outcome model for campaign missions 2-4: far simpler than mission 1's
 * month-by-month flight. One seeded roll for the launch, one for the landing, and the science that
 * follows. Pure and deterministic for a seed. All probabilities are game values (missions.ts).
 */
import { SeededRNG } from '../sim/rng'
import { planOf, type CampaignMission, type MissionPlan, type Picks } from './missions'
import type { Outcome } from './scenes/types'

export type FlightPhase = 'launch' | 'cruise' | 'landing' | 'surface'

export interface FlightBeat {
  phase: FlightPhase
  ok: boolean
  line: string
}

export interface CampaignFlight {
  missionId: CampaignMission['id']
  seed: number
  outcome: Outcome
  /** Where it went wrong, if it did */
  failedAt: 'launch' | 'landing' | null
  beats: FlightBeat[]
  /** Science points earned (game value) */
  science: number
  plan: MissionPlan
}

/** Of the landings that are not clean, the share that still counts as a partial success */
export const PARTIAL_SHARE = 0.55

const LANDING_LINES: Record<CampaignMission['id'], Record<Outcome, string>> = {
  'ice-mapper': { success: '', partial: '', failed: '' },
  'moon-landing': {
    success: 'Touchdown upright. The payload is working.',
    partial: 'Landed on a slope and tipped over. Some data still comes home.',
    failed: 'Contact lost at touchdown.',
  },
  'moon-base': {
    success: 'The base is down, unfolded and powered.',
    partial: 'The base landed, but part of it would not deploy.',
    failed: 'The habitat failed to deploy. The base is lost.',
  },
  'mars-base': {
    success: 'Seven minutes of terror, then touchdown. The first module is alive.',
    partial: 'Landed safely, but far from the target site.',
    failed: 'The parachute failed. The base is lost.',
  },
}

const CRUISE_LINES: Record<CampaignMission['id'], string> = {
  'ice-mapper': '',
  'moon-landing': 'Four days to the Moon, then into lunar orbit.',
  'moon-base': 'The cargo lander coasts to the Moon.',
  'mars-base': 'Months in deep space on the way to Mars.',
}

export function flyMission(mission: CampaignMission, picks: Picks, seed: number): CampaignFlight {
  const plan = planOf(mission, picks)
  const rng = new SeededRNG(seed)
  const beats: FlightBeat[] = []

  const launchOk = rng.next() < mission.launchReliability
  beats.push({ phase: 'launch', ok: launchOk, line: launchOk ? `${mission.rocketName}: good ascent.` : 'The rocket was lost during ascent.' })
  if (!launchOk) return { missionId: mission.id, seed, outcome: 'failed', failedAt: 'launch', beats, science: 0, plan }

  beats.push({ phase: 'cruise', ok: true, line: CRUISE_LINES[mission.id] })

  const r = rng.next()
  const outcome: Outcome = r < plan.landing ? 'success' : r < plan.landing + (1 - plan.landing) * PARTIAL_SHARE ? 'partial' : 'failed'
  beats.push({ phase: 'landing', ok: outcome !== 'failed', line: LANDING_LINES[mission.id][outcome] })
  if (outcome !== 'failed') beats.push({ phase: 'surface', ok: true, line: outcome === 'success' ? 'Science under way.' : 'Working at reduced capacity.' })

  const science = Math.round(plan.science * (outcome === 'success' ? 1 : outcome === 'partial' ? 0.5 : 0))
  return { missionId: mission.id, seed, outcome, failedAt: outcome === 'failed' ? 'landing' : null, beats, science, plan }
}

/** Chances of each outcome for a plan (for the details toggle and tests) */
export function outcomeOdds(mission: CampaignMission, picks: Picks): Record<Outcome, number> {
  const { landing } = planOf(mission, picks)
  const l = mission.launchReliability
  const success = l * landing
  const partial = l * (1 - landing) * PARTIAL_SHARE
  return { success, partial, failed: 1 - success - partial }
}
