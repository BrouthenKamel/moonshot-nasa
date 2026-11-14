import { describe, expect, it } from 'vitest'
import { fundingPerDay, grantShare, missionFunding, driftPopularity, clampFunds } from './economy'
import { emptyResearch, processResearch, receiveData, research } from './research'
import {
  DAYS_PER_TURN,
  advanceDays,
  approveMission,
  initialWorld,
  missionLaunchDay,
  missionTurned,
  nextMissionTurnDay,
  type MissionSnapshot,
} from './world'
import { campaign, phaseProgress } from './campaign'

const snap = (over: Partial<MissionSnapshot> = {}): MissionSnapshot => ({
  seed: 42,
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

describe('economy', () => {
  it('pays about $1M a month at the demo popularity', () => {
    expect(fundingPerDay(68) * 30).toBeCloseTo(1.06, 2)
  })

  it('pays more when the public likes you', () => {
    expect(fundingPerDay(90)).toBeGreaterThan(fundingPerDay(40))
    expect(grantShare(90)).toBeGreaterThan(grantShare(40))
  })

  it('splits the 25M Lunar Ice Mapper budget about 16 / 9 at 68%', () => {
    const f = missionFunding(25, 68)
    expect(f.grant).toBeCloseTo(16, 0)
    expect(f.agencyPays).toBeCloseTo(9, 0)
  })

  it('drifts popularity back toward 50 and never lets money go negative', () => {
    expect(driftPopularity(80, 100)).toBeLessThan(80)
    expect(driftPopularity(80, 100)).toBeGreaterThan(50)
    expect(driftPopularity(20, 100)).toBeGreaterThan(20)
    expect(clampFunds(-3)).toBe(0)
  })
})

describe('research', () => {
  it('starts the first paper after 10 MB and publishes once processed', () => {
    let r = receiveData(emptyResearch(), 12, 0, 1)
    expect(r.papers.map((p) => p.id)).toEqual(['first-light'])
    const days = Math.ceil(10 / research.processingPerDay)
    const out = processResearch(r, days, 1 + days)
    r = out.state
    expect(out.published.map((p) => p.id)).toEqual(['first-light'])
    expect(r.papers[0].publishedDay).toBe(1 + days)
  })

  it('waits for the lab to catch up before publishing a map milestone', () => {
    let r = receiveData(emptyResearch(), 100, 30, 1) // 25% reached with 100 MB on the ground
    const paper = r.papers.find((p) => p.id === 'map-25')!
    expect(paper.needsProcessed).toBe(100)
    r = processResearch(r, 10, 11).state // only 20 MB processed
    expect(r.papers.find((p) => p.id === 'map-25')!.publishedDay).toBeNull()
  })
})

describe('world clock', () => {
  it('adds daily funding and records a history point per day', () => {
    const w0 = initialWorld()
    const { world } = advanceDays(w0, w0.day + 30)
    expect(world.funds - w0.funds).toBeCloseTo(fundingPerDay(68) * 30, 1)
    expect(world.history.length).toBe(w0.history.length + 30)
  })

  it('writes scripted events to the feed and flags them for skipping', () => {
    const w0 = initialWorld()
    const { world, notable } = advanceDays(w0, 141)
    expect(notable).toBe(true)
    expect(world.feed[0].title).toContain('Aurora-1 image gallery')
  })
})

describe('real mission', () => {
  const approved = () => approveMission(initialWorld(), { name: 'Lunar Ice Mapper', budget: 25, snapshot: snap() })

  it('takes the agency share on approval and books the ride', () => {
    const w = approved()
    expect(w.funds).toBeCloseTo(18.4 - missionFunding(25, 68).agencyPays, 5)
    expect(missionLaunchDay(w.mission!)).toBe(112 + 8 * DAYS_PER_TURN)
    expect(nextMissionTurnDay(w.mission!)).toBe(112 + DAYS_PER_TURN)
  })

  it('raises popularity on launch', () => {
    const w = approved()
    const { world } = missionTurned(w, snap({ turn: 8, phase: 'transfer', launched: true }))
    expect(world.popularity).toBeCloseTo(w.popularity + 2, 5)
    expect(world.feed[0].title).toContain('launched')
  })

  it('pauses for an event card', () => {
    const { pause, world } = missionTurned(approved(), snap({ turn: 3, decisionTitle: 'Part arrives late' }))
    expect(pause).toBe(true)
    expect(world.feed[0].title).toContain('Decision needed')
  })

  it('sends data to the lab and settles the mission once', () => {
    let w = approved()
    w = missionTurned(w, snap({ turn: 14, phase: 'orbit', launched: true, captured: true, coverage: 30, dataMb: 120 })).world
    expect(w.research.received).toBe(120)
    expect(w.research.papers.map((p) => p.id)).toEqual(['first-light', 'map-25'])

    const fundsBefore = w.funds
    const end = snap({ turn: 26, phase: 'complete', launched: true, captured: true, coverage: 75, dataMb: 320, ended: true, outcome: 'success', leftover: 1.5 })
    const r1 = missionTurned(w, end)
    expect(r1.pause).toBe(true)
    expect(r1.world.funds).toBeCloseTo(fundsBefore + 1.5, 5)
    const r2 = missionTurned(r1.world, end)
    expect(r2.world.funds).toBe(r1.world.funds)
  })

  it('counts the ice map as a Moon-phase goal once it succeeds', () => {
    let w = approved()
    const moonBefore = phaseProgress(campaign(w)[1])
    w = missionTurned(w, snap({ ended: true, outcome: 'success', phase: 'complete', turn: 20 })).world
    expect(phaseProgress(campaign(w)[1])).toBeGreaterThan(moonBefore)
  })
})
