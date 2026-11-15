import {
  difficultyPresets,
  lunarIceMapperBrief,
  scoreWeights,
  modelConstants as C,
} from '../data/brief'
import { getPartById, type InstrumentPart, type PropulsionPart, type AttitudePart } from '../data/parts'
import { getOrbitById } from '../data/orbits'
import { missedRideWaitTurns } from '../data/rides'
import { computeBudgets } from './budgets'
import type { Budgets, SimState, Report, RequirementResult, ScoreBreakdown, ChangeHint } from './types'

/**
 * The final report: each requirement met or missed, with the chain behind
 * every miss walked back to the decisions and events that caused it.
 * Ported from prototype/lunar_ice_mapper/evaluation.py (branch python-core-logic).
 */

const NEVER_ARRIVED = 'The craft never reached its science orbit.'
const BAD_LUCK = 'Bad luck stacked up over the mission; the margins were too thin to absorb it.'
const COVERAGE_TARGET = 70

function countOf(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function instrumentsOf(state: SimState): InstrumentPart[] {
  return state.design.instruments
    .map((id) => getPartById(id))
    .filter((p): p is InstrumentPart => p !== undefined && p.category === 'instrument')
}

function nouns(list: InstrumentPart[]): string {
  const lower = (name: string) =>
    name
      .replace(/\s*\(.*\)/, '')
      .split(' ')
      .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
      .join(' ')
  return list.map((i) => lower(i.name)).join(' and ')
}

function eventsThatCostScience(state: SimState): string[] {
  const n = state.flight.counts
  const out: string[] = []
  if (n['radiation-reset'])
    out.push(
      `Radiation resets cost ${countOf(n['radiation-reset'], 'science month')}.` +
        (state.design.computer === 'computer-redundant' ? '' : ' A radiation-hard computer resets far less often.')
    )
  if (n['long-eclipse'])
    out.push(`Long eclipses drained the battery in ${countOf(n['long-eclipse'], 'month')}. The large battery rides them out.`)
  if (n['instrument-degrades'])
    out.push(
      `The instrument degraded ${countOf(n['instrument-degrades'], 'time')}, leaving ${Math.round(state.flight.scienceFactor * 100)}% of its science per month. More test months lower the odds.`
    )
  if (n['station-outage']) out.push(`Ground station outages halved the downlink in ${countOf(n['station-outage'], 'month')}.`)
  return out
}

function moneyDrains(state: SimState, b: Budgets): string[] {
  const f = state.flight
  const out: string[] = []
  if (f.missedRides) {
    const wait = f.missedRides * missedRideWaitTurns
    out.push(
      `Missing the ride meant ${wait} more months of team cost (${(wait * C.teamCostPrelaunch).toFixed(1)} M). Slack in the schedule protects against build delays.`
    )
  }
  if (b.totalCost > b.spendable)
    out.push(`The plan already cost ${b.totalCost.toFixed(1)} M against ${b.spendable.toFixed(1)} M spendable.`)
  if (b.transferTurns && b.transferTurns > C.cruiseTurns)
    out.push(
      `The ${b.transferTurns}-month electric transfer cost ${(b.transferTurns * b.transferCostPerTurn).toFixed(1)} M in team and ground time before any science.`
    )
  const propulsion = getPartById(state.design.propulsion) as PropulsionPart | undefined
  if (f.counts.thruster && !f.thrusterOk && propulsion && !propulsion.impulsive)
    out.push('The weak thruster stretched the transfer, and every extra month costs money.')
  const extra = f.scienceTurns - lunarIceMapperBrief.missionDurationTurns
  if (extra > 0)
    out.push(
      `The extended mission ran ${countOf(extra, 'month')} past the planned ${lunarIceMapperBrief.missionDurationTurns}, at ${b.opsCostPerTurn.toFixed(2)} M a month.`
    )
  if (b.reserveAmount === 0) out.push('No reserve was held back for surprises (CubeSat 101 advises at least 10%).')
  return out.length ? out : ['Running costs and fixes ate the budget before the mission was over.']
}

function whyNoCapture(state: SimState, b: Budgets): string[] {
  const f = state.flight
  const out: string[] = []
  if (f.end === 'lost contact after deployment') {
    out.push('Contact was lost right after deployment, as happened to Lunar IceCube.')
    if (f.testTurns < 2)
      out.push(`Only ${countOf(f.testTurns, 'test month')} had been flown: that made this x${f.testFactor} as likely. More testing lowers the odds.`)
    // Say what the player actually chose at the card (QC #35)
    const choice = state.allEvents.find((e) => e.eventId === 'no-signal')?.choiceId
    out.push(
      choice === 'give-up'
        ? 'You chose to stop searching; the craft was lost.'
        : choice === 'recover'
          ? 'Emergency tracking did not find the craft.'
          : 'There was no reserve to pay for emergency tracking.'
    )
  } else if (f.end === 'not enough delta-v left to capture') {
    out.push(
      `Only ${Math.max(0, f.dvLeft).toFixed(0)} m/s was left at the Moon; capture needed ${(b.captureDeltaV ?? 0).toFixed(0)}. The design carried ${b.deltaVAvailable.toFixed(0)}.`
    )
    out.push(
      f.counts.thruster
        ? 'The weak thruster cost the margin. More delta-v margin, more testing or a reserve for the fix would have saved it.'
        : 'Carry more propellant or choose an orbit that is cheaper to reach.'
    )
  } else if (f.end === 'this craft cannot reach the science orbit') {
    out.push('With this engine, ride and transfer the craft has no way into the chosen orbit. The Go / No-Go check flags this in red.')
  } else if (f.end.startsWith('budget ran out')) {
    out.push(`The money ran out in month ${state.currentTurn}, before the craft reached orbit.`)
    out.push(...moneyDrains(state, b))
  } else {
    out.push(`The programme was closed in month ${state.currentTurn} with the craft still on its way.`)
    if (f.missedRides) out.push(`It missed ${countOf(f.missedRides, 'ride')} and waited ${missedRideWaitTurns} months for each next one.`)
    if (f.counts.thruster && !f.thrusterOk) out.push('The weak thruster doubled what was left of the transfer.')
  }
  return out
}

function whyShortLife(state: SimState, b: Budgets): string[] {
  const f = state.flight
  if (!f.captured) return [NEVER_ARRIVED]
  if (f.end === 'out of propellant, orbit lost' || f.dvLeft < 0)
    return [
      `The propellant ran out after ${countOf(f.scienceTurns, 'month')}: holding this orbit costs ${b.deltaVStationKeeping} m/s a month and ${b.deltaVAfterCapture.toFixed(0)} m/s was left after capture.`,
    ]
  if (f.end.startsWith('budget ran out'))
    return [`The money ran out after ${countOf(f.scienceTurns, 'science month')}.`, ...moneyDrains(state, b)]
  return [`The programme was closed in month ${state.currentTurn}: the craft reached orbit too late (captured in month ${f.captureTurn}).`]
}

function linkCause(state: SimState, b: Budgets): string {
  const crowd = instrumentsOf(state).filter((i) => i.kind === 'outreach')
  let text =
    `${state.flight.science.lost.toFixed(0)} MB of data never got home: the instruments made ${b.dataPerTurn.toFixed(0)} MB a month, ` +
    `the link carried ${b.downlinkPerTurn.toFixed(0)} and storage holds ${b.storageCapacity} MB. The coverage in the lost data was lost with it.`
  if (crowd.length && state.design.instruments.length > 1) text += ` The ${nouns(crowd)} data crowded out the ice data.`
  return text + ' More contact time, a bigger dish on the ground or a dish antenna on board would carry it.'
}

/** Chain: sees shadow -> passes -> altitude and pointing -> power -> data home -> science turns -> events */
function whyCoverageShort(state: SimState, b: Budgets): string[] {
  const f = state.flight
  const turns = lunarIceMapperBrief.missionDurationTurns
  if (!f.captured) return [NEVER_ARRIVED]
  const all = instrumentsOf(state)
  const ice = all.filter((i) => i.seesShadow)
  if (ice.length === 0)
    return [
      all.length === 0
        ? 'No instrument was on board, so nothing could map the ice. Only the laser reflectometer and the neutron spectrometer see into the shadowed craters.'
        : `The ${nouns(all)} cannot see into the shadowed craters where the ice is: ${all.length > 1 ? 'they need' : 'it needs'} sunlight. Only the laser reflectometer and the neutron spectrometer can.`,
    ]
  const orbit = getOrbitById(state.design.orbit)
  const best = ice.reduce((a, c) => ((b.coverageRate[c.id] ?? 0) > (b.coverageRate[a.id] ?? 0) ? c : a))
  const noun = nouns([best])
  const out: string[] = []
  const passes = orbit?.passesPerTurn ?? 0
  // Over the turns actually flown (an extended mission flies more than the planned 12)
  const flown = Math.max(turns, f.scienceTurns)
  // Ice instruments in range combine their strips (scienceTotals), so the ideal counts them all
  const inRange = ice.filter((i) => i.maxAltitudeKm === null || (orbit?.altitude ?? 0) <= i.maxAltitudeKm)
  const footprint = inRange.reduce((s, i) => s + i.footprint, 0)
  const ideal = 100 * (1 - Math.exp(-passes * footprint * flown))
  if (inRange.length && ideal < COVERAGE_TARGET)
    out.push(
      `Too few passes: this orbit (${orbit?.name}) crosses the pole ${passes} times a month and the ${nouns(inRange)} ${inRange.length > 1 ? 'see' : 'sees'} a narrow strip each time. ` +
        `Even a perfect craft maps only ${ideal.toFixed(0)}% in ${flown} months. It takes an orbit with more passes or an instrument with a wider view.`
    )
  if (best.maxAltitudeKm !== null && orbit && orbit.altitude > best.maxAltitudeKm) {
    out.push(
      `Too high: the ${noun} only works below ${best.maxAltitudeKm} km and this orbit passes the pole at ${orbit.altitude} km, so it maps nothing there.`
    )
  }
  const attitude = getPartById(state.design.attitude) as AttitudePart | undefined
  if (!attitude?.precise && best.qualityWithoutPrecisePointing < 1)
    out.push(`Without precise pointing the ${noun} works at ${Math.round(best.qualityWithoutPrecisePointing * 100)}% of its quality.`)
  if (b.scienceDuty < 1) out.push(`Too little power: the instruments ran only ${Math.round(b.scienceDuty * 100)}% of the time they could.`)
  if (f.science.lost > 1) out.push(linkCause(state, b))
  if (b.projectedCoverage >= COVERAGE_TARGET) out.push(...eventsThatCostScience(state)) // good enough on paper: the flight cost it
  if (f.scienceTurns < turns) out.push(...whyShortLife(state, b))
  return out.length ? out : [BAD_LUCK]
}

function whyDataShort(state: SimState, b: Budgets, need: number): string[] {
  const f = state.flight
  const turns = lunarIceMapperBrief.missionDurationTurns
  if (!f.captured) return [NEVER_ARRIVED]
  const all = instrumentsOf(state)
  const science = all.filter((i) => i.kind !== 'outreach')
  if (science.length === 0)
    return [`The ${nouns(all)} returns outreach pictures (${f.outreach.toFixed(0)} MB came home), which do not count as science data.`]
  const made = science.reduce((s, i) => s + i.dataPerTurn, 0) * b.scienceDuty
  const out: string[] = []
  if (made * turns < need) {
    out.push(
      `The science instruments make ${made.toFixed(0)} MB a month: ${(made * turns).toFixed(0)} MB in ${turns} months, short of ${need} MB before anything goes wrong.`
    )
    if (b.scienceDuty < 1) out.push(`Power held them to ${Math.round(b.scienceDuty * 100)}% of the time they could run.`)
  }
  if (f.science.lost > 1) out.push(linkCause(state, b))
  if (b.projectedData >= need) out.push(...eventsThatCostScience(state))
  if (f.scienceTurns < turns) out.push(...whyShortLife(state, b))
  return out.length ? out : [BAD_LUCK]
}

/**
 * How the flight ended, as one sentence ("Budget ran out in orbit."). The report's verdict and
 * the base's mission-result dialog both say this, so they always name the same reason.
 */
export function endingSentence(end: string): string {
  const e = end || 'mission over'
  return `${e.charAt(0).toUpperCase() + e.slice(1)}.`
}

/** Ends where the craft itself was lost; any other failure leaves a working craft (e.g. the money ran out) */
export function craftWasLost(end: string): boolean {
  return (
    end === 'lost contact after deployment' ||
    end === 'out of propellant, orbit lost' ||
    end === 'not enough delta-v left to capture'
  )
}

/**
 * Build the final mission report from simulation state.
 */
export function buildReport(state: SimState): Report {
  const b = computeBudgets(state.design, state.difficulty)
  const preset = difficultyPresets[state.difficulty] ?? difficultyPresets.engineer
  const f = state.flight
  const turnsNeeded = lunarIceMapperBrief.missionDurationTurns
  const dataTarget = preset.dataTarget
  const moneyLeft = f.main + Math.max(f.reserve, 0)

  const req = (
    id: string,
    name: string,
    met: boolean,
    target: number,
    actual: number,
    unit: string,
    reason: string,
    causes: () => string[]
  ): RequirementResult => {
    const why = met ? [] : causes()
    return { id, name, met, target, actual, unit, reason, traceToDecision: why[0], causes: why }
  }

  const requirements: RequirementResult[] = [
    req('capture', 'Lunar Orbit Insertion', f.captured, 1, f.captured ? 1 : 0, '',
      f.captured ? `Captured into the science orbit in month ${f.captureTurn}.` : 'Never captured into lunar orbit.',
      () => whyNoCapture(state, b)),
    req('coverage', 'Ice Coverage', f.coverage >= COVERAGE_TARGET, COVERAGE_TARGET, Math.round(f.coverage * 10) / 10, '%',
      `${f.coverage.toFixed(1)}% of the south polar region mapped by an instrument that sees into shadow, with its data home.`,
      () => whyCoverageShort(state, b)),
    req('data', 'Science Data Return', f.data >= dataTarget, dataTarget, Math.round(f.data), 'MB',
      `${f.data.toFixed(0)} MB of science data on the ground.`,
      () => whyDataShort(state, b, dataTarget)),
    req('lifetime', 'Mission Lifetime', f.scienceTurns >= turnsNeeded, turnsNeeded, f.scienceTurns, 'months',
      `${f.scienceTurns} months in the science orbit.`,
      () => whyShortLife(state, b)),
    req('budget', 'Budget Compliance', f.reserve >= 0, 1, f.reserve >= 0 ? 1 : 0, '',
      f.reserve >= 0 ? `${moneyLeft.toFixed(1)} M left.` : `Reserve overdrawn by ${(-f.reserve).toFixed(2)} M.`,
      () => moneyDrains(state, b)),
  ]

  // Success level (Jakob, QC #91): success = all five met; partial = the ice coverage
  // met but another missed; failed = the ice coverage missed, or the mission ended
  // lost or out of money (every such end stops the craft: flight.alive is false)
  const allMet = requirements.every((r) => r.met)
  const coverageMet = requirements.find((r) => r.id === 'coverage')!.met
  let outcome: Report['outcome']
  if (allMet) outcome = 'success'
  else if (coverageMet && f.alive) outcome = 'partial'
  else outcome = 'failed'

  const missed = requirements.filter((r) => !r.met).map((r) => r.name)
  const outcomeReason =
    outcome === 'success' ? 'All mission requirements met.' : `${endingSentence(f.end)} Missed: ${missed.join(', ')}.`

  // Score (out of 1000)
  // Data and lifetime only count for as much ice as they mapped: a craft that finds
  // no ice earns little for them (Jakob, 14 Nov)
  const w = scoreWeights
  const iceShare = Math.min(1, f.coverage / COVERAGE_TARGET)
  const parts = f.captured
    ? {
        coverage: w.coverage * iceShare,
        data: w.data * Math.min(1, f.data / dataTarget) * iceShare,
        lifetime: w.lifetime * Math.min(1, f.scienceTurns / turnsNeeded) * iceShare,
        context: w.context * Math.min(1, f.context / COVERAGE_TARGET),
        // A failed mission earns no points for money left (Jakob, 14 Nov); the unspent money still goes back to the agency (game/world.ts)
        money: outcome === 'failed' ? 0 : (w.money * Math.max(0, moneyLeft)) / b.budgetCap,
      }
    : { coverage: 0, data: 0, lifetime: 0, context: 0, money: 0 }
  const score: ScoreBreakdown = {
    coverage: Math.round(parts.coverage),
    data: Math.round(parts.data),
    lifetime: Math.round(parts.lifetime),
    context: Math.round(parts.context),
    money: Math.round(parts.money),
    total: Math.round(parts.coverage + parts.data + parts.lifetime + parts.context + parts.money),
  }

  // What cost the missing points: one plain line per score part below its maximum (Jakob, 14 Nov)
  const scoreNotes: string[] = []
  if (!f.captured) {
    scoreNotes.push('Nothing scored: points only count once the craft is in the science orbit.')
  } else {
    const instruments = instrumentsOf(state)
    const iceNote = iceShare < 1 ? ` These points only count for as much ice as was mapped (${f.coverage.toFixed(0)}% of the ${COVERAGE_TARGET}% target).` : ''
    const coverageReq = requirements.find((r) => r.id === 'coverage')!
    if (score.coverage < w.coverage)
      scoreNotes.push(
        `Ice coverage ${score.coverage}/${w.coverage}: ${f.coverage.toFixed(0)}% of the south pole mapped, ${COVERAGE_TARGET}% earns full points.` +
          (coverageReq.causes[0] ? ` ${coverageReq.causes[0]}` : '')
      )
    if (score.data < w.data)
      scoreNotes.push(`Science data ${score.data}/${w.data}: ${f.data.toFixed(0)} MB home of the ${dataTarget} MB target.${iceNote}`)
    if (score.lifetime < w.lifetime)
      scoreNotes.push(
        f.scienceTurns >= turnsNeeded
          ? `Months in orbit ${score.lifetime}/${w.lifetime}: all ${turnsNeeded} science months flown` +
              (f.scienceTurns > turnsNeeded ? ` (${f.scienceTurns} with the extended mission)` : '') +
              `, but they score only for the ice they mapped (${f.coverage.toFixed(0)}% of the ${COVERAGE_TARGET}% target).`
          : `Months in orbit ${score.lifetime}/${w.lifetime}: ${f.scienceTurns} of ${turnsNeeded} science months flown.${iceNote}`
      )
    if (score.context < w.context)
      scoreNotes.push(
        instruments.some((i) => i.kind === 'context')
          ? `Sunlit-ground map ${score.context}/${w.context}: the IR spectrometer mapped ${f.context.toFixed(0)}% of the sunlit ground; ${COVERAGE_TARGET}% earns full points.`
          : `Sunlit-ground map ${score.context}/${w.context}: no IR spectrometer on board, and only it maps the sunlit ground. Fit it at the Research Lab beside an ice instrument.`
      )
    if (score.money < w.money)
      scoreNotes.push(
        outcome === 'failed'
          ? `Money left 0/${w.money}: a failed mission earns no points for money left.` +
              (moneyLeft > 0 ? ` The ${moneyLeft.toFixed(1)} M it did not spend still goes back to the agency.` : '')
          : `Money left ${score.money}/${w.money}: ${Math.max(0, moneyLeft).toFixed(1)} M of the ${b.budgetCap} M budget was left. A cheaper plan, or fewer fixes paid in flight, keeps more.`
      )
  }

  // One hint per missed requirement: the first link of its chain
  const hints: ChangeHint[] = requirements
    .filter((r) => !r.met && r.causes.length)
    .map((r) => ({ area: r.name, suggestion: r.causes[0], priority: r.id === 'capture' ? 'high' : 'medium' }))

  return {
    outcome,
    outcomeReason,
    requirements,
    requirementsMet: requirements.filter((r) => r.met).length,
    requirementsTotal: requirements.length,
    score,
    scoreNotes,
    totalCost: b.budgetCap - moneyLeft,
    dataReturned: f.data,
    outreachReturned: f.outreach,
    coverageAchieved: f.coverage,
    turnsInOrbit: f.scienceTurns,
    eventsEncountered: state.allEvents.length,
    eventsHandledWell: state.allEvents.filter((e) => e.choiceSucceeded).length,
    playerMass: b.totalMass,
    playerCost: b.totalCost,
    hints,
    design: state.design,
    difficulty: state.difficulty,
    timestamp: Date.now(),
  }
}
