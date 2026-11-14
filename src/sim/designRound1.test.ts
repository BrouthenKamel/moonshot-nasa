import { describe, it, expect } from 'vitest'
import { computeBudgets } from './budgets'
import { goNoGo } from './checks'
import { initSim, stepTurn, getDefaultAction, isSimComplete, isMilestone, runSimulation } from './simulate'
import { buildReport } from './evaluate'
import { flashlightDesign, lunahMapDesign, iceCubeDesign } from './fixtures'
import { scoreWeights } from '../data/brief'
import type { Design } from './types'

const check = (d: Design, resource: string) =>
  goNoGo(d, computeBudgets(d, 'engineer')).checks.find((c) => c.resource === resource)!

// Jakob, 14 Nov: agreed design round 1 (reserve, score, mass warning, flight pacing)
describe('design round 1', () => {
  it('the reserve line is a hard limit: a plan that spends into the reserve cannot launch', () => {
    const b = computeBudgets(flashlightDesign, 'engineer')
    // A reserve just big enough that the plan reaches into it, while still under the cap
    const reservePercent = Math.ceil(((b.budgetCap - b.totalCost) / b.budgetCap) * 100) + 1
    const d = { ...flashlightDesign, planning: { ...flashlightDesign.planning, reservePercent } }
    const db = computeBudgets(d, 'engineer')
    expect(db.totalCost).toBeLessThan(db.budgetCap)
    expect(db.totalCost).toBeGreaterThan(db.spendable)
    const r = goNoGo(d, db)
    const budget = r.checks.find((c) => c.resource === 'Budget')!
    expect(budget.status).toBe('red')
    expect(budget.reason).toContain('reserve')
    expect(r.canGo).toBe(false)
  })

  it('the reference designs still fly with their reserve', () => {
    for (const d of [flashlightDesign, lunahMapDesign, iceCubeDesign]) expect(check(d, 'Budget').status).toBe('green')
  })

  it('data and lifetime points scale with the ice mapped, so a craft that maps no ice scores little', () => {
    let checked = 0
    for (let seed = 1; seed < 30; seed++) {
      const r = buildReport(runSimulation(iceCubeDesign, 'engineer', seed))
      const cov = r.requirements.find((q) => q.id === 'coverage')!
      const share = Math.min(1, cov.actual / cov.target)
      expect(r.score.data).toBeLessThanOrEqual(Math.round(scoreWeights.data * share) + 1)
      expect(r.score.lifetime).toBeLessThanOrEqual(Math.round(scoreWeights.lifetime * share) + 1)
      if (r.requirements[0].met) checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('the mass bar warns below 8% spare, not 15%', () => {
    for (const d of [flashlightDesign, lunahMapDesign, iceCubeDesign]) {
      const b = computeBudgets(d, 'engineer')
      const share = b.massMargin / b.massLimit
      const expected = share >= 0.08 ? 'green' : share >= 0 ? 'yellow' : 'red'
      expect(check(d, 'Mass').status).toBe(expected)
    }
    // 10% spare is green now
    const b = computeBudgets(iceCubeDesign, 'engineer')
    expect(b.massMargin / b.massLimit).toBeGreaterThan(0.08)
    expect(check(iceCubeDesign, 'Mass').status).toBe('green')
  })

  it('projects no science when the craft cannot get to the Moon (ion engine without thrust power)', () => {
    const d: Design = { ...lunahMapDesign, solar: 'solar-1wing' }
    const b = computeBudgets(d, 'engineer')
    expect(b.thrustLevel).toBe(0)
    expect(b.projectedCoverage).toBe(0)
    expect(check(d, 'Science').status).not.toBe('green')
  })

  it('a milestone is a phase change, an event, a decision or the end; quiet turns are not', () => {
    let s = initSim(flashlightDesign, 'engineer', 2)
    const phases: string[] = []
    let quiet = 0
    for (let i = 0; i < 80 && !isSimComplete(s) && !s.pendingDecision; i++) {
      const next = stepTurn(s, getDefaultAction())
      const log = next.turnLogs[next.turnLogs.length - 1]
      const expected = next.phase !== s.phase || log.events.length > 0 || !!next.pendingDecision || isSimComplete(next)
      expect(isMilestone(s, next)).toBe(expected)
      if (!expected) quiet++
      if (next.phase !== s.phase) phases.push(next.phase)
      s = next
    }
    expect(quiet).toBeGreaterThan(0)
    expect(phases.length).toBeGreaterThan(1)
  })
})
