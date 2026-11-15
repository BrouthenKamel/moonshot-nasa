import { describe, it, expect } from 'vitest'
import { buildReport, FAILED_SCORE_CAP } from './evaluate'
import { computeBudgets } from './budgets'
import { runSimulation } from './simulate'
import { archetypes } from './fixtures'
import { gradeFor } from '../ui/report/grade'
import { approveMission, initialWorld, missionTurned, type MissionSnapshot } from '../game/world'
import { missionResult } from '../game/result'
import type { SimState } from './types'

/**
 * A failed mission (Jakob, 15 Nov): it burns its whole budget like a real agency's mission,
 * and its grade never praises it (at most a C).
 */

/** A strong flight: maps nearly all the ice (850 points before the cap) */
const strong = runSimulation({ ...archetypes.ambitious, planning: { ...archetypes.ambitious.planning, reservePercent: 0 }, contactHours: 1 }, 'engineer', 6)
const endedAs = (end: string, patch: Partial<SimState['flight']> = {}): SimState => ({
  ...strong,
  phase: 'failed',
  flight: { ...strong.flight, end, alive: false, ...patch },
})

describe('a failed mission never gets a praising grade', () => {
  it('the cap is the top of a C', () => {
    expect(gradeFor(FAILED_SCORE_CAP)).toBe('C')
    expect(gradeFor(FAILED_SCORE_CAP + 1)).not.toBe('C')
  })

  it('budget ran out in orbit: capped at C, and the report says why', () => {
    const r = buildReport(strong)
    expect(strong.flight.end).toBe('budget ran out in orbit')
    expect(r.outcome).toBe('failed')
    expect(r.score.total).toBe(FAILED_SCORE_CAP)
    expect(gradeFor(r.score.total)).toBe('C')
    expect(r.scoreNotes[0]).toMatch(/^Capped at 599 \(grade C\): the parts add up to \d+, but a failed mission never scores higher\./)
    expect(r.craftLost).toBe(false)
  })

  it('a lost craft: capped at C too', () => {
    const r = buildReport(endedAs('lost contact after deployment'))
    expect(r.outcome).toBe('failed')
    expect(r.score.total).toBeLessThanOrEqual(FAILED_SCORE_CAP)
    expect(['C', 'C-', 'D', 'F']).toContain(gradeFor(r.score.total))
    expect(r.craftLost).toBe(true)
  })

  it('a success keeps its full score', () => {
    const ok = buildReport(runSimulation(archetypes.flashlight, 'engineer', 1))
    if (ok.outcome !== 'failed') expect(ok.scoreNotes.some((n) => n.startsWith('Capped'))).toBe(false)
  })
})

describe('a failed mission spends its whole budget', () => {
  it('the report: no money left to score, nothing comes back, the whole budget counts as spent', () => {
    const r = buildReport(endedAs('budget ran out in orbit', { main: 3.4, reserve: 0 }))
    expect(r.scoreNotes.find((n) => n.startsWith('Money left'))).toBe(
      'Money left 0/100: a failed mission spends its whole budget, so nothing is left to score.'
    )
    expect(r.requirements.find((x) => x.id === 'budget')!.reason).toBe(
      '3.4 M was unspent when the mission failed. A failed mission spends its whole budget: none of it comes back.'
    )
    expect(r.totalCost).toBe(computeBudgets(strong.design, strong.difficulty).budgetCap)
    expect(r.scoreNotes.join(' ')).not.toMatch(/goes back to the agency/)
  })

  const snap = (over: Partial<MissionSnapshot> = {}): MissionSnapshot => ({
    seed: 9, turn: 0, phase: 'build', launched: false, launchTurn: 8, captured: false, coverage: 0,
    dataMb: 0, ended: false, outcome: null, leftover: 0, decisionTitle: null, ...over,
  })
  const ended = (outcome: 'failed' | 'success') => {
    let w = approveMission(initialWorld(), { name: 'Lunar Ice Mapper', budget: 25, snapshot: snap() })
    const before = w.funds
    w = missionTurned(w, snap({ turn: 9, launched: true, phase: outcome === 'failed' ? 'failed' : 'complete', ended: true, outcome, coverage: 80, dataMb: 400, leftover: 3.4 })).world
    return { w, before }
  }

  it('the agency funds, the feed and the result dialog agree: nothing comes back after a failure', () => {
    const { w } = ended('failed')
    const feed = w.feed.find((f) => f.title.endsWith('mission failed'))!
    expect(feed.detail).toBe('The whole mission budget is spent')
    expect(feed.money).toBeUndefined()
    const r = missionResult(w)!
    expect(r.money.some((m) => m.label === 'Unspent budget returned')).toBe(false)
    expect(r.money.find((m) => m.label === 'Failed: whole budget spent')!.amount).toBe(0)
    expect(r.moneyNet).toBeCloseTo(-w.mission!.agencyPaid, 5)
  })

  it('a success still gets its unspent budget back', () => {
    const failed = ended('failed').w
    const ok = ended('success').w
    // Same days passed, same budget: the only money difference is the 3.4 M refund (plus papers, equal in both)
    expect(ok.funds - failed.funds).toBeCloseTo(3.4, 5)
    expect(missionResult(ok)!.money.find((m) => m.label === 'Unspent budget returned')!.amount).toBe(3.4)
  })
})
