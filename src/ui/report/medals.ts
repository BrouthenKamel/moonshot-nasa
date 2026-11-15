import type { Report } from '../../sim/types'

/** How a medal is stamped on the report: ice medals are the one place cyan shows */
export type MedalTone = 'go' | 'ice' | 'selected'

export interface Medal {
  id: string
  name: string
  /** What earns it, in plain words */
  how: string
  tone: MedalTone
  earned: boolean
}

/** The medal for each brief requirement, keyed by the requirement id from evaluate.ts */
const REQUIREMENT_MEDALS: { req: string; id: string; name: string; how: string; tone: MedalTone }[] = [
  { req: 'capture', id: 'reached-orbit', name: 'Reached orbit', how: 'Captured into the science orbit', tone: 'go' },
  { req: 'coverage', id: 'ice-map', name: 'Ice map', how: 'Mapped enough of the south pole to find the ice', tone: 'ice' },
  { req: 'data', id: 'every-byte-home', name: 'Every byte home', how: 'Brought the science data target home', tone: 'go' },
  { req: 'lifetime', id: 'full-year', name: 'Full year', how: 'Stayed in the science orbit for the whole mission', tone: 'go' },
  { req: 'budget', id: 'reserve-intact', name: 'Reserve intact', how: 'Never overdrew the money held back', tone: 'go' },
]

/** Ice hunter: this share of the south polar region mapped, or more */
export const ICE_HUNTER_COVERAGE = 90
/** Under budget: money points are proportional to money left (100 = the whole budget), so 10 = a tenth unspent */
export const UNDER_BUDGET_MONEY_POINTS = 10

/**
 * The medals of a finished mission. Pure: reads only the report, every medal is listed,
 * earned or not, in a fixed order (the brief's requirements first, then the bonus medals).
 */
export function medals(report: Report): Medal[] {
  const met = (id: string) => report.requirements.find((r) => r.id === id)?.met ?? false
  const list: Medal[] = REQUIREMENT_MEDALS.map((m) => ({ id: m.id, name: m.name, how: m.how, tone: m.tone, earned: met(m.req) }))
  list.push(
    {
      id: 'steady-hands',
      name: 'Steady hands',
      how: 'Every flight event that came up was handled well',
      tone: 'selected',
      earned: report.eventsEncountered > 0 && report.eventsHandledWell >= report.eventsEncountered,
    },
    {
      id: 'under-budget',
      name: 'Under budget',
      how: 'Finished with at least a tenth of the budget unspent',
      tone: 'selected',
      earned: report.outcome !== 'failed' && report.score.money >= UNDER_BUDGET_MONEY_POINTS,
    },
    {
      id: 'ice-hunter',
      name: 'Ice hunter',
      how: `Mapped ${ICE_HUNTER_COVERAGE}% or more of the south polar region`,
      tone: 'ice',
      earned: report.coverageAchieved >= ICE_HUNTER_COVERAGE,
    },
  )
  return list
}
