import { getPartById, type InstrumentPart } from '../../data/parts'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { COVERAGE_TARGET } from '../../sim/evaluate'
import type { Design } from '../../sim/types'

/**
 * Ice Mapper: one pass over the Moon's south pole. Real craters scroll past while the craft flies
 * on; you aim the scanner at each one and hold to scan before it is gone. Your design sets the
 * rules and nothing else does:
 *
 *  - the battery sets how long the pass lasts (a small one is the same pass at a faster pace)
 *  - the instrument sets how fast a crater fills, how wide the scanner reaches, and whether it can
 *    see into permanently shadowed craters, where most of the ice is
 *
 * Win by mapping the target share of the ice before the battery runs out. Pure and deterministic:
 * no drawing here, so every rule can be tested, and a bot can play it to check the balance.
 *
 * Coordinates are "nominal screen" units: 1280 wide by 640 tall. The craft sits at CRAFT_Y and the
 * ground scrolls past it; an area's world y is how far along the pass it lies.
 */

export const VIEW_W = 1280
export const VIEW_H = 640
/** Where the craft sits on the nominal screen */
export const CRAFT_X = VIEW_W / 2
export const CRAFT_Y = 512
/** The pass's target is the mission's own coverage target, so the game and the report never disagree */
export const TARGET_PCT = COVERAGE_TARGET

export type AreaSize = 'L' | 'M' | 'S'

export interface Area {
  id: string
  name: string
  /** Across the track, in nominal pixels */
  x: number
  /** Along the track: how far into the pass the craft is when it is level with this area */
  y: number
  r: number
  /** Permanently shadowed: only instruments that see into the dark can map it */
  dark: boolean
  /** Share of all the ice in the pass (they add up to 100) */
  value: number
  size: AreaSize
}

/**
 * The polar craters of the pass, with their real names. Which are in permanent shadow, and roughly
 * how much ice each holds, are game values; the shadowed ones hold most of it, as in the real data.
 */
export const AREAS: Area[] = [
  { id: 'amundsen', name: 'Amundsen', x: 360, y: 430, r: 78, dark: false, value: 10, size: 'M' },
  { id: 'shackleton', name: 'Shackleton', x: 860, y: 700, r: 96, dark: true, value: 20, size: 'L' },
  { id: 'haworth', name: 'Haworth', x: 300, y: 1010, r: 78, dark: true, value: 12, size: 'M' },
  { id: 'faustini', name: 'Faustini', x: 1000, y: 1300, r: 96, dark: true, value: 14, size: 'L' },
  { id: 'malapert', name: 'Malapert Ridge', x: 520, y: 1560, r: 58, dark: false, value: 8, size: 'S' },
  { id: 'shoemaker', name: 'Shoemaker', x: 330, y: 1830, r: 78, dark: true, value: 12, size: 'M' },
  { id: 'cabeus', name: 'Cabeus', x: 880, y: 2090, r: 96, dark: true, value: 10, size: 'L' },
  { id: 'sverdrup', name: 'Sverdrup', x: 650, y: 2310, r: 78, dark: true, value: 8, size: 'M' },
  { id: 'degerlache', name: 'de Gerlache', x: 1010, y: 2560, r: 58, dark: true, value: 6, size: 'S' },
]

/** The pass ends this far after the last crater */
export const PASS_LENGTH = Math.max(...AREAS.map((a) => a.y)) + 300

/** Seconds to fill a crater completely at rate 1 */
const SCAN_SECONDS: Record<AreaSize, number> = { L: 2.6, M: 2.0, S: 1.6 }
/** Game seconds of scanning per hour of battery, and the draw of everything but the instruments */
const GAME_SECONDS_PER_HOUR = 14
const BUS_WATTS = 8
const MIN_DURATION = 24
const MAX_DURATION = 70
/** Beam radius for a footprint of 0.02 (the sim's number for the IR spectrometer), in nominal pixels */
const BEAM_AT_REFERENCE = 46

export interface Scanner {
  id: string
  name: string
  /** Crater-fills per second at rate 1: faster instruments make more data */
  rate: number
  /** Radius of the scanner's reach, in nominal pixels */
  beam: number
  seesDark: boolean
  /** The camera takes pictures, not ice readings */
  mapsIce: boolean
  watts: number
  /** One line for the briefing */
  blurb: string
}

