/**
 * Agency economy: money and popularity.
 *
 * - One wallet. Government funding comes in every day and scales with popularity.
 * - No daily spending: every cost of a mission (team, tests, ground station) is
 *   already inside that mission's own budget. So money only goes down when you
 *   decide to fund a mission, and the agency can never go bankrupt.
 * - When a mission is approved the government pays part of its budget; the
 *   share grows with popularity. The agency pays the rest up front, and gets
 *   back whatever the mission did not spend when it ends.
 * - Launches, publications and successes raise popularity; failures lower it.
 *   With nothing happening it drifts back toward 50.
 *
 * Every number here is a game-balance value. Money is in $M, popularity in %.
 */

export const economy = {
  /** Government funding per day at 50% popularity ($M). About $1M a month at 68%. */
  baseFundingPerDay: 0.03,

  /** Share of a mission budget the government pays, from 0% to 100% popularity */
  grantShareMin: 0.3,
  grantShareMax: 0.8,

  /** Popularity drifts toward this value when nothing happens */
  popularityRestingPoint: 50,
  /** Share of the gap to the resting point closed per day */
  popularityDriftPerDay: 0.0015,
}

/** Popularity changes in percentage points */
export const popularityEffects = {
  launch: 2,
  missionSuccess: 10,
  missionPartial: 3,
  missionFailed: -10,
  /** Not used by the Lunar Ice Mapper (no crew); kept for the crewed phases */
  crewLost: -25,
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export const clampPopularity = (p: number) => clamp(p, 0, 100)

/** Money never goes below zero: no bankruptcy */
export const clampFunds = (funds: number) => Math.max(0, funds)

/** Government funding per day: half the base at 0% popularity, 1.5x at 100% */
export function fundingPerDay(popularity: number): number {
  return economy.baseFundingPerDay * (0.5 + clampPopularity(popularity) / 100)
}

/** Share of a mission's budget the government pays */
export function grantShare(popularity: number): number {
  const p = clampPopularity(popularity) / 100
  return economy.grantShareMin + (economy.grantShareMax - economy.grantShareMin) * p
}

/** How a mission budget splits between the government and the agency */
export function missionFunding(missionBudget: number, popularity: number) {
  const share = grantShare(popularity)
  const grant = missionBudget * share
  return { share, grant, agencyPays: missionBudget - grant }
}

/** Popularity after `days` of drifting toward the resting point */
export function driftPopularity(popularity: number, days: number): number {
  const keep = Math.pow(1 - economy.popularityDriftPerDay, days)
  return economy.popularityRestingPoint + (popularity - economy.popularityRestingPoint) * keep
}
