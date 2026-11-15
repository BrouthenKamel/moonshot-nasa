import type { CheckResult, DesignStep, GoNoGoResult } from '../../sim/types'
import { POLL_ORDER, stations, type Role } from '../../viz/gonogo/stations'
import type { RoomId } from '../../world/rooms/ids'
import type { Insight, MinigameResult } from '../contract'

/**
 * Launch Director (Mission Control, WP-3A). Pure: every console status comes from goNoGo()
 * (src/sim/checks) through the poll grouping in viz/gonogo/stations. Nothing here decides
 * whether a check is GO or NO-GO; it only words it honestly and drives the countdown.
 */

export type ConsoleStatus = 'green' | 'yellow' | 'red'

/** The room where a check is fixed (the classic design step it points at, mapped to the campus) */
export const FIX_ROOM: Record<DesignStep, RoomId> = {
  brief: 'briefing',
  // The only 'planning' check is Time: "test less" is a Thermal-Vac decision (testTurns)
  planning: 'thermal-vac',
  instruments: 'science-lab',
  spacecraft: 'clean-room',
  orbit: 'flight-dynamics',
  comms: 'ground-station',
  rocket: 'launch-hangar',
  ride: 'launch-hangar',
  'go-nogo': 'mission-control',
}

export interface ConsoleLine {
  check: CheckResult
  /** Short, honest, numeric: "Power: 20 W over the limit" */
  headline: string
  /** Where it is fixed, if it is not green */
  fixRoom: RoomId | null
}

export interface ConsoleState {
  role: Role
  title: string
  status: ConsoleStatus
  /** What the console says when polled: GO, GO WITH CAUTION or NO-GO */
  call: string
  /** Its checks, worst first */
  lines: ConsoleLine[]
  /** The room that fixes this console's worst problem, if any */
  fixRoom: RoomId | null
}

const RANK: Record<ConsoleStatus, number> = { red: 0, yellow: 1, green: 2 }

function fmt(n: number): string {
  const a = Math.abs(n)
  return a >= 10 || Number.isInteger(a) ? a.toFixed(0) : a.toFixed(1)
}

function unitText(unit: string, n: number): string {
  if (unit === 'month') return Math.abs(n) === 1 ? 'month' : 'months'
  if (unit === '$M') return 'M'
  return unit
}

/**
 * One line per check, in its real numbers. The old poll called every CAUTION row
 * "GO, little to spare" even when Power ran 20 W over its limit: this says which it is.
 */
export function headline(c: CheckResult): string {
  if (c.status === 'green') return `${c.resource}: OK`
  // Science counts up toward a target (its margin is coverage minus target)
  if (c.resource === 'Science') {
    return c.margin < 0 ? `Science: ${fmt(c.value)}% of the ${fmt(c.limit)}% ice target` : 'Science: short of the data target'
  }
  if (c.resource === 'Comms' && c.value === c.limit) {
    // The Comms check has no real limit number: it is the reason that matters
    return c.status === 'red' ? 'Comms: no link home' : 'Comms: the radio cannot use the whole pass'
  }
  const over = c.value - c.limit
  if (over > 0) return `${c.resource}: ${fmt(over)} ${unitText(c.unit, over)} over the limit`
  // Budget's limit is the whole budget; red under it means the reserve leaves too little to spend
  if (c.status === 'red' && c.resource === 'Budget') return 'Budget: more than you can spend'
  if (c.status === 'red') return `${c.resource}: blocked`
  return `${c.resource}: only ${fmt(-over)} ${unitText(c.unit, -over)} to spare`
}

function callFor(status: ConsoleStatus, lines: ConsoleLine[]): string {
  if (status === 'red') return 'NO-GO'
  if (status === 'green') return 'GO'
  const cautions = lines.filter((l) => l.check.status === 'yellow')
  // Over a limit is not "a little to spare": say so (the sim still counts it as go)
  if (cautions.some((l) => l.headline.includes('over the limit'))) return 'GO, OVER A LIMIT'
  if (cautions.some((l) => l.check.resource === 'Science')) return 'GO, BELOW TARGET'
  return 'GO WITH CAUTION'
}