/** The game's version of an instrument, read from the same numbers the simulation uses */
export function scannerFor(p: InstrumentPart): Scanner {
  // data rate 30 MB (neutron) .. 1500 MB (camera) a month maps to 0.7 .. 1.15
  const rate = 0.7 + (0.45 * Math.log10(Math.max(p.dataPerTurn, 30) / 30)) / Math.log10(50)
  const beam = BEAM_AT_REFERENCE * Math.sqrt(p.footprint / 0.02)
  const mapsIce = p.kind !== 'outreach'
  const speed = rate >= 1 ? 'Fast' : rate >= 0.8 ? 'Medium speed' : 'Slow'
  const blurb = !mapsIce
    ? 'Takes pictures, but cannot read ice.'
    : p.seesShadow
      ? `${speed}. Sees into the dark craters.`
      : `${speed}. Blind in permanent shadow.`
  return { id: p.id, name: p.name.replace(/\s*\(.*\)$/, ''), rate: Math.round(rate * 100) / 100, beam: Math.round(beam), seesDark: p.seesShadow, mapsIce, watts: Math.abs(p.power), blurb }
}

export interface PassSetup {
  scanners: Scanner[]
  /** Length of the pass in seconds: set by the battery */
  duration: number
  /** World pixels the craft flies a second */
  speed: number
  /** Usable battery in watt-hours, and the draw, for the briefing */
  batteryWh: number
  watts: number
  target: number
  areas: Area[]
}

/** Battery and instruments in, the pass out. A bigger battery or a lighter instrument gives a longer, calmer pass. */
export function makeSetup(instruments: InstrumentPart[], batteryUsableWh: number): PassSetup {
  const scanners = instruments.map(scannerFor)
  const watts = scanners.reduce((sum, s) => sum + s.watts, 0) + BUS_WATTS
  const hours = batteryUsableWh / watts
  const duration = Math.round(Math.min(MAX_DURATION, Math.max(MIN_DURATION, hours * GAME_SECONDS_PER_HOUR)))
  return { scanners, duration, speed: PASS_LENGTH / duration, batteryWh: batteryUsableWh, watts, target: TARGET_PCT, areas: AREAS }
}

/** The pass for a design: its instruments and its battery */
export function setupFromDesign(design: Design = createDefaultDesign()): PassSetup {
  const instruments = design.instruments.map((id) => getPartById(id)).filter((p): p is InstrumentPart => p?.category === 'instrument')
  return makeSetup(instruments, computeBudgets(design, 'engineer').batteryUsableWh)
}

/** What the scanners can do to one area: the best rate among those that can read it, or why none can */
export function scanAbility(setup: PassSetup, area: Area): { rate: number; blocked: null | 'dark' | 'noice' } {
  const ice = setup.scanners.filter((s) => s.mapsIce)
  if (ice.length === 0) return { rate: 0, blocked: 'noice' }
  const usable = ice.filter((s) => !area.dark || s.seesDark)
  if (usable.length === 0) return { rate: 0, blocked: 'dark' }
  return { rate: Math.max(...usable.map((s) => s.rate)), blocked: null }
}

/** The reach of the widest scanner (the camera counts for the picture even though it reads no ice) */
export function beamRadius(setup: PassSetup): number {
  return setup.scanners.length ? Math.max(...setup.scanners.map((s) => s.beam)) : BEAM_AT_REFERENCE
}

/* ---------------- play ---------------- */

export interface Reticle {
  x: number
  y: number
}

export interface PassInput {
  x: number
  y: number
  scanning: boolean
}

export type PassEvent =
  | { type: 'complete'; index: number; gain: number }
  | { type: 'blocked'; index: number; why: 'dark' | 'noice' }
  | { type: 'end'; reason: 'battery' | 'passed' }

export interface PassState {
  setup: PassSetup
  t: number
  /** 0..1 per area */
  progress: number[]
  /** Scanned over an area the instrument cannot read */
  blocked: Array<null | 'dark' | 'noice'>
  done: boolean
  reason: null | 'battery' | 'passed'
}

export function newPass(setup: PassSetup): PassState {
  return { setup, t: 0, progress: setup.areas.map(() => 0), blocked: setup.areas.map(() => null), done: false, reason: null }
}

/** How far along the pass the craft is */
export const craftPosition = (st: PassState): number => st.setup.speed * st.t

/** Where an area is on the nominal screen right now */
export function areaScreen(area: Area, s: number): Reticle {
  return { x: area.x, y: CRAFT_Y - (area.y - s) }
}

export function isVisible(area: Area, s: number): boolean {
  const y = areaScreen(area, s).y
  return y > -area.r && y < VIEW_H + area.r
}

