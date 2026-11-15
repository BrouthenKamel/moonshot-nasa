import type { Budgets, CheckResult, GoNoGoResult } from '../sim/types'
import type { MissionBrief } from '../data/brief'
import { modelConstants as C } from '../data/brief'
import { firstSentence } from './checkMargin'

/**
 * The quest log: the brief's five requirements, each read off the model's own
 * budgets and Go/No-Go checks. Nothing here recomputes physics; it only sorts
 * existing output into a verdict, a plain-English line and an engineer's line.
 */

export type QuestVerdict = 'on-track' | 'at-risk' | 'blocked'
export type QuestId = 'capture' | 'coverage' | 'data' | 'lifetime' | 'reserve'

export interface Objective {
  id: QuestId
  label: string
  verdict: QuestVerdict
  /** Plain words for Story view */
  story: string
  /** The numbers behind the verdict, for Engineer view */
  eng: string
}

const target = (brief: MissionBrief, id: string, fallback: number) =>
  brief.requirements.find((r) => r.id === id)?.target ?? fallback

function find(checks: GoNoGoResult, resource: string): CheckResult | undefined {
  return checks.checks.find((c) => c.resource === resource)
}

const red = (c?: CheckResult) => c?.status === 'red'
const yellow = (c?: CheckResult) => c?.status === 'yellow'

/** The Delta-v check's own wording when the craft can capture but not hold the orbit (src/sim/checks.ts) */
const UPKEEP_ONLY = 'Enough to capture'
/** The Science check's own wording when nothing aboard sees into shadow (src/sim/checks.ts) */
const NO_SHADOW_EYE = 'can see into the shadowed craters'