/** The four consoles, in poll order, straight from the Go / No-Go result */
export function consoleStates(result: GoNoGoResult): ConsoleState[] {
  return stations(result.checks).map((s) => {
    const lines = s.checks
      .map((check) => ({
        check,
        headline: headline(check),
        fixRoom: check.status !== 'green' && check.fixStep ? FIX_ROOM[check.fixStep] : null,
      }))
      .sort((a, b) => RANK[a.check.status] - RANK[b.check.status])
    return {
      role: s.role,
      title: s.title,
      status: s.status,
      call: callFor(s.status, lines),
      lines,
      fixRoom: lines.find((l) => l.fixRoom)?.fixRoom ?? null,
    }
  })
}

export { POLL_ORDER }

/* ---------------- weather and range ---------------- */

export type HoldKind = 'wind' | 'range'

export interface HoldEvent {
  kind: HoldKind
  /** What the big screen shows, e.g. gust 33 kn vs limit 30 kn */
  value: number
  limit: number
  unit: string
  /** Chance that pressing on ends in an automatic scrub at T-3 */
  scrubChance: number
  /** One sentence for the caption */
  text: string
}

/** Ground-wind limit for a small launcher at the pad, knots (order of magnitude of real vehicles) */
export const WIND_LIMIT_KN = 30
/** Share of countdowns that meet a hold at all */
export const HOLD_CHANCE = 0.7
/** Days a scrub at T-3 costs: recycle the propellant load and wait for the next window */
export const SCRUB_DAYS = 2
/** Days a hold costs */
export const HOLD_DAYS = 1

