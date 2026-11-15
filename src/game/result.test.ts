import { describe, expect, it } from 'vitest'
import { approveMission, initialWorld, missionTurned, type MissionSnapshot } from './world'
import { missionResult } from './result'
import { popularityEffects } from './economy'

const snap = (over: Partial<MissionSnapshot> = {}): MissionSnapshot => ({
  seed: 9,
  turn: 0,
  phase: 'build',
  launched: false,
  launchTurn: 8,
  captured: false,
  coverage: 0,
  dataMb: 0,
  ended: false,
  outcome: null,
  leftover: 0,
  decisionTitle: null,
  ...over,
})

describe('mission result', () => {
  const approved = () => approveMission(initialWorld(), { name: 'Lunar Ice Mapper', budget: 25, snapshot: snap() })

  it('is empty until the mission has ended', () => {
    expect(missionResult(approved())).toBeNull()
  })

  it('adds up a success: share paid, budget back, launch and success popularity', () => {
    let w = approved()
    w = missionTurned(w, snap({ turn: 8, launched: true, phase: 'transfer' })).world
    w = missionTurned(w, snap({ turn: 30, launched: true, phase: 'complete', ended: true, outcome: 'success', coverage: 80, dataMb: 400, leftover: 3 })).world
    const r = missionResult(w)!
    expect(r.outcome).toBe('success')
    expect(r.money.find((m) => m.label.startsWith('Your share'))!.amount).toBeCloseTo(-w.mission!.agencyPaid, 5)
    expect(r.money.find((m) => m.label.startsWith('Unspent'))!.amount).toBe(3)
    expect(r.moneyNet).toBeCloseTo(3 - w.mission!.agencyPaid, 5)
    expect(r.popularityNet).toBe(popularityEffects.launch + popularityEffects.missionSuccess)
  })

  it('shows a lost mission as a popularity loss', () => {
    let w = approved()
    w = missionTurned(w, snap({ turn: 9, launched: true, phase: 'failed', ended: true, outcome: 'failed' })).world
    const r = missionResult(w)!
    expect(r.outcome).toBe('failed')
    expect(r.popularityNet).toBe(popularityEffects.launch + popularityEffects.missionFailed)
    expect(r.moneyNet).toBeLessThan(0)
  })
})
