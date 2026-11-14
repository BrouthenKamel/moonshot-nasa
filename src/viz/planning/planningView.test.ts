import { describe, it, expect } from 'vitest'
import { buildPlanningView } from './planningView'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign } from '../../sim/fixtures'
import type { Budgets, CheckResult, Design } from '../../sim/types'

function viewFor(design: Design, patch: Partial<Budgets> = {}, checks?: CheckResult[]) {
  const budgets = { ...computeBudgets(design, 'engineer'), ...patch }
  return { budgets, view: buildPlanningView(design, budgets, checks ?? goNoGo(design, budgets).checks) }
}

const chk = (resource: string, status: CheckResult['status']): CheckResult => ({
  resource, status, value: 0, limit: 0, margin: 0, unit: '', reason: '',
})

function allNumbers(o: unknown, out: number[] = []): number[] {
  if (typeof o === 'number') out.push(o)
  else if (o && typeof o === 'object') for (const v of Object.values(o)) allNumbers(v, out)
  return out
}

describe('buildPlanningView', () => {
  it('cost blocks add up to the total cost and are never negative', () => {
    for (const design of [flashlightDesign, createDefaultDesign()]) {
      const { budgets, view } = viewFor(design)
      const sum = view.costBlocks.reduce((s, b) => s + b.amount, 0)
      expect(sum).toBeCloseTo(budgets.totalCost, 9)
      expect(view.costBlocks.every((b) => b.amount >= 0)).toBe(true)
      expect(view.totalCost).toBe(budgets.totalCost)
    }
  })

  it('adds an Other block only when the named costs miss the total', () => {
    const { view } = viewFor(flashlightDesign)
    const named = view.costBlocks.filter((b) => b.key !== 'other').reduce((s, b) => s + b.amount, 0)
    const other = view.costBlocks.find((b) => b.key === 'other')
    if (Math.abs(view.totalCost - named) > 0.005) expect(other).toBeDefined()
    else expect(other).toBeUndefined()
  })

  it('reads reserve and spendable straight from the budgets', () => {
    const { budgets, view } = viewFor(flashlightDesign)
    expect(view.reserve).toBe(budgets.reserveAmount)
    expect(view.spendable).toBe(budgets.spendable)
    expect(view.cap).toBe(budgets.budgetCap)
  })

  it('timeline ends on the ready turn and drops the test block at 0 test turns', () => {
    const { budgets, view } = viewFor(flashlightDesign)
    const last = view.timeline[view.timeline.length - 1]
    expect(last.start + last.length).toBe(budgets.readyTurn)
    const untested = { ...flashlightDesign, planning: { ...flashlightDesign.planning, testTurns: 0 } }
    expect(viewFor(untested).view.timeline.some((b) => b.key === 'test')).toBe(false)
  })

  it('headline follows the time margin', () => {
    const at = (readyTurn: number) => viewFor(flashlightDesign, { readyTurn, rideTurn: 8, timeMarginTurns: 8 - readyTurn }).view.headline
    expect(at(6)).toBe('2 MONTHS SPARE')
    expect(at(7)).toBe('1 MONTH SPARE')
    expect(at(8)).toBe('NO SPARE TIME')
    expect(at(9)).toBe('MISSED BY 1 MONTH')
    expect(at(10)).toBe('MISSED BY 2 MONTHS')
  })

  it('risk caption follows the test factor', () => {
    const cap = (testFactor: number) => viewFor(flashlightDesign, { testFactor }).view.riskCaption
    expect(cap(2.0)).toBe('failures in flight more likely')
    expect(cap(1.4)).toBe('failures in flight more likely')
    expect(cap(1.0)).toBe('normal odds of failure in flight')
    expect(cap(0.7)).toBe('failures in flight less likely')
  })

  it('room status follows the table in the design', () => {
    const d = flashlightDesign
    const status = (checks: CheckResult[], planning = d.planning) =>
      viewFor({ ...d, planning }, {}, checks).view.status
    const ok = [chk('Time', 'green'), chk('Budget', 'green')]
    expect(status([chk('Time', 'red'), chk('Budget', 'red')])).toEqual({ level: 'alert', chip: 'RIDE MISSED' })
    expect(status([chk('Time', 'green'), chk('Budget', 'red')])).toEqual({ level: 'caution', chip: 'OVER BUDGET' })
    expect(status(ok, { ...d.planning, testTurns: 0 })).toEqual({ level: 'caution', chip: 'CAUTION: UNTESTED' })
    expect(status(ok, { ...d.planning, testTurns: 2, reservePercent: 0 })).toEqual({ level: 'caution', chip: 'CAUTION: NO RESERVE' })
    expect(status([chk('Time', 'yellow'), chk('Budget', 'green')], { ...d.planning, testTurns: 2, reservePercent: 10 }))
      .toEqual({ level: 'caution', chip: 'CAUTION: NO SPARE TIME' })
    expect(status([chk('Time', 'green'), chk('Budget', 'yellow')], { ...d.planning, testTurns: 2, reservePercent: 10 }))
      .toEqual({ level: 'caution', chip: 'CAUTION: EATING THE RESERVE' })
    expect(status([...ok, chk('Mass', 'red')], { ...d.planning, testTurns: 2, reservePercent: 10 }))
      .toEqual({ level: 'nominal', chip: 'ALL NOMINAL' })
  })

  it('budget state: free, eating the reserve, over the cap', () => {
    const base = computeBudgets(flashlightDesign, 'engineer')
    const st = (totalCost: number) => viewFor(flashlightDesign, { totalCost, budgetCap: 25, spendable: 22.5, reserveAmount: 2.5 }).view
    expect(st(20).budgetState).toBe('free')
    expect(st(20).budgetGap).toBeCloseTo(2.5)
    expect(st(23).budgetState).toBe('eating')
    expect(st(23).budgetGap).toBeCloseTo(0.5)
    expect(st(27).budgetState).toBe('over')
    expect(st(27).budgetGap).toBeCloseTo(2)
    expect(base).toBeDefined()
  })

  it('pins the meter at 6 and stretches the timeline for long plans', () => {
    const { view } = viewFor(flashlightDesign, { buildTurns: 9, readyTurn: 12, rideTurn: 8, timeMarginTurns: -4 })
    expect(view.meterValue).toBe(6)
    expect(view.readouts.build).toBe('9 MO · SET AT THE FACTORY')
    expect(view.monthCount).toBe(13)
  })

  it('readouts use months and dollars', () => {
    const p = { ...flashlightDesign.planning, testTurns: 2, reservePercent: 10 }
    const { view, budgets } = viewFor({ ...flashlightDesign, planning: p })
    expect(view.readouts.test).toBe('2 MONTHS · $0.8M')
    expect(view.readouts.reserve).toBe(`10% · $${budgets.reserveAmount.toFixed(1)}M LOCKED`)
    const one = viewFor({ ...flashlightDesign, planning: { ...p, testTurns: 1 } }).view
    expect(one.readouts.test).toBe('1 MONTH · $0.4M')
  })

  it('carries the Time and Budget checks with goNoGo reasons, in that order', () => {
    const { budgets, view } = viewFor(flashlightDesign)
    const real = goNoGo(flashlightDesign, budgets).checks
    expect(view.checks.map((c) => c.resource)).toEqual(['Time', 'Budget'])
    for (const c of view.checks) {
      const src = real.find((r) => r.resource === c.resource)!
      expect(c.status).toBe(src.status)
      expect(c.reason).toBe(src.reason)
      expect(c.reason.length).toBeGreaterThan(0)
    }
    const missing = viewFor(flashlightDesign, {}, []).view.checks
    expect(missing).toEqual([
      { resource: 'Time', status: 'green', reason: '' },
      { resource: 'Budget', status: 'green', reason: '' },
    ])
  })

  it('stays finite with no flight costs and no way to the Moon', () => {
    const { view } = viewFor(flashlightDesign, { operationsCost: 0, transferTurns: null, arrivalTurn: null })
    expect(allNumbers(view).every(Number.isFinite)).toBe(true)
  })
})