/** A deterministic random source in [0, 1) (mulberry32), so tests and replays agree */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Roll today's weather and range: null for a clean count, else the hold the director must call */
export function rollHold(rand: () => number): HoldEvent | null {
  if (rand() >= HOLD_CHANCE) return null
  if (rand() < 0.65) {
    // Gusts forecast between 26 and 38 kn; the closer to (and past) the limit, the likelier a scrub
    const gust = Math.round(26 + rand() * 12)
    const scrubChance = clamp((gust - (WIND_LIMIT_KN - 6)) / 14, 0.1, 0.85)
    return {
      kind: 'wind',
      value: gust,
      limit: WIND_LIMIT_KN,
      unit: 'kn',
      scrubChance,
      text: `Gusts to ${gust} kn at the pad; the limit is ${WIND_LIMIT_KN} kn.`,
    }
  }
  // A boat inside the range safety zone, some distance from the line it must clear
  const km = Math.round(2 + rand() * 6)
  return {
    kind: 'range',
    value: km,
    limit: 0,
    unit: 'km',
    scrubChance: clamp(0.15 + km * 0.07, 0.2, 0.6),
    text: `A boat is ${km} km inside the range safety zone and heading out.`,
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

export type HoldChoice = 'hold' | 'proceed'

/** What the choice costs: hold is a sure day; proceed is free unless the roll scrubs it at T-3 */
export function resolveHold(ev: HoldEvent, choice: HoldChoice, roll: number): { days: number; scrubAtT3: boolean } {
  if (choice === 'hold') return { days: HOLD_DAYS, scrubAtT3: false }
  const scrub = roll < ev.scrubChance
  return { days: scrub ? SCRUB_DAYS : 0, scrubAtT3: scrub }
}

/* ---------------- hold-to-launch countdown ---------------- */

export const COUNT_FROM_S = 10
/** The gust or the boat trips the automatic sequencer here */
export const AUTO_SCRUB_AT_S = 3

export type CountPhase = 'armed' | 'counting' | 'scrubbed' | 'liftoff'

export interface Countdown {
  phase: CountPhase
  /** Seconds left, COUNT_FROM_S down to 0 */
  t: number
  /** Times the player let go (scrubbed) */
  scrubs: number
  /** The automatic sequencer will stop the count at T-3 (pressed on into bad weather and lost the roll) */
  autoScrub: boolean
  /** Why the last scrub happened */
  reason: 'released' | 'weather' | null
}

export function newCountdown(autoScrub = false): Countdown {
  return { phase: 'armed', t: COUNT_FROM_S, scrubs: 0, autoScrub, reason: null }
}

/**
 * Advance the count. Holding the LAUNCH key starts it and keeps it going; letting go before T-0
 * scrubs. A scrub waits for the key to be let go and pressed again, then the count recycles to T-10.
 */
export function tickCountdown(c: Countdown, dtS: number, holding: boolean): Countdown {
  if (c.phase === 'liftoff') return c
  if (c.phase === 'armed' || c.phase === 'scrubbed') {
    if (!holding) return c.phase === 'scrubbed' ? { ...c, phase: 'armed' } : c
    // A fresh press after a let-go: count from T-10
    if (c.phase === 'scrubbed') return c
    return { ...c, phase: 'counting', t: COUNT_FROM_S, reason: null }
  }
  // counting
  if (!holding) return { ...c, phase: 'scrubbed', t: COUNT_FROM_S, scrubs: c.scrubs + 1, reason: 'released' }
  const t = Math.max(0, c.t - dtS)
  if (c.autoScrub && t <= AUTO_SCRUB_AT_S) {
    // The sequencer stops it once; after the recycle the weather has cleared
    return { ...c, phase: 'scrubbed', t: COUNT_FROM_S, autoScrub: false, reason: 'weather' }
  }
  if (t <= 0) return { ...c, phase: 'liftoff', t: 0 }
  return { ...c, t }
}

/* ---------------- result ---------------- */

export interface LaunchLog {
  consoles: ConsoleState[]
  hold: HoldEvent | null
  choice: HoldChoice | null
  /** Days the launch slipped for weather and range */
  daysLost: number
  scrubs: number
  durationS: number
}

/** What Mission Control hands the debrief: the slip, and the closest call on the board at launch */
export function buildResult(log: LaunchLog): MinigameResult {
  const insights: Insight[] = []
  const slip = log.daysLost
  insights.push({
    id: 'launch-slip',
    room: 'mission-control',
    text: log.hold
      ? log.choice === 'hold'
        ? `You held the count for the ${log.hold.kind === 'wind' ? 'wind' : 'range'} and launched ${slip} day${slip === 1 ? '' : 's'} late.`
        : slip > 0
          ? `You pressed on into the ${log.hold.kind === 'wind' ? 'wind' : 'range hold'}, the sequencer scrubbed at T-3, and you launched ${slip} days late.`
          : `You pressed on into the ${log.hold.kind === 'wind' ? 'wind' : 'range hold'} and it held: launched on time.`
      : 'Clean weather and a clear range: launched on the first day.',
    metric: { label: 'Launch slip', value: slip, unit: 'days' },
  })
  // The closest call: the worst non-green line on the board when you launched
  const lines = log.consoles.flatMap((c) => c.lines).filter((l) => l.check.status === 'yellow')
  const worst = lines.sort((a, b) => a.check.margin / (Math.abs(a.check.limit) || 1) - b.check.margin / (Math.abs(b.check.limit) || 1))[0]
  if (worst) {
    const c = worst.check
    insights.push({
      id: 'launch-caution',
      room: 'mission-control',
      text: `You launched with ${c.resource} on caution (${worst.headline.replace(`${c.resource}: `, '')}).`,
      metric: { label: `${c.resource} margin at launch`, value: Math.round(c.margin * 10) / 10, unit: c.unit },
    })
  }
  return { patch: {}, insights, durationS: Math.round(log.durationS) }
}