export function objectives(b: Budgets, checks: GoNoGoResult, brief: MissionBrief): Objective[] {
  const months = brief.missionDurationTurns
  const coverageTarget = target(brief, 'coverage', 70)
  const dataTarget = target(brief, 'data', 300)
  const lifeTarget = target(brief, 'lifetime', months)

  const mass = find(checks, 'Mass')
  const volume = find(checks, 'Volume')
  const time = find(checks, 'Time')
  const dv = find(checks, 'Delta-v')
  const power = find(checks, 'Power')
  const comms = find(checks, 'Comms')
  const link = find(checks, 'Data Link')
  const budget = find(checks, 'Budget')
  const science = find(checks, 'Science')

  const fmt0 = (n: number) => n.toFixed(0)
  const dvEng = `capture ${b.captureDeltaV === null ? 'impossible' : `${fmt0(b.captureDeltaV)} m/s`} · tank ${fmt0(b.deltaVAvailable)} m/s`

  // 0.1 Reach lunar orbit: launch on time, fit the ride, and brake into orbit
  const dvCaptureFails = red(dv) && !(dv?.reason ?? '').startsWith(UPKEEP_ONLY)
  const captureSpare = b.captureDeltaV ? (b.deltaVAvailable - b.captureDeltaV) / b.captureDeltaV : 0
  let capture: Objective
  if (dvCaptureFails) {
    capture = { id: 'capture', label: 'Reach lunar orbit', verdict: 'blocked', story: 'It cannot brake into lunar orbit', eng: `${dvEng} · ${firstSentence(dv?.reason ?? '')}` }
  } else if (red(time)) {
    capture = { id: 'capture', label: 'Reach lunar orbit', verdict: 'blocked', story: 'It is not ready before the rocket leaves', eng: `ready month ${b.readyTurn} · ride month ${b.rideTurn}` }
  } else if (red(mass) || red(volume)) {
    capture = { id: 'capture', label: 'Reach lunar orbit', verdict: 'blocked', story: 'It does not fit on the ride', eng: `mass ${b.totalMass.toFixed(1)}/${b.massLimit} kg · volume ${b.totalVolume.toFixed(2)}/${b.volumeLimit} U` }
  } else if (yellow(time) || (yellow(dv) && captureSpare < C.greenMargin)) {
    capture = {
      id: 'capture',
      label: 'Reach lunar orbit',
      verdict: 'at-risk',
      story: yellow(time) ? 'Ready with no slack before the rocket leaves' : 'Barely enough fuel to brake into orbit',
      eng: `${dvEng} · ready month ${b.readyTurn} / ride month ${b.rideTurn}`,
    }
  } else {
    capture = { id: 'capture', label: 'Reach lunar orbit', verdict: 'on-track', story: 'Enough fuel to brake into orbit', eng: `${dvEng} · arrives month ${b.arrivalTurn ?? '-'}` }
  }
  const noOrbit = capture.verdict === 'blocked'

  // 0.2 Map the polar ice: an instrument that sees into shadow, and a link that brings the map home
  const covEng = `projected ${fmt0(b.projectedCoverage)}% of ${coverageTarget}% in ${months} clean months`
  let coverage: Objective
  if ((science?.reason ?? '').includes(NO_SHADOW_EYE)) {
    coverage = { id: 'coverage', label: `Map ${coverageTarget}% of the polar ice`, verdict: 'blocked', story: 'Nothing aboard sees into the dark craters', eng: covEng }
  } else if (noOrbit) {
    coverage = { id: 'coverage', label: `Map ${coverageTarget}% of the polar ice`, verdict: 'blocked', story: 'No map without reaching orbit first', eng: covEng }
  } else if (red(comms) || red(link)) {
    coverage = { id: 'coverage', label: `Map ${coverageTarget}% of the polar ice`, verdict: 'blocked', story: 'The map never gets home', eng: `${covEng} · downlink ${fmt0(b.downlinkPerTurn)} MB/month` }
  } else if (b.projectedCoverage < coverageTarget) {
    coverage = { id: 'coverage', label: `Map ${coverageTarget}% of the polar ice`, verdict: 'at-risk', story: 'The map falls short of the target', eng: covEng }
  } else if (yellow(link)) {
    coverage = { id: 'coverage', label: `Map ${coverageTarget}% of the polar ice`, verdict: 'at-risk', story: 'Some of the map may be lost on the way home', eng: `${covEng} · link ${fmt0(b.downlinkPerTurn)} of ${fmt0(b.dataPerTurn)} MB/month` }
  } else {
    coverage = { id: 'coverage', label: `Map ${coverageTarget}% of the polar ice`, verdict: 'on-track', story: 'It sees into the dark craters', eng: covEng }
  }

  // 0.3 Bring the data home
  const dataEng = `projected ${fmt0(b.projectedData)} of ${dataTarget} MB · link ${fmt0(b.downlinkPerTurn)} MB/month`
  let data: Objective
  if (noOrbit) {
    data = { id: 'data', label: `Bring ${dataTarget} MB home`, verdict: 'blocked', story: 'No science without reaching orbit first', eng: dataEng }
  } else if (red(comms) || red(link)) {
    data = { id: 'data', label: `Bring ${dataTarget} MB home`, verdict: 'blocked', story: red(comms) ? 'The radio cannot reach Earth' : 'Nothing can be sent home', eng: `${dataEng} · ${firstSentence((red(comms) ? comms : link)?.reason ?? '')}` }
  } else if (b.projectedData < dataTarget) {
    data = { id: 'data', label: `Bring ${dataTarget} MB home`, verdict: 'at-risk', story: 'Less data comes home than the brief asks', eng: dataEng }
  } else if (yellow(link) || yellow(comms)) {
    data = { id: 'data', label: `Bring ${dataTarget} MB home`, verdict: 'at-risk', story: 'The link home is tight', eng: dataEng }
  } else {
    data = { id: 'data', label: `Bring ${dataTarget} MB home`, verdict: 'on-track', story: 'The link carries everything home', eng: dataEng }
  }

  // 0.4 Operate a full year in orbit: fuel to hold the orbit, power through the eclipses
  const lifeEng = `fuel for ${b.upkeepTurns} months of upkeep (need ${lifeTarget}) · power ${b.powerConsumed.toFixed(1)}/${b.powerGenerated.toFixed(1)} W`
  let lifetime: Objective
  if (noOrbit) {
    lifetime = { id: 'lifetime', label: `Operate ${lifeTarget} months`, verdict: 'blocked', story: 'It never reaches orbit to start the clock', eng: lifeEng }
  } else if (red(dv)) {
    lifetime = { id: 'lifetime', label: `Operate ${lifeTarget} months`, verdict: 'blocked', story: 'Fuel runs out before the year is up', eng: lifeEng }
  } else if (red(power)) {
    lifetime = { id: 'lifetime', label: `Operate ${lifeTarget} months`, verdict: 'blocked', story: 'Power runs out in the dark', eng: `${lifeEng} · ${firstSentence(power?.reason ?? '')}` }
  } else if (yellow(dv)) {
    lifetime = { id: 'lifetime', label: `Operate ${lifeTarget} months`, verdict: 'at-risk', story: 'Little fuel to spare for the year', eng: lifeEng }
  } else if (yellow(power)) {
    lifetime = { id: 'lifetime', label: `Operate ${lifeTarget} months`, verdict: 'at-risk', story: 'Power is tight: science pauses at times', eng: `${lifeEng} · ${firstSentence(power?.reason ?? '')}` }
  } else {
    lifetime = { id: 'lifetime', label: `Operate ${lifeTarget} months`, verdict: 'on-track', story: 'Fuel and power last the year', eng: lifeEng }
  }

  // 0.5 Keep the reserve intact: the plan must fit in what is spendable
  const left = b.spendable - b.totalCost
  const resEng = `cost ${b.totalCost.toFixed(1)} of ${b.spendable.toFixed(1)} M spendable · reserve ${b.reserveAmount.toFixed(1)} M`
  let reserve: Objective
  if (red(budget)) {
    reserve = { id: 'reserve', label: 'Keep the reserve intact', verdict: 'blocked', story: 'The plan eats into the reserve', eng: resEng }
  } else if (b.reserveAmount <= 0) {
    reserve = { id: 'reserve', label: 'Keep the reserve intact', verdict: 'at-risk', story: 'No money held back for surprises', eng: resEng }
  } else {
    reserve = { id: 'reserve', label: 'Keep the reserve intact', verdict: 'on-track', story: 'Money held back for fixes in flight', eng: `${resEng} · +${left.toFixed(1)} M left` }
  }

  return [capture, coverage, data, lifetime, reserve]
}

/** The objectives that a hover preview would move to another verdict, by id */
export function verdictChanges(now: Objective[], next: Objective[] | null): Partial<Record<QuestId, QuestVerdict>> {
  if (!next) return {}
  const out: Partial<Record<QuestId, QuestVerdict>> = {}
  for (const o of now) {
    const n = next.find((x) => x.id === o.id)
    if (n && n.verdict !== o.verdict) out[o.id] = n.verdict
  }
  return out
}

/** Overall stamp for the quest log, from the Go/No-Go result */
export function stampVerdict(checks: GoNoGoResult): { verdict: 'go' | 'caution' | 'nogo'; text: string } {
  if (!checks.canGo) return { verdict: 'nogo', text: 'NO-GO' }
  if (checks.warnings.length > 0) return { verdict: 'caution', text: 'GO WITH CAUTIONS' }
  return { verdict: 'go', text: 'GO' }
}
