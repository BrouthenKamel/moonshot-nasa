import type { Difficulty } from '../data/brief'
import { turnConstants } from '../data/brief'
import type { EventType } from '../data/events'
import { buildReport } from './evaluate'
import { SeededRNG } from './rng'
import { runSimulation, runToEnd, stepTurn } from './simulate'
import type { Design, SimState, TurnAction } from './types'

/**
 * Honest odds (F2, Jakob 14 Nov): the chance of each mission outcome, counted
 * over many flights of the same design on standing orders (every event card
 * answered with its first option). The seeds are fixed, so the same design
 * always gives the same numbers, and results are cached by design.
 */

/** Flights per estimate. About 0.1-0.2 ms a flight in a browser: 200 flights stay well under the time of a frame burst. */
export const ODDS_RUNS = 200

/** Flights per answer when an event card quotes its odds (the card waits on this, so fewer) */
export const CARD_ODDS_RUNS = 100

export interface SuccessEstimate {
  success: number // 0-1 share of flights with every requirement met
  partial: number
  failed: number
  runs: number
}

/** The fixed seeds the estimates fly with */
export function oddsSeeds(n: number): number[] {
  const rng = new SeededRNG(0x5eed_0dd5)
  return Array.from({ length: n }, () => Math.floor(rng.next() * 0xffffffff) >>> 0)
}

/** JSON with the keys sorted, so two equal designs give the same cache key */
function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  )
}

const CACHE_MAX = 300
const cache = new Map<string, SuccessEstimate>()
const planningCache = new Map<string, PlanningOdds>()

export function clearOddsCache() {
  cache.clear()
  planningCache.clear()
}

function remember(key: string, value: SuccessEstimate) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, value)
}

function count(outcomes: ('success' | 'partial' | 'failed')[]): SuccessEstimate {
  const n = outcomes.length
  const share = (o: string) => (n ? outcomes.filter((x) => x === o).length / n : 0)
  return { success: share('success'), partial: share('partial'), failed: share('failed'), runs: n }
}

/** Cached estimate, or undefined if it has not been worked out yet (lets the UI stay responsive) */
export function cachedSuccess(design: Design, difficulty: Difficulty, n = ODDS_RUNS): SuccessEstimate | undefined {
  return cache.get(stableKey([design, difficulty, n]))
}

/** Chance of a full success, a partial one and a failure for this design. Deterministic. */
export function estimateSuccess(design: Design, difficulty: Difficulty, n = ODDS_RUNS): SuccessEstimate {
  const key = stableKey([design, difficulty, n])
  const hit = cache.get(key)
  if (hit) return hit
  const result = count(oddsSeeds(n).map((seed) => buildReport(runSimulation(design, difficulty, seed)).outcome))
  remember(key, result)
  return result
}

/** The reserve settings the planning fader offers */
export const RESERVE_STEPS = [0, 5, 10, 15, 20] as const

export interface PlanningOdds {
  current: number // chance of full success as planned
  test: Record<number, number> // by test turns
  reserve: Record<number, number> // by reserve percent
}

function withPlanning(design: Design, patch: Partial<Design['planning']>): Design {
  return { ...design, planning: { ...design.planning, ...patch } }
}

/** Chance of full success for every test-time and reserve setting, the rest of the design as it is */
export function planningOdds(design: Design, difficulty: Difficulty, n = ODDS_RUNS): PlanningOdds {
  // Same object for the same inputs, so screens that memoise on it do not repaint for nothing
  const key = stableKey([design, difficulty, n])
  const hit = planningCache.get(key)
  if (hit) return hit
  const test: Record<number, number> = {}
  for (let t = turnConstants.minTestTurns; t <= turnConstants.maxTestTurns; t++) {
    test[t] = estimateSuccess(withPlanning(design, { testTurns: t }), difficulty, n).success
  }
  const reserve: Record<number, number> = {}
  for (const r of [...RESERVE_STEPS, design.planning.reservePercent]) {
    reserve[r] = estimateSuccess(withPlanning(design, { reservePercent: r }), difficulty, n).success
  }
  const result = { current: estimateSuccess(design, difficulty, n).success, test, reserve }
  if (planningCache.size >= CACHE_MAX) planningCache.delete(planningCache.keys().next().value as string)
  planningCache.set(key, result)
  return result
}

/** Whether planningOdds would answer from the cache alone */
export function planningOddsCached(design: Design, difficulty: Difficulty, n = ODDS_RUNS): boolean {
  const designs = [
    design,
    ...Array.from({ length: turnConstants.maxTestTurns - turnConstants.minTestTurns + 1 }, (_, i) =>
      withPlanning(design, { testTurns: turnConstants.minTestTurns + i })
    ),
    ...RESERVE_STEPS.map((r) => withPlanning(design, { reservePercent: r })),
  ]
  return designs.every((d) => cachedSuccess(d, difficulty, n) !== undefined)
}

/**
 * Event cards whose answers roll no dice of their own in the turn they are
 * given. Only for these can the odds be quoted without giving away the
 * result: the turn is replayed with its real dice, and only the later turns
 * are flown with the estimate's seeds. (Emergency tracking and the thruster
 * fix roll for success right away; their cards already quote that chance.)
 */
const CARDS_WITHOUT_DICE: EventType[] = ['build-delay']

/**
 * For the event card waiting in `state`: each answer's chance of full
 * success, by option id. Empty for cards whose answers roll dice at once.
 */
export function estimateChoices(state: SimState, action: TurnAction, n = CARD_ODDS_RUNS): Record<string, number> {
  const decision = state.pendingDecision
  if (!decision || !CARDS_WITHOUT_DICE.includes(decision.key)) return {}
  const seeds = oddsSeeds(n)
  const out: Record<string, number> = {}
  for (const o of decision.options) {
    const answered: TurnAction = { ...action, choices: { ...action.choices, [decision.key]: o.id }, autoDecide: true }
    const next = stepTurn({ ...state, pendingDecision: undefined }, answered)
    out[o.id] = count(seeds.map((seed) => buildReport(runToEnd(next, seed, action)).outcome)).success
  }
  return out
}

export function percent(x: number): string {
  return `${Math.round(x * 100)}%`
}