/** Share of the ice mapped so far, 0..100 */
export function mapped(st: PassState): number {
  return st.setup.areas.reduce((sum, a, i) => sum + a.value * st.progress[i], 0)
}

/** How close the reticle has to be to an area's middle to be scanning it */
export function reach(setup: PassSetup, area: Area): number {
  return area.r * 0.55 + beamRadius(setup) * 0.9
}

/** Advance the pass by `dt` seconds with the player's input. Returns the things that happened. */
export function step(st: PassState, input: PassInput, dt: number): PassEvent[] {
  const events: PassEvent[] = []
  if (st.done) return events
  const { setup } = st
  st.t = Math.min(setup.duration, st.t + dt)
  const s = craftPosition(st)

  if (input.scanning) {
    setup.areas.forEach((area, i) => {
      if (st.progress[i] >= 1 || !isVisible(area, s)) return
      const at = areaScreen(area, s)
      if (Math.hypot(input.x - at.x, input.y - at.y) > reach(setup, area)) return
      const ability = scanAbility(setup, area)
      if (ability.blocked) {
        if (st.blocked[i] === null) events.push({ type: 'blocked', index: i, why: ability.blocked })
        st.blocked[i] = ability.blocked
        return
      }
      const before = st.progress[i]
      st.progress[i] = Math.min(1, before + (ability.rate * dt) / SCAN_SECONDS[area.size])
      if (before < 1 && st.progress[i] >= 1) events.push({ type: 'complete', index: i, gain: area.value })
    })
  }

  const allPassed = setup.areas.every((a) => areaScreen(a, s).y > VIEW_H + a.r)
  if (st.t >= setup.duration) {
    st.done = true
    st.reason = 'battery'
    events.push({ type: 'end', reason: 'battery' })
  } else if (allPassed) {
    st.done = true
    st.reason = 'passed'
    events.push({ type: 'end', reason: 'passed' })
  }
  return events
}

/* ---------------- result ---------------- */

export interface PassResult {
  mapped: number
  target: number
  win: boolean
  /** 0 = missed the target; 1 = target; 2 = 85%; 3 = 95% */
  stars: 0 | 1 | 2 | 3
  /** Ice the instruments could never read, however well you played */
  unreachable: number
  perArea: Array<{ name: string; value: number; pct: number; blocked: null | 'dark' | 'noice' }>
  insight: string
  reason: null | 'battery' | 'passed'
}

export function summarize(st: PassState): PassResult {
  const { setup } = st
  const total = mapped(st)
  const unreachable = setup.areas.reduce((sum, a) => sum + (scanAbility(setup, a).blocked ? a.value : 0), 0)
  const stars = total >= 95 ? 3 : total >= 85 ? 2 : total >= setup.target ? 1 : 0
  const perArea = setup.areas.map((a, i) => ({ name: a.name, value: a.value, pct: Math.round(st.progress[i] * 100), blocked: scanAbility(setup, a).blocked }))
  const names = setup.scanners.map((s) => s.name).join(' and ') || 'No instrument'
  let insight: string
  if (unreachable >= 100 - setup.target + 0.001) {
    const cause = setup.scanners.some((s) => s.mapsIce) ? 'cannot see into permanently shadowed craters' : 'takes pictures, not ice readings'
    insight = `The ${names} ${cause}: ${Math.round(unreachable)}% of the ice was out of its reach, so ${setup.target}% was never possible. A laser or a neutron instrument can read it.`
  } else if (total >= setup.target) {
    insight = `Mapped ${Math.round(total)}% with the ${names}, with ${Math.max(0, Math.round(setup.duration - st.t))} s of battery to spare.`
  } else {
    insight = `The battery gave ${setup.duration} s and the ${names} reached ${Math.round(total)}% of the ice. A bigger battery, or an instrument that draws less, buys more time.`
  }
  return { mapped: Math.round(total * 10) / 10, target: setup.target, win: total >= setup.target, stars, unreachable, perArea, insight, reason: st.reason }
}

/* ---------------- the bot ---------------- */

export interface Bot {
  /** Reticle speed in nominal pixels a second */
  speed: number
  /** Seconds it takes to pick a new target after finishing one */
  reaction: number
}

/** A steady, ordinary player: the "fly it for me" pass, and the balance test */
export const AUTOPILOT: Bot = { speed: 650, reaction: 0.35 }

export interface BotMind {
  target: number | null
  idleUntil: number
}

