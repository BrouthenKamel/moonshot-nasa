import type { Insight } from '../../minigames/contract'
import { computeBudgets } from '../../sim/budgets'
import type { Report, TurnEvent, TurnLog } from '../../sim/types'
import type { RoomId } from '../rooms/ids'

/**
 * WP-4B debrief: what the player predicted in each room (the mini game Insights)
 * against what the flight sim actually did, one plain-English line per subsystem.
 *
 * Pure and deterministic: no React, no stores. Every "actual" number comes from the
 * sim's own report, turn logs and events; nothing here invents physics.
 */

export type SubsystemId = 'power' | 'fuel' | 'transfer' | 'schedule' | 'data' | 'coverage' | 'reliability' | 'reserve'

/**
 * held: the flight matched the prediction (or did better).
 * worse: the flight came in short of the prediction.
 * untested: the flight never got far enough to try this part.
 */
export type Verdict = 'held' | 'worse' | 'untested'

export interface Measure {
  value: number
  unit: string
}

export interface SubsystemLine {
  id: SubsystemId
  name: string
  /** The room that holds this decision: where "Fly again" sends the player */
  room: RoomId
  verdict: Verdict
  /** The room's number, or null when the player skipped that experiment */
  predicted: Measure | null
  actual: Measure | null
  /** "In the Power Lab you predicted 41 min of margin. In orbit you had 38." */
  line: string
  /** Why the flight differed (or held), in one or two plain sentences */
  why: string
}

/** What the flight left behind: the report plus its run record */
export interface FlightRecord {
  report: Report
  turnLogs: TurnLog[]
  events: TurnEvent[]
}

export const ROOM_TITLES: Record<RoomId, string> = {
  briefing: 'Briefing Room',
  'science-lab': 'Science Lab',
  'clean-room': 'Clean Room',
  'thermal-vac': 'Thermal-Vac Chamber',
  'flight-dynamics': 'Flight Dynamics',
  'ground-station': 'Ground Station',
  'launch-hangar': 'Launch Hangar',
  'mission-control': 'Mission Control',
}

/* ---------------- facts read from the flight ---------------- */

const PRE_LAUNCH: TurnLog['phase'][] = ['build', 'test', 'wait']

export interface FlightFacts {
  launched: boolean
  launchTurn: number | null
  captured: boolean
  captureTurn: number | null
  /** Months from launch to the capture burn */
  transferMonths: number | null
  /** Δv left right after the capture burn (negative: how much was missing) */
  fuelAfterCapture: number | null
  scienceMonths: number
  count: (id: TurnEvent['eventId']) => number
  dvLostToThruster: number
  monthsLostToThruster: number
  reserveSpent: number
  reserveLeft: number | null
  dataLostOverflow: number
}

export function flightFacts({ report, turnLogs, events }: FlightRecord): FlightFacts {
  const b = computeBudgets(report.design, report.difficulty)
  const launchLog = turnLogs.find((l) => !PRE_LAUNCH.includes(l.phase))
  const launched = launchLog !== undefined
  const captured = report.requirements.find((r) => r.id === 'capture')?.met ?? false
  const captureLog = turnLogs.find((l) => l.phase === 'capture')
  const launchTurn = launched ? launchLog.turn : null
  const captureTurn = captured && captureLog ? captureLog.turn : null
  // The capture burn is paid before its turn closes, so the capture log holds the fuel after it
  const fuelAfterCapture = captured
    ? (captureLog?.fuelRemaining ?? null)
    : captureLog && b.captureDeltaV !== null
      ? captureLog.fuelRemaining - b.captureDeltaV
      : null
  const count = (id: TurnEvent['eventId']) => events.filter((e) => e.eventId === id).length
  const sum = (pick: (e: TurnEvent) => number) => events.reduce((s, e) => s + (pick(e) || 0), 0)
  const last = turnLogs[turnLogs.length - 1]
  return {
    launched,
    launchTurn,
    captured,
    captureTurn,
    transferMonths: launchTurn !== null && captureLog ? captureLog.turn - launchTurn : null,
    fuelAfterCapture,
    scienceMonths: report.turnsInOrbit,
    count,
    dvLostToThruster: sum((e) => (e.eventId === 'thruster' ? e.impact.deltavLost : 0)),
    monthsLostToThruster: sum((e) => (e.eventId === 'thruster' ? e.impact.turnsLost : 0)),
    reserveSpent: sum((e) => e.impact.reserveSpent),
    reserveLeft: last ? last.reserveRemaining : null,
    dataLostOverflow: turnLogs.reduce((s, l) => s + (l.dataLost || 0), 0),
  }
}

