import {
  difficultyPresets,
  lunarIceMapperBrief,
  scoreWeights,
  partialShare,
  modelConstants as C,
} from '../data/brief'
import { getPartById, type InstrumentPart, type PropulsionPart, type AttitudePart } from '../data/parts'
import { getOrbitById } from '../data/orbits'
import { missedRideWaitTurns } from '../data/rides'
import { getEventById } from '../data/events'
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
      `Radiation resets cost ${countOf(n['radiation-reset'], 'science turn')}.` +
        (state.design.computer === 'computer-redundant' ? '' : ' A radiation-hard computer resets far less often.')
    )
  if (n['long-eclipse'])
    out.push(`Long eclipses drained the battery on ${countOf(n['long-eclipse'], 'turn')}. The large battery rides them out.`)
  if (n['instrument-degrades'])
    out.push(
      `The instrument degraded ${countOf(n['instrument-degrades'], 'time')}, leaving ${Math.round(state.flight.scienceFactor * 100)}% of its science per turn. More test turns lower the odds.`
    )
  if (n['station-outage']) out.push(`Ground station outages halved the downlink on ${countOf(n['station-outage'], 'turn')}.`)
  return out
}

function moneyDrains(state: SimState, b: Budgets): string[] {
  const f = state.flight
  const out: string[] = []
  if (f.missedRides) {
    const wait = f.missedRides * missedRideWaitTurns
    out.push(
      `Missing the ride meant ${wait} more turns of team cost (${(wait * C.teamCostPrelaunch).toFixed(1)} M). Slack in the schedule protects against build delays.`
    )
  }
  if (b.totalCost > b.spendable)
    out.push(`The plan already cost ${b.totalCost.toFixed(1)} M against ${b.spendable.toFixed(1)} M spendable.`)
  if (b.transferTurns && b.transferTurns > C.cruiseTurns)
    out.push(
      `The ${b.transferTurns}-turn electric transfer cost ${(b.transferTurns * b.transferCostPerTurn).toFixed(1)} M in team and ground time before any science.`
    )
  const propulsion = getPartById(state.design.propulsion) as PropulsionPart | undefined
  if (f.counts.thruster && !f.thrusterOk && propulsion && !propulsion.impulsive)
    out.push('The weak thruster stretched the transfer, and every extra turn costs money.')
  const extra = f.scienceTurns - lunarIceMapperBrief.missionDurationTurns
  if (extra > 0)
    out.push(
      `The extended mission ran ${countOf(extra, 'turn')} past the planned ${lunarIceMapperBrief.missionDurationTurns}, at ${b.opsCostPerTurn.toFixed(2)} M a turn.`
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
      out.push(`Only ${countOf(f.testTurns, 'test turn')} had been flown: that made this x${f.testFactor} as likely. More testing lowers the odds.`)
    const cost = getEventById('no-signal')!.choices.find((c) => c.id === 'recover')!.reserveCost
    out.push(b.reserveAmount < cost ? 'There was no reserve to pay for emergency tracking.' : 'Emergency tracking did not find the craft.')
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
    out.push(`The money ran out on turn ${state.currentTurn}, before the craft reached orbit.`)
    out.push(...moneyDrains(state, b))
  } else {
    out.push(`The programme was closed on turn ${state.currentTurn} with the craft still on its way.`)
    if (f.missedRides) out.push(`It missed ${countOf(f.missedRides, 'ride')} and waited ${missedRideWaitTurns} turns for each next one.`)
    if (f.counts.thruster && !f.thrusterOk) out.push('The weak thruster doubled what was left of the transfer.')
  }
  return out
}

function whyShortLife(state: SimState, b: Budgets): string[] {
  const f = state.flight
  if (!f.captured) return [NEVER_ARRIVED]
  if (f.end === 'out of propellant, orbit lost' || f.dvLeft < 0)
    return [
      `The propellant ran out after ${countOf(f.scienceTurns, 'turn')}: holding this orbit costs ${b.deltaVStationKeeping} m/s a turn and ${b.deltaVAfterCapture.toFixed(0)} m/s was left after capture.`,
    ]
  if (f.end.startsWith('budget ran out'))
    return [`The money ran out after ${countOf(f.scienceTurns, 'science turn')}.`, ...moneyDrains(state, b)]
  return [`The programme was closed on turn ${state.currentTurn}: the craft reached orbit too late (captured on turn ${f.captureTurn}).`]
}

