import { difficultyPresets, lunarIceMapperBrief, scoreWeights } from '../data/brief'
import { computeBudgets } from './budgets'
import type {
  SimState,
  Report,
  RequirementResult,
  ScoreBreakdown,
  ChangeHint,
} from './types'

/**
 * Build the final mission report from simulation state.
 */
export function buildReport(state: SimState): Report {
  const budgets = computeBudgets(state.design, state.difficulty)
  const preset = difficultyPresets[state.difficulty]
  const brief = lunarIceMapperBrief

  // Evaluate each requirement
  const requirements: RequirementResult[] = []

  // 1. Capture into orbit
  requirements.push({
    id: 'capture',
    name: 'Lunar Orbit Insertion',
    met: state.capturedIntoOrbit,
    target: 1,
    actual: state.capturedIntoOrbit ? 1 : 0,
    unit: '',
    reason: state.capturedIntoOrbit
      ? 'Successfully captured into lunar polar orbit.'
      : state.failureReason ?? 'Failed to capture into lunar orbit.',
    traceToDecision: state.capturedIntoOrbit
      ? undefined
      : 'Check propulsion system and transfer trajectory.',
  })

  // 2. Coverage
  const coverageTarget = 70
  const coverageMet = state.coveragePercent >= coverageTarget
  requirements.push({
    id: 'coverage',
    name: 'South Polar Coverage',
    met: coverageMet,
    target: coverageTarget,
    actual: Math.round(state.coveragePercent),
    unit: '%',
    reason: coverageMet
      ? `Achieved ${state.coveragePercent.toFixed(0)}% coverage of the south polar region.`
      : `Only achieved ${state.coveragePercent.toFixed(0)}% coverage. ${coverageTarget}% required.`,
    traceToDecision: coverageMet
      ? undefined
      : 'Consider a lower orbit for faster coverage, or longer mission duration.',
  })

  // 3. Data return
  const dataTarget = preset.dataTarget
  const dataMet = state.totalDataReturned >= dataTarget
  requirements.push({
    id: 'data',
    name: 'Science Data Return',
    met: dataMet,
    target: dataTarget,
    actual: parseFloat(state.totalDataReturned.toFixed(1)),
    unit: 'GB',
    reason: dataMet
      ? `Returned ${state.totalDataReturned.toFixed(1)} GB of science data.`
      : `Only returned ${state.totalDataReturned.toFixed(1)} GB. Target was ${dataTarget} GB.`,
    traceToDecision: dataMet
      ? undefined
      : state.totalDataLost > 0
        ? `Lost ${state.totalDataLost.toFixed(1)} GB due to insufficient downlink capacity.`
        : 'Consider higher data rate instruments or better ground station.',
  })

  // 4. Mission lifetime
  const lifetimeTarget = brief.missionDurationTurns
  const lifetimeMet = state.turnsInOrbit >= lifetimeTarget
  requirements.push({
    id: 'lifetime',
    name: 'Mission Lifetime',
    met: lifetimeMet,
    target: lifetimeTarget,
    actual: state.turnsInOrbit,
    unit: 'turns',
    reason: lifetimeMet
      ? `Operated for ${state.turnsInOrbit} months in lunar orbit.`
      : `Mission ended after ${state.turnsInOrbit} months. ${lifetimeTarget} required.`,
    traceToDecision: lifetimeMet
      ? undefined
      : state.contactLost
        ? 'Communication lost. Consider redundant computer or higher reliability radio.'
        : 'Mission ended prematurely.',
  })

  // 5. Budget
  const budgetMet = budgets.budgetMargin >= 0
  requirements.push({
    id: 'budget',
    name: 'Budget Compliance',
    met: budgetMet,
    target: preset.budgetCap,
    actual: parseFloat(budgets.totalCost.toFixed(1)),
    unit: '$M',
    reason: budgetMet
      ? `Mission cost $${budgets.totalCost.toFixed(1)}M, within $${preset.budgetCap}M cap.`
      : `Mission cost $${budgets.totalCost.toFixed(1)}M, exceeding $${preset.budgetCap}M cap by $${(-budgets.budgetMargin).toFixed(1)}M.`,
    traceToDecision: budgetMet
      ? undefined
      : 'Choose cheaper parts or a lower-cost ride.',
  })

  // Calculate outcome
  const criticalRequirements = requirements.filter(
    (r) => r.id === 'capture' || r.id === 'lifetime'
  )
  const criticalMet = criticalRequirements.every((r) => r.met)
  const allMet = requirements.every((r) => r.met)

  let outcome: 'success' | 'partial' | 'failed'
  let outcomeReason: string

  if (!state.capturedIntoOrbit) {
    outcome = 'failed'
    outcomeReason = 'Failed to capture into lunar orbit. No science data returned.'
  } else if (state.contactLost) {
    outcome = 'failed'
    outcomeReason = 'Lost contact with spacecraft before mission completion.'
  } else if (allMet) {
    outcome = 'success'
    outcomeReason = 'All mission requirements met. Full success!'
  } else if (criticalMet) {
    outcome = 'partial'
    const missed = requirements.filter((r) => !r.met).map((r) => r.name)
    outcomeReason = `Partial success. Missed: ${missed.join(', ')}.`
  } else {
    outcome = 'failed'
    outcomeReason = 'Critical requirements not met.'
  }

  // Calculate score
  const score = calculateScore(state, requirements, budgets)

  // Generate improvement hints
  const hints = generateHints(state, requirements, budgets)

  // Count events handled well
  const eventsHandledWell = state.allEvents.filter((e) => e.choiceSucceeded).length

  return {
    outcome,
    outcomeReason,

    requirements,
    requirementsMet: requirements.filter((r) => r.met).length,
    requirementsTotal: requirements.length,

    score,

    totalCost: budgets.totalCost,
    dataReturned: state.totalDataReturned,
    coverageAchieved: state.coveragePercent,
    turnsInOrbit: state.turnsInOrbit,
    eventsEncountered: state.allEvents.length,
    eventsHandledWell,

    playerMass: budgets.totalMass,
    playerCost: budgets.totalCost,

    hints,

    design: state.design,
    difficulty: state.difficulty,
    timestamp: Date.now(),
  }
}