/* ---------------- helpers ---------------- */

const round = (n: number, digits = 0) => {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const byId = (insights: Insight[], ...ids: string[]) => {
  for (const id of ids) {
    const hit = insights.find((i) => i.id === id)
    if (hit) return hit
  }
  return undefined
}
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const measure = (i: Insight | undefined): Measure | null => (i ? { value: i.metric.value, unit: i.metric.unit } : null)
/** Rooms named like departments read without "the": "In Flight Dynamics you…" */
const NO_ARTICLE: RoomId[] = ['flight-dynamics', 'mission-control']
/** "the Clean Room", "Flight Dynamics" */
export const theRoom = (room: RoomId) => `${NO_ARTICLE.includes(room) ? '' : 'the '}${ROOM_TITLES[room]}`
const inRoom = (room: RoomId) => `In ${theRoom(room)}`
const skipped = (room: RoomId, what: string) => `You did not run the ${ROOM_TITLES[room]} experiment, so there was no prediction for ${what}.`

/* ---------------- one builder per subsystem ---------------- */

function powerLine(insights: Insight[], f: FlightFacts): SubsystemLine {
  const charge = byId(insights, 'eclipse-min-charge')
  const margin = byId(insights, 'power-margin')
  const pick = charge ?? margin
  const room: RoomId = charge ? 'thermal-vac' : margin ? 'clean-room' : 'thermal-vac'
  const said = charge
    ? `${inRoom(room)} you kept ${charge.metric.value}% charge through the eclipse.`
    : margin
      ? `${inRoom(room)} the bus ran with ${margin.metric.value} W to spare in sunlight.`
      : skipped(room, 'the battery')
  const base = { id: 'power' as const, name: 'Power', room, predicted: measure(pick) }
  if (f.scienceMonths === 0)
    return { ...base, verdict: 'untested', actual: null, line: `${said} The craft never flew a month in orbit, so the battery was never tested.`, why: 'Power only matters once the craft is in its science orbit.' }
  const flat = f.count('long-eclipse')
  if (flat === 0)
    return {
      ...base,
      verdict: 'held',
      actual: { value: 0, unit: 'months in safe mode' },
      line: `${said} In orbit the battery never ran flat in ${plural(f.scienceMonths, 'month')}.`,
      why: 'Your battery and solar wings covered every eclipse the orbit threw at them.',
    }
  return {
    ...base,
    verdict: 'worse',
    actual: { value: flat, unit: 'months in safe mode' },
    line: `${said} In orbit, ${flat === 1 ? 'a long eclipse' : `${flat} long eclipses`} drained the battery: ${plural(flat, 'month')} in safe mode with no science.`,
    why: 'Your test covered a normal eclipse, but this orbit sometimes has longer ones. A bigger battery in the Clean Room rides them out.',
  }
}

function fuelLine(insights: Insight[], f: FlightFacts): SubsystemLine {
  const pick = byId(insights, 'orbit-dv-margin', 'delta-v-margin')
  const room: RoomId = pick?.room === 'clean-room' ? 'clean-room' : 'flight-dynamics'
  const said = !pick
    ? skipped(room, 'the fuel')
    : pick.metric.value >= 0
      ? `${inRoom(room)} you predicted ${pick.metric.value} m/s of fuel to spare after the capture burn.`
      : `${inRoom(room)} you saw the tank would be ${-pick.metric.value} m/s short of the capture burn.`
  const warned = pick !== undefined && pick.metric.value < 0
  const base = { id: 'fuel' as const, name: 'Fuel (Δv)', room, predicted: measure(pick) }
  if (!f.launched || f.fuelAfterCapture === null)
    return { ...base, verdict: 'untested', actual: null, line: `${said} The craft never reached the Moon, so the engine was never put to the test.`, why: 'The capture burn happens only on arrival at the Moon.' }
  const left = round(f.fuelAfterCapture)
  const thruster =
    f.dvLostToThruster > 0 ? ` A weak thruster cost ${round(f.dvLostToThruster)} m/s on the way.` : f.monthsLostToThruster > 0 ? ` A weak thruster slowed the trip instead of wasting fuel.` : ''
  if (!f.captured)
    return {
      ...base,
      verdict: 'worse',
      actual: { value: left, unit: 'm/s' },
      line: `${said} At the Moon the tank was ${-left} m/s short, so the craft could not brake into orbit.`,
      why: `${warned ? 'Your experiment warned you: ' : ''}the capture burn needs more Δv than the tank held.${thruster} A bigger engine or tank (Clean Room) or a cheaper orbit (Flight Dynamics) fixes it.`.replace(/^./, (c) => c.toUpperCase()),
    }
  const short = pick !== undefined && left < pick.metric.value - 5
  return {
    ...base,
    verdict: short ? 'worse' : 'held',
    actual: { value: left, unit: 'm/s' },
    line: `${said} After the real capture burn you had ${left} m/s left.`,
    why: short
      ? `Less than planned.${thruster || ' The trip used more fuel than the bench numbers.'}`
      : pick
        ? `The tank held what the numbers promised.${thruster}`
        : `The engine braked into orbit with fuel to spare.${thruster}`,
  }
}

function transferLine(insights: Insight[], f: FlightFacts): SubsystemLine {
  const pick = byId(insights, 'transfer-time')
  const room: RoomId = 'flight-dynamics'
  const said = pick ? `${inRoom(room)} you planned ${plural(pick.metric.value, 'month')} from launch to the Moon.` : skipped(room, 'the trip')
  const base = { id: 'transfer' as const, name: 'Trip to the Moon', room, predicted: measure(pick) }
  if (f.transferMonths === null)
    return {
      ...base,
      verdict: f.launched ? 'worse' : 'untested',
      actual: null,
      line: `${said} ${f.launched ? 'The craft never made it into lunar orbit.' : 'The craft never launched.'}`,
      why: f.launched ? 'The trip ended before the capture burn could succeed.' : 'Nothing flew, so there was no trip.',
    }
  const late = pick !== undefined && f.transferMonths > pick.metric.value
  return {
    ...base,
    verdict: late ? 'worse' : 'held',
    actual: { value: f.transferMonths, unit: 'months' },
    line: `${said} The real trip took ${plural(f.transferMonths, 'month')}${f.captured ? '' : ', but the craft could not brake into orbit'}.`,
    why: !f.captured
      ? 'The trip itself went to plan: the fuel ran short at the end (see Fuel).'
      : late
      ? f.monthsLostToThruster > 0
        ? `A thruster problem added ${plural(f.monthsLostToThruster, 'month')} to the trip.`
        : 'The trip took longer than planned.'
      : pick
        ? 'The route flew exactly as plotted.'
        : 'The craft arrived and braked into orbit.',
  }
}

function scheduleLine(insights: Insight[], f: FlightFacts, report: Report): SubsystemLine {
  const pick = byId(insights, 'ride-wait')
  const room: RoomId = 'launch-hangar'
  const b = computeBudgets(report.design, report.difficulty)
  const said = pick
    ? pick.metric.value >= 0
      ? `${inRoom(room)} the craft was due ${plural(pick.metric.value, 'month')} before your ride left.`
      : `${inRoom(room)} you saw the craft would be ${plural(-pick.metric.value, 'month')} late for its ride.`
    : skipped(room, 'the launch date')
  const base = { id: 'schedule' as const, name: 'Launch date', room, predicted: measure(pick) }
  const delays = f.count('build-delay')
  if (f.launchTurn === null)
    return { ...base, verdict: 'untested', actual: null, line: `${said} The craft never left the ground.`, why: 'The mission ended before launch.' }
  const slip = f.launchTurn - b.rideTurn
  if (slip <= 0)
    return {
      ...base,
      verdict: 'held',
      actual: { value: 0, unit: 'months late' },
      line: `${said} It launched on time, in month ${f.launchTurn}.`,
      why: delays > 0 ? `${plural(delays, 'late part')} ate into your slack, but the slack was enough.` : 'The build finished in time for the ride.',
    }
  return {
    ...base,
    verdict: 'worse',
    actual: { value: slip, unit: 'months late' },
    line: `${said} It missed the ride and launched ${plural(slip, 'month')} late, in month ${f.launchTurn}.`,
    why: `${delays > 0 ? `${plural(delays, 'late part')} pushed the build past the departure. ` : ''}Waiting for the next ride costs money every month. More slack (an earlier build or a later ride) protects the date.`,
  }
}

function dataLine(insights: Insight[], f: FlightFacts, report: Report): SubsystemLine {
  const pick = byId(insights, 'pass-downlink')
  const room: RoomId = 'ground-station'
  const said = pick ? `${inRoom(room)} you predicted ${pick.metric.value} MB a day coming home.` : skipped(room, 'the downlink')
  const base = { id: 'data' as const, name: 'Data home', room, predicted: measure(pick) }
  if (f.scienceMonths === 0)
    return { ...base, verdict: 'untested', actual: null, line: `${said} No science month was flown, so nothing came down.`, why: 'Data only flows once the instruments work in orbit.' }
  const perDay = round(report.dataReturned / (f.scienceMonths * 30), 1)
  const outages = f.count('station-outage')
  const quiet = f.count('radiation-reset') + f.count('long-eclipse')
  const reasons = [
    outages > 0 ? `${plural(outages, 'ground station outage')} halved the contact time` : '',
    quiet > 0 ? `${plural(quiet, 'month')} in safe mode made no data` : '',
    f.dataLostOverflow > 0.5 ? `${round(f.dataLostOverflow)} MB did not fit through the link and was lost` : '',
  ].filter(Boolean)
  const short = pick !== undefined && perDay < pick.metric.value * 0.9
  return {
    ...base,
    verdict: short ? 'worse' : 'held',
    actual: { value: perDay, unit: 'MB/day' },
    line: `${said} In orbit you averaged ${perDay} MB a day: ${round(report.dataReturned)} MB in total.`,
    why: short
      ? `${reasons.length > 0 ? `${reasons.join('; ')}.` : 'The instruments made less than the link could carry.'}`.replace(/^./, (c) => c.toUpperCase())
      : reasons.length > 0
        ? `The link kept up despite this: ${reasons.join('; ')}.`
        : 'The radio and dish carried everything the instruments made.',
  }
}

function coverageLine(insights: Insight[], f: FlightFacts, report: Report): SubsystemLine {
  const pick = byId(insights, 'orbit-coverage')
  const room: RoomId = 'flight-dynamics'
  const bench = insights.filter((i) => i.id.startsWith('bench-') && report.design.instruments.includes(i.id.slice('bench-'.length)))
  const bestBench = bench.reduce<Insight | undefined>((m, i) => (!m || i.metric.value > m.metric.value ? i : m), undefined)
  const said = pick ? `${inRoom(room)} this orbit could sweep ${pick.metric.value}% of the pole.` : skipped(room, 'the coverage')
  const base = { id: 'coverage' as const, name: 'Ice mapped', room: bestBench && bestBench.metric.value < 30 ? ('science-lab' as RoomId) : room, predicted: measure(pick) }
  if (f.scienceMonths === 0)
    return { ...base, verdict: 'untested', actual: null, line: `${said} The craft never mapped a single month.`, why: 'Mapping starts only in the science orbit.' }
  const got = round(report.coverageAchieved)
  const target = report.requirements.find((r) => r.id === 'coverage')?.target ?? 70
  const degraded = f.count('instrument-degrades')
  const quiet = f.count('radiation-reset') + f.count('long-eclipse')
  const met = got >= target
  const simCause = report.requirements.find((r) => r.id === 'coverage')?.causes?.[0]
  const benchNote = bestBench ? ` In the Science Lab your best instrument found ${bestBench.metric.value}% of the ice in shadow.` : ''
  const reasons = [
    bestBench && bestBench.metric.value < 30 ? 'the instruments cannot see much ice in the dark' : '',
    degraded > 0 ? `an instrument degraded ${degraded === 1 ? 'once' : `${degraded} times`}` : '',
    quiet > 0 ? `${plural(quiet, 'month')} ${quiet === 1 ? 'was' : 'were'} lost in safe mode` : '',
  ].filter(Boolean)
  return {
    ...base,
    verdict: met ? 'held' : 'worse',
    actual: { value: got, unit: '%' },
    line: `${said} In orbit you mapped ${got}% of the ice (the goal was ${target}%).`,
    why: met
      ? `Orbit and instruments together reached the goal.${benchNote}`
      : `${reasons.length > 0 ? `Short of the goal: ${reasons.join(', ')}.` : (simCause ?? 'Short of the goal: the mission ended before the map was done.')}${benchNote}`,
  }
}

function reliabilityLine(insights: Insight[], f: FlightFacts): SubsystemLine {
  const pick = byId(insights, 'test-campaigns')
  const room: RoomId = 'thermal-vac'
  const said = pick ? `${inRoom(room)} your test campaigns found ${pick.metric.value} ${pick.metric.unit} hidden bugs.` : skipped(room, 'the hidden bugs')
  const base = { id: 'reliability' as const, name: 'Hidden flaws', room, predicted: measure(pick) }
  const flaws = [
    f.count('no-signal') > 0 ? 'the craft went silent after deployment' : '',
    f.count('thruster') > 0 ? 'a thruster underperformed' : '',
    f.count('instrument-degrades') > 0 ? 'an instrument degraded' : '',
  ].filter(Boolean)
  const n = f.count('no-signal') + f.count('thruster') + f.count('instrument-degrades')
  if (!f.launched)
    return { ...base, verdict: 'untested', actual: null, line: `${said} The craft never flew, so no flaw could show.`, why: 'Flaws only show up in flight.' }
  if (n === 0)
    return { ...base, verdict: 'held', actual: { value: 0, unit: 'flaws in flight' }, line: `${said} In flight, no hidden flaw showed up.`, why: 'Testing caught enough of the bugs, and the dice were kind.' }
  return {
    ...base,
    verdict: 'worse',
    actual: { value: n, unit: 'flaws in flight' },
    line: `${said} In flight, ${plural(n, 'flaw')} showed up: ${flaws.join(', ')}.`,
    why: 'Every bug not found on the ground can bite in space. More test campaigns cost months but make these rarer.',
  }
}

function reserveLine(insights: Insight[], f: FlightFacts, report: Report): SubsystemLine {
  const pick = byId(insights, 'reserve-set')
  const room: RoomId = 'briefing'
  const pct = pick?.metric.value ?? report.design.planning.reservePercent
  const said = pick ? `${inRoom(room)} you locked ${pct}% of the budget away for surprises.` : skipped(room, 'the reserve')
  const base = { id: 'reserve' as const, name: 'Reserve', room, predicted: measure(pick) }
  const spent = round(f.reserveSpent, 1)
  const left = f.reserveLeft === null ? null : round(f.reserveLeft, 1)
  const overdrawn = left !== null && left < 0
  const budgetMet = report.requirements.find((r) => r.id === 'budget')?.met ?? !overdrawn
  return {
    ...base,
    verdict: budgetMet ? 'held' : 'worse',
    actual: left === null ? null : { value: left, unit: 'M left' },
    line: `${said} In flight you spent ${spent} M of it on rescues${left === null ? '.' : overdrawn ? ` and overdrew it by ${-left} M.` : `; ${left} M was left.`}`,
    why: budgetMet
      ? spent > 0
        ? 'The reserve paid for the rescues: that is what it is for.'
        : 'Nothing went wrong that needed money.'
      : 'Surprises cost more than you set aside. A bigger reserve in the Briefing Room leaves less for parts but keeps the mission funded.',
  }
}

/* ---------------- public API ---------------- */

/** Predicted vs actual, one line per subsystem, in the order the craft meets them */
export function compareFlight(insights: Insight[], record: FlightRecord): SubsystemLine[] {
  const f = flightFacts(record)
  const { report } = record
  return [
    scheduleLine(insights, f, report),
    reliabilityLine(insights, f),
    fuelLine(insights, f),
    transferLine(insights, f),
    powerLine(insights, f),
    dataLine(insights, f, report),
    coverageLine(insights, f, report),
    reserveLine(insights, f, report),
  ]
}

/** Lower-case names for sentences ("the fuel", "the ice map") */
export const SHORT_NAMES: Record<SubsystemId, string> = {
  power: 'battery',
  fuel: 'fuel',
  transfer: 'trip to the Moon',
  schedule: 'launch date',
  data: 'downlink',
  coverage: 'ice map',
  reliability: 'testing',
  reserve: 'reserve',
}

/** What a success is mostly owed to, most important first */
const HEADLINE_ORDER: SubsystemId[] = ['coverage', 'data', 'power', 'fuel', 'reliability', 'transfer', 'schedule', 'reserve']

export interface Explanation {
  /** One sentence: what happened and the main reason */
  headline: string
  /** The chain behind it, most important first */
  reasons: string[]
}

/** Why the mission succeeded or failed, built from the sim's own causes and the comparison */
export function explainOutcome(report: Report, lines: SubsystemLine[]): Explanation {
  const worse = lines.filter((l) => l.verdict === 'worse')
  const held = lines.filter((l) => l.verdict === 'held')
  if (report.outcome === 'success') {
    const ranked = HEADLINE_ORDER.map((id) => held.find((l) => l.id === id)).filter((l): l is SubsystemLine => l !== undefined)
    const strengths = ranked.slice(0, 3).map((l) => SHORT_NAMES[l.id])
    return {
      headline: `It worked: the ${strengths.length > 0 ? joinAnd(strengths) : 'design'} came out the way your experiments said.`,
      reasons: [...ranked.map((l) => `${l.name}: ${l.why}`), ...worse.map((l) => `${l.name}: ${l.why} It cost points, but not the mission.`)],
    }
  }
  const missed = report.requirements.filter((r) => !r.met)
  const causes = missed.flatMap((r) => (r.causes?.length ? r.causes : [r.reason]))
  const first = decisiveLine(report, lines)
  const ending = report.outcomeReason.split('. Missed')[0]
  return {
    headline: `${report.outcome === 'partial' ? 'Part of it worked' : 'It failed'}: ${ending.charAt(0).toLowerCase()}${ending.slice(1)}${first ? `. The ${SHORT_NAMES[first.id]} decided it.` : '.'}`,
    reasons: Array.from(new Set([...(first ? [first] : []), ...worse].map((l) => `${l.name}: ${l.why}`).concat(causes))),
  }
}

/** How the sim's end reason maps to the subsystem that ended the mission */
const ENDINGS: [RegExp, SubsystemId][] = [
  [/delta-v|propellant|cannot reach/i, 'fuel'],
  [/lost contact/i, 'reliability'],
  [/budget ran out/i, 'reserve'],
]

/** What failure is mostly owed to, when the end reason does not say */
const BLAME_ORDER: SubsystemId[] = ['coverage', 'data', 'power', 'fuel', 'reliability', 'reserve', 'schedule', 'transfer']

/** The one subsystem that decided the outcome: what ended the flight, else the worst miss */
export function decisiveLine(report: Report, lines: SubsystemLine[]): SubsystemLine | null {
  const worse = lines.filter((l) => l.verdict === 'worse')
  if (worse.length === 0) return null
  const hit = ENDINGS.find(([re]) => re.test(report.outcomeReason))
  const byEnding = hit ? worse.find((l) => l.id === hit[1]) : undefined
  if (byEnding) return byEnding
  for (const id of BLAME_ORDER) {
    const l = worse.find((w) => w.id === id)
    if (l) return l
  }
  return worse[0]
}

/** The one room to redesign next: where the decisive subsystem is decided */
export function roomToRedesign(report: Report, lines: SubsystemLine[]): RoomId | null {
  return decisiveLine(report, lines)?.room ?? null
}
