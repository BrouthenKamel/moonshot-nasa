import type { BuildingId } from '../../data/agency'
import type { DesignStep, Report } from '../../sim/types'
import { STEP_NAMES, buildingForStep, buildingName } from '../../viz/missionMap'

/**
 * The fix-it loop after a failed or partial mission: the report's why-lines
 * (from buildReport) turned into the one or two decisions that caused the
 * miss, each with the building and step where the player changes it.
 *
 * Pure view: no mission maths, only the core's own sentences sorted by the
 * decision they name. A line that names no decision (bad luck, "the craft
 * never reached its orbit", "the money ran out on month 9") is skipped.
 */

export interface FixCause {
  /** The decision, in a few plain words, e.g. "Instrument choice" */
  decision: string
  /** The report's own sentence that names it */
  why: string
  step: DesignStep
  building: BuildingId
  /** "Research Lab" */
  buildingName: string
  /** What to do there, when the step alone does not say it, e.g. "hold back a reserve" */
  action?: string
}

interface Rule {
  match: RegExp
  decision: string
  step: DesignStep
  action?: string
}

/** The one link after "Accept the loss" ended a mission for want of a reserve */
export const RESERVE_FIX = { step: 'planning' as DesignStep, action: 'hold back a reserve' }

/** "Fix at Plan: hold back a reserve" when the cause names an action, otherwise "Fix at Research Lab" */
export function fixLabel(c: Pick<FixCause, 'step' | 'action' | 'buildingName'>): string {
  return c.action ? `Fix at ${STEP_NAMES[c.step]}: ${c.action}` : `Fix at ${c.buildingName}`
}

/**
 * First match wins, so the more specific sentences come first. The patterns
 * key on the decision a sentence names, not on its numbers, so small
 * rewordings of the why-lines keep working.
 */
const RULES: Rule[] = [
  // Instruments
  { match: /cannot see into the shadowed craters/i, decision: 'Instrument choice', step: 'instruments' },
  { match: /outreach pictures|do not count as science data/i, decision: 'Instrument choice', step: 'instruments' },
  { match: /science instruments make .* short of/i, decision: 'Instrument choice', step: 'instruments' },
  { match: /no IR spectrometer on board/i, decision: 'Instrument choice', step: 'instruments' },
  { match: /crowded out the ice data/i, decision: 'Instrument choice', step: 'instruments' },
  // Orbit
  { match: /^Too high\b|only works below \d+ km/i, decision: 'Orbit height', step: 'orbit' },
  { match: /^Too few passes|crosses the pole .* times/i, decision: 'Orbit choice', step: 'orbit' },
  { match: /no way into the chosen orbit/i, decision: 'Engine, ride and orbit', step: 'orbit' },
  // Comms
  { match: /never got home|link carried/i, decision: 'Downlink (contact time, ground dish, radio)', step: 'comms' },
  { match: /ground station outages/i, decision: 'Ground station', step: 'comms' },
  // Spacecraft
  { match: /without precise pointing/i, decision: 'Pointing (attitude control)', step: 'spacecraft' },
  { match: /too little power|power held them/i, decision: 'Power (solar array)', step: 'spacecraft' },
  { match: /radiation resets/i, decision: 'Flight computer', step: 'spacecraft' },
  { match: /long eclipses|drained the battery/i, decision: 'Battery', step: 'spacecraft' },
  { match: /propellant ran out|m\/s was left at the Moon|carry more propellant/i, decision: 'Propellant', step: 'spacecraft' },
  { match: /weak thruster/i, decision: 'Thruster', step: 'spacecraft' },
  { match: /plan already cost/i, decision: 'Cost of the parts', step: 'spacecraft' },
  // Ride and transfer
  { match: /electric transfer cost/i, decision: 'Transfer', step: 'ride' },
  { match: /reached orbit too late/i, decision: 'Ride and transfer', step: 'ride' },
  // Planning
  // Before the deployment-loss rule below: with no reserve, the reserve is what to fix (QC, 15 Nov)
  { match: /no reserve/i, decision: 'Reserve', step: 'planning', action: RESERVE_FIX.action },
  { match: /test turn|test month|testing|more test/i, decision: 'Testing time', step: 'planning' },
  { match: /lost right after deployment/i, decision: 'Testing time', step: 'planning' },
  { match: /missing the ride|missed \d+ ride|slack in the schedule/i, decision: 'Schedule slack', step: 'planning' },
]

/** The decision a report sentence names, or null when it names none */
export function classifyCause(line: string): Omit<FixCause, 'why' | 'building' | 'buildingName'> | null {
  const rule = RULES.find((r) => r.match.test(line))
  return rule ? { decision: rule.decision, step: rule.step, ...(rule.action ? { action: rule.action } : {}) } : null
}

/**
 * The 1-2 decisions behind a failed or partial mission, most important first:
 * the missed requirements in the report's order (capture, coverage, data,
 * lifetime, budget), each walked along its chain of causes; the score notes
 * ("What cost you points") when those name none. One entry per step, so two
 * buttons never open the same place. A successful mission has nothing to fix.
 */
export function topCauses(report: Report, max = 2): FixCause[] {
  if (report.outcome === 'success') return []
  const fromRequirements = pick(
    report.requirements.filter((r) => !r.met).flatMap((r) => r.causes ?? []),
    max
  )
  // The score notes also list missed bonuses (the sunlit-ground map); they only
  // speak when the missed requirements name no decision
  return fromRequirements.length ? fromRequirements : pick(report.scoreNotes ?? [], max)
}

function pick(lines: string[], max: number): FixCause[] {
  const out: FixCause[] = []
  for (const line of lines) {
    if (out.length >= max) break
    const found = classifyCause(line)
    if (!found || out.some((c) => c.step === found.step)) continue
    const building = buildingForStep(found.step)
    out.push({ ...found, why: line, building, buildingName: buildingName(building) })
  }
  return out
}