/**
 * Calculate score breakdown.
 */
function calculateScore(
  state: SimState,
  requirements: RequirementResult[],
  budgets: ReturnType<typeof computeBudgets>
): ScoreBreakdown {
  // Requirements score (600 points)
  const reqMet = requirements.filter((r) => r.met).length
  const reqTotal = requirements.length
  const requirementsScore = Math.round((reqMet / reqTotal) * scoreWeights.requirements)

  // Science score (200 points) - based on data returned and coverage
  const dataRatio = Math.min(
    1,
    state.totalDataReturned / difficultyPresets[state.difficulty].dataTarget
  )
  const coverageRatio = Math.min(1, state.coveragePercent / 100)
  const scienceScore = Math.round(((dataRatio + coverageRatio) / 2) * scoreWeights.science)

  // Efficiency score (100 points) - based on cost efficiency
  const budgetUsed = budgets.totalCost / budgets.budgetCap
  const efficiencyRatio = state.capturedIntoOrbit
    ? Math.min(1, Math.max(0, 1 - (budgetUsed - 0.7))) // Bonus for coming in under budget, capped at 1
    : 0
  const efficiencyScore = Math.round(efficiencyRatio * scoreWeights.efficiency)

  // Risk handling score (100 points) - based on surviving events
  const eventsEncountered = state.allEvents.length
  const eventsHandledWell = state.allEvents.filter((e) => e.choiceSucceeded).length
  const riskRatio =
    eventsEncountered > 0 ? eventsHandledWell / eventsEncountered : 1
  const riskScore = Math.round(riskRatio * scoreWeights.riskHandling)

  return {
    requirements: requirementsScore,
    science: scienceScore,
    efficiency: efficiencyScore,
    riskHandling: riskScore,
    total: requirementsScore + scienceScore + efficiencyScore + riskScore,
  }
}

/**
 * Generate improvement hints based on results.
 */
function generateHints(
  state: SimState,
  requirements: RequirementResult[],
  budgets: ReturnType<typeof computeBudgets>
): ChangeHint[] {
  const hints: ChangeHint[] = []

  // Check for capture failure
  if (!state.capturedIntoOrbit) {
    hints.push({
      area: 'Propulsion',
      suggestion:
        'Consider more fuel (larger propulsion system) or a low-energy transfer to reduce delta-v needs.',
      priority: 'high',
    })
  }

  // Check for data issues
  const dataReq = requirements.find((r) => r.id === 'data')
  if (dataReq && !dataReq.met) {
    if (state.totalDataLost > 1) {
      hints.push({
        area: 'Communications',
        suggestion:
          'Data was lost due to downlink bottleneck. Consider a higher-gain antenna or DSN ground station.',
        priority: 'high',
      })
    } else {
      hints.push({
        area: 'Instruments',
        suggestion: 'Add more instruments or choose higher data-rate options.',
        priority: 'medium',
      })
    }
  }

  // Check for coverage issues
  const coverageReq = requirements.find((r) => r.id === 'coverage')
  if (coverageReq && !coverageReq.met) {
    hints.push({
      area: 'Orbit',
      suggestion:
        'Try a lower orbit for faster coverage, or extend mission duration.',
      priority: 'medium',
    })
  }

  // Check for budget issues
  const budgetReq = requirements.find((r) => r.id === 'budget')
  if (budgetReq && !budgetReq.met) {
    hints.push({
      area: 'Budget',
      suggestion:
        'Choose less expensive parts or ground station. Consider body-mounted solar panels.',
      priority: 'high',
    })
  }

  // Check for close calls
  if (budgets.deltaVMargin < 200 && state.capturedIntoOrbit) {
    hints.push({
      area: 'Fuel Margin',
      suggestion: 'Delta-v margin was tight. Consider more propellant for reliability.',
      priority: 'low',
    })
  }

  if (budgets.powerMargin < 10) {
    hints.push({
      area: 'Power',
      suggestion: 'Power margin is low. May struggle in non-optimal sun angles.',
      priority: 'low',
    })
  }

  return hints
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