function linkCause(state: SimState, b: Budgets): string {
  const crowd = instrumentsOf(state).filter((i) => i.kind === 'outreach')
  let text =
    `${state.flight.science.lost.toFixed(0)} MB of data never got home: the instruments made ${b.dataPerTurn.toFixed(0)} MB a turn, ` +
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
      `The ${nouns(all)} cannot see into the shadowed craters where the ice is: it needs sunlight. Only the laser reflectometer and the neutron spectrometer can.`,
    ]
  const orbit = getOrbitById(state.design.orbit)
  const best = ice.reduce((a, c) => ((b.coverageRate[c.id] ?? 0) > (b.coverageRate[a.id] ?? 0) ? c : a))
  const noun = nouns([best])
  const out: string[] = []
  const passes = orbit?.passesPerTurn ?? 0
  // Over the turns actually flown (an extended mission flies more than the planned 12)
  const flown = Math.max(turns, f.scienceTurns)
  const ideal = 100 * (1 - Math.exp(-passes * best.footprint * flown))
  if (ideal < COVERAGE_TARGET)
    out.push(
      `Too few passes: this orbit (${orbit?.name}) crosses the pole ${passes} times a turn and the ${noun} sees a narrow strip each time. ` +
        `Even a perfect craft maps only ${ideal.toFixed(0)}% in ${flown} turns. It takes an orbit with more passes or an instrument with a wider view.`
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
      `The science instruments make ${made.toFixed(0)} MB a turn: ${(made * turns).toFixed(0)} MB in ${turns} turns, short of ${need} MB before anything goes wrong.`
    )
    if (b.scienceDuty < 1) out.push(`Power held them to ${Math.round(b.scienceDuty * 100)}% of the time they could run.`)
  }
  if (f.science.lost > 1) out.push(linkCause(state, b))
  if (b.projectedData >= need) out.push(...eventsThatCostScience(state))
  if (f.scienceTurns < turns) out.push(...whyShortLife(state, b))
  return out.length ? out : [BAD_LUCK]
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
      f.captured ? `Captured into the science orbit on turn ${f.captureTurn}.` : 'Never captured into lunar orbit.',
      () => whyNoCapture(state, b)),
    req('coverage', 'Ice Coverage', f.coverage >= COVERAGE_TARGET, COVERAGE_TARGET, Math.round(f.coverage * 10) / 10, '%',
      `${f.coverage.toFixed(1)}% of the south polar region mapped by an instrument that sees into shadow, with its data home.`,
      () => whyCoverageShort(state, b)),
    req('data', 'Science Data Return', f.data >= dataTarget, dataTarget, Math.round(f.data), 'MB',
      `${f.data.toFixed(0)} MB of science data on the ground.`,
      () => whyDataShort(state, b, dataTarget)),
    req('lifetime', 'Mission Lifetime', f.scienceTurns >= turnsNeeded, turnsNeeded, f.scienceTurns, 'turns',
      `${f.scienceTurns} turns in the science orbit.`,
      () => whyShortLife(state, b)),
    req('budget', 'Budget Compliance', f.reserve >= 0, 1, f.reserve >= 0 ? 1 : 0, '',
      f.reserve >= 0 ? `${moneyLeft.toFixed(1)} M left.` : `Reserve overdrawn by ${(-f.reserve).toFixed(2)} M.`,
      () => moneyDrains(state, b)),
  ]

  // Success level
  const allMet = requirements.every((r) => r.met)
  let outcome: Report['outcome']
  if (allMet) outcome = 'success'
  else if (f.captured && (f.coverage >= COVERAGE_TARGET * partialShare || f.data >= dataTarget * partialShare)) outcome = 'partial'
  else outcome = 'failed'

  const missed = requirements.filter((r) => !r.met).map((r) => r.name)
  const ending = f.end || 'mission over'
  const outcomeReason =
    outcome === 'success'
      ? 'All mission requirements met.'
      : `${ending.charAt(0).toUpperCase() + ending.slice(1)}. Missed: ${missed.join(', ')}.`

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
        // A failed mission uses up its whole budget: no points for money left (Jakob, 14 Nov)
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

/**
 * Get outcome emoji for display.
 */
export function getOutcomeEmoji(outcome: 'success' | 'partial' | 'failed'): string {
  switch (outcome) {
    case 'success':
      return '' // No emoji per instructions
    case 'partial':
      return ''
    case 'failed':
      return ''
  }
}

/**
 * Get a letter grade from score.
 */
export function getGrade(score: number): string {
  if (score >= 900) return 'A+'
  if (score >= 850) return 'A'
  if (score >= 800) return 'A-'
  if (score >= 750) return 'B+'
  if (score >= 700) return 'B'
  if (score >= 650) return 'B-'
  if (score >= 600) return 'C+'
  if (score >= 550) return 'C'
  if (score >= 500) return 'C-'
  if (score >= 400) return 'D'
  return 'F'
}