/** Choose where to aim: the crater worth the most per second of its time left in view */
export function botAim(st: PassState, mind: BotMind): { target: Reticle | null; scanning: boolean } {
  const { setup } = st
  const s = craftPosition(st)
  if (mind.target !== null && (st.progress[mind.target] >= 1 || !isVisible(setup.areas[mind.target], s) || scanAbility(setup, setup.areas[mind.target]).blocked)) mind.target = null
  if (mind.target === null) {
    let best = -1
    let bestScore = 0
    setup.areas.forEach((area, i) => {
      if (st.progress[i] >= 1 || !isVisible(area, s) || scanAbility(setup, area).blocked) return
      const left = (VIEW_H + area.r - areaScreen(area, s).y) / setup.speed // seconds until it has gone by
      const need = ((1 - st.progress[i]) * SCAN_SECONDS[area.size]) / scanAbility(setup, area).rate
      if (left < need * 0.6) return // would not finish in time: skip it
      const score = (area.value * (1 - st.progress[i])) / (need + 0.4 + Math.max(0, left * 0.05))
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    if (best >= 0 && st.t >= mind.idleUntil) mind.target = best
  }
  if (mind.target === null) return { target: null, scanning: false }
  return { target: areaScreen(setup.areas[mind.target], s), scanning: true }
}

/** Play a whole pass with the bot, in 1/60 s steps */
export function autoplay(setup: PassSetup, bot: Bot = AUTOPILOT): PassState {
  const st = newPass(setup)
  const mind: BotMind = { target: null, idleUntil: 0 }
  const ret: Reticle = { x: CRAFT_X, y: CRAFT_Y - 200 }
  const dt = 1 / 60
  while (!st.done) {
    const before = mind.target
    const aim = botAim(st, mind)
    if (aim.target) {
      const dx = aim.target.x - ret.x
      const dy = aim.target.y - ret.y
      const d = Math.hypot(dx, dy)
      const move = Math.min(d, bot.speed * dt)
      if (d > 0) {
        ret.x += (dx / d) * move
        ret.y += (dy / d) * move
      }
    }
    const events = step(st, { x: ret.x, y: ret.y, scanning: aim.scanning }, dt)
    if (events.some((e) => e.type === 'complete')) mind.idleUntil = st.t + bot.reaction
    if (before !== null && mind.target === null) mind.idleUntil = Math.max(mind.idleUntil, st.t + bot.reaction)
  }
  return st
}

/** How many real hours of battery the pass stands for (the game shows them in `duration` seconds) */
export function passHours(setup: PassSetup): number {
  return Math.max(1, Math.round(setup.batteryWh / setup.watts))
}

/** "Shackleton and Cabeus" / "Shackleton, Cabeus and 3 more" */
function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

/** Per crater: mapped in full, partly or not at all, or locked (the instruments cannot read it) */
export type CraterState = 'reached' | 'missed' | 'locked'
export function craterState(a: PassResult['perArea'][number]): CraterState {
  return a.blocked ? 'locked' : a.pct >= 100 ? 'reached' : 'missed'
}

/**
 * One sentence on why the pass mapped what it did, biggest cause first: craters the instruments
 * cannot read, then the battery, then the footprint, then aim.
 */
export function passWhy(setup: PassSetup, r: PassResult): string {
  const byValue = [...r.perArea].sort((a, b) => b.value - a.value)
  const locked = byValue.filter((a) => craterState(a) === 'locked')
  const missed = byValue.filter((a) => craterState(a) === 'missed')
  const readers = setup.scanners.filter((s) => s.mapsIce)
  const names = (setup.scanners.length ? setup.scanners : readers).map((s) => s.name).join(' and ') || 'craft'
  if (locked.length) {
    const why = readers.length === 0 ? `the ${names} reads no ice` : `the ${readers.map((s) => s.name).join(' and ')} cannot see into permanent shadow`
    return `Locked out of ${listNames(locked.map((a) => a.name))}: ${why}.`
  }
  if (!missed.length) return 'Every crater mapped.'
  const narrow = beamRadius(setup) < BEAM_AT_REFERENCE
  const cause =
    r.reason === 'battery'
      ? 'the battery ran out first; a bigger battery buys more time'
      : narrow
        ? `the ${readers.map((s) => s.name).join(' and ')}'s footprint is narrow, sweep slower`
        : 'they slipped past; aim at the big shadowed craters first'
  return `Missed ${listNames(missed.map((a) => a.name))}: ${cause}.`
}
