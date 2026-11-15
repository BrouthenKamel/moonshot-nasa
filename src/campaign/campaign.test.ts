import { describe, expect, it } from 'vitest'
import { CAMPAIGN, defaultPicks, missionById, planOf, type CampaignMission, type Picks } from './missions'
import { flyMission, outcomeOdds } from './flight'
import { agencyShare, approveCampaignMission, awardIceMapper, canAfford, settleCampaignFlight } from './ledger'
import { buildUpMission, gateDistance, hqProgress, unlockNote, minimumShare, repeatValue, emptyProgress, gateProgress, ladder, markOpened, nextMission, recordFlight, type CampaignProgress } from './progress'
import { advanceDays, approveMission, initialWorld, missionTurned, type MissionSnapshot, type World } from '../game/world'

/** The picks with the best landing chance: what a careful player does */
function safestPicks(m: CampaignMission): Picks {
  return Object.fromEntries(m.choices.map((c) => [c.id, [...c.options].sort((a, b) => b.reliability - a.reliability)[0].id]))
}

/** A seed whose roll gives the wanted outcome */
function seedFor(m: CampaignMission, picks: Picks, outcome: 'success' | 'partial' | 'failed'): number {
  for (let s = 1; s < 5000; s++) if (flyMission(m, picks, s).outcome === outcome) return s
  throw new Error('no seed')
}

const snap = (over: Partial<MissionSnapshot>): MissionSnapshot => ({
  seed: 7,
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

/** Mission 1 through main's agency rules: approve, about 14 months of flight, then success */
function flyIceMapper(world: World, outcome: 'success' | 'failed'): World {
  let w = approveMission(world, { name: 'Lunar Ice Mapper', budget: 25, snapshot: snap({}) })
  w = advanceDays(w, w.day + 14 * 30).world
  w = missionTurned(w, snap({ turn: 9, launched: true, phase: 'transfer' })).world
  w = missionTurned(w, snap({ turn: 22, launched: true, phase: 'complete', ended: true, outcome, coverage: 75, leftover: outcome === 'failed' ? 0 : 2 })).world
  return awardIceMapper(w, CAMPAIGN[0], outcome, true)
}

/** Fly one campaign mission end to end through the ledger */
function fly(world: World, progress: CampaignProgress, m: CampaignMission, outcome: 'success' | 'partial' | 'failed') {
  const picks = safestPicks(m)
  const plan = planOf(m, picks)
  const flight = flyMission(m, picks, seedFor(m, picks, outcome))
  const approved = approveCampaignMission(world, m, plan)
  const first = !progress.flights.some((f) => f.missionId === m.id && f.outcome === 'success')
  const { world: w, result } = settleCampaignFlight(approved.world, m, flight, approved.paid, first)
  const p = recordFlight(markOpened(progress, m.id), { missionId: m.id, outcome, science: flight.science, day: w.day, seed: flight.seed })
  return { world: w, progress: p, result }
}

describe('campaign data', () => {
  it('has four missions in order with rising budgets and gates', () => {
    expect(CAMPAIGN.map((m) => m.id)).toEqual(['ice-mapper', 'moon-landing', 'moon-base', 'mars-base'])
    for (let i = 2; i < CAMPAIGN.length; i++) {
      expect(CAMPAIGN[i].baseBudget).toBeGreaterThan(CAMPAIGN[i - 1].baseBudget)
      expect(CAMPAIGN[i].gate!.funds).toBeGreaterThan(CAMPAIGN[i - 1].gate!.funds)
      expect(CAMPAIGN[i].gate!.popularity).toBeGreaterThan(CAMPAIGN[i - 1].gate!.popularity)
    }
  })

  it('gives missions 2-4 three choices of two or three options, each fact with a source', () => {
    for (const m of CAMPAIGN.slice(1)) {
      expect(m.choices).toHaveLength(3)
      for (const c of m.choices) {
        expect(c.options.length).toBeGreaterThanOrEqual(2)
        expect(c.options.length).toBeLessThanOrEqual(3)
        for (const o of c.options) if (o.fact) expect(o.fact.source.length).toBeGreaterThan(5)
      }
    }
  })

  it('makes every choice a trade: no option is cheapest, safest and best science at once', () => {
    for (const m of CAMPAIGN.slice(1))
      for (const c of m.choices)
        for (const o of c.options) {
          const dominates = c.options.every((x) => x === o || (o.cost <= x.cost && o.reliability >= x.reliability && o.science >= x.science))
          expect(dominates, `${m.id}/${c.id}/${o.id}`).toBe(false)
        }
  })

  it('keeps the agency share at the gate affordable for the safest plan', () => {
    for (const m of CAMPAIGN.slice(1)) {
      const plan = planOf(m, safestPicks(m))
      expect(agencyShare(plan, m.gate!.popularity), m.id).toBeLessThanOrEqual(m.gate!.funds)
    }
  })
})

describe('flyMission', () => {
  const m = missionById('moon-landing')
  it('is deterministic for a seed', () => {
    expect(flyMission(m, defaultPicks(m), 42)).toEqual(flyMission(m, defaultPicks(m), 42))
  })

  it('produces all three outcomes and failures at launch and landing', () => {
    const seen = new Set<string>()
    for (let s = 1; s < 400; s++) {
      const f = flyMission(m, defaultPicks(m), s)
      seen.add(f.outcome)
      if (f.failedAt) seen.add(`at-${f.failedAt}`)
    }
    expect([...seen].sort()).toEqual(['at-landing', 'at-launch', 'failed', 'partial', 'success'])
  })

  it('matches its odds over many seeds', () => {
    const picks = defaultPicks(m)
    const odds = outcomeOdds(m, picks)
    let wins = 0
    const n = 4000
    for (let s = 1; s <= n; s++) if (flyMission(m, picks, s).outcome === 'success') wins++
    expect(Math.abs(wins / n - odds.success)).toBeLessThan(0.03)
    expect(odds.success + odds.partial + odds.failed).toBeCloseTo(1)
  })

  it('earns full science on success, half on partial, none on failure', () => {
    const picks = defaultPicks(m)
    const plan = planOf(m, picks)
    expect(flyMission(m, picks, seedFor(m, picks, 'success')).science).toBe(plan.science)
    expect(flyMission(m, picks, seedFor(m, picks, 'partial')).science).toBe(Math.round(plan.science / 2))
    expect(flyMission(m, picks, seedFor(m, picks, 'failed')).science).toBe(0)
  })
})

describe('ladder and gates', () => {
  it('highlights exactly one next mission and locks the rest', () => {
    const rungs = ladder(emptyProgress(), 10, 60)
    expect(rungs.filter((r) => r.state === 'next')).toHaveLength(1)
    expect(rungs[0].state).toBe('next')
    expect(rungs.slice(1).every((r) => r.state === 'locked' && !r.open)).toBe(true)
  })

  it('opens the Moon landing only after the ice map AND the gate', () => {
    const flown = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'success', science: 0, day: 0, seed: 1 })
    expect(ladder(flown, 20, 80)[1].open).toBe(false) // short of money
    expect(ladder(flown, 40, 60)[1].open).toBe(false) // short of popularity
    expect(ladder(flown, 40, 80)[1].open).toBe(true)
    expect(ladder(emptyProgress(), 400, 100)[1].open).toBe(false) // the ice map comes first
    const g = gateProgress(flown, 20, 80)!
    expect(g.mission.id).toBe('moon-landing')
    expect(g.fundsShare).toBeCloseTo(20 / 35)
    expect(g.popularityShare).toBe(1)
    expect(g.met).toBe(false)
  })

  it('keeps a started mission open after the funds dip', () => {
    let p = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'partial', science: 0, day: 0, seed: 1 })
    p = markOpened(p, 'moon-landing')
    expect(ladder(p, 0, 0)[1].open).toBe(true)
    expect(gateProgress(p, 0, 0)).toBeNull()
  })

  it('suggests the cheapest flown mission to build up', () => {
    expect(buildUpMission(emptyProgress()).id).toBe('ice-mapper')
    const p = recordFlight(recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'failed', science: 0, day: 0, seed: 1 }), {
      missionId: 'moon-landing',
      outcome: 'success',
      science: 0,
      day: 0,
      seed: 2,
    })
    expect(buildUpMission(p).id).toBe('moon-landing')
  })

  it('makes a careful repeat flight of missions 2 and 3 worth money on average', () => {
    // Mars is the last rung: it never builds up for a later gate
    for (const m of CAMPAIGN.slice(1, 3)) expect(repeatValue(m, m.gate!.popularity), m.id).toBeGreaterThan(0)
  })
})

describe('gateDistance and unlockNote', () => {
  const iceFlown = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'success', science: 0, day: 0, seed: 1 })

  it('spells out how far a locked rung is from its gate', () => {
    expect(gateDistance(missionById('moon-landing').gate!, 18.44, 68.2)).toBe('Funds $18.4M of $35M · Popularity 68% of 68%')
    expect(gateDistance(missionById('mars-base').gate!, 0, 0)).toBe('Funds $0.0M of $125M · Popularity 0% of 76%')
  })

  it('says what a newly unlocked rung needs, or that it is ready', () => {
    expect(unlockNote(iceFlown, 'ice-mapper', 28.4, 80)).toMatchObject({ met: false, text: 'Unlocked! Needs $35M: you have $28.4M.' })
    expect(unlockNote(iceFlown, 'ice-mapper', 28.4, 60)!.text).toBe('Unlocked! Needs $35M and 68% popularity: you have $28.4M and 60%.')
    expect(unlockNote(iceFlown, 'ice-mapper', 40, 80)).toMatchObject({ met: true, text: 'Unlocked! The Moon landing is ready to plan.' })
  })

  it('says nothing after a failure, for a rung already started, or with no flight', () => {
    const failed = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'failed', science: 0, day: 0, seed: 1 })
    expect(unlockNote(failed, 'ice-mapper', 40, 80)).toBeNull()
    expect(unlockNote(markOpened(iceFlown, 'moon-landing'), 'ice-mapper', 40, 80)).toBeNull()
    expect(unlockNote(iceFlown, null, 40, 80)).toBeNull()
  })
})

describe('hqProgress', () => {
  it('fills the Headquarters phases as the ladder is flown', () => {
    expect(hqProgress(emptyProgress())).toEqual({ satellites: 0, moon: 0, mars: 0 })
    const p = recordFlight(recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'success', science: 0, day: 0, seed: 1 }), {
      missionId: 'moon-landing',
      outcome: 'partial',
      science: 0,
      day: 0,
      seed: 2,
    })
    expect(hqProgress(p)).toEqual({ satellites: 1, moon: 0.5, mars: 0 })
  })
})

describe('minimumShare', () => {
  it('is zero for mission 1 and below the safest plan for the others', () => {
    expect(minimumShare(CAMPAIGN[0], 70)).toBe(0)
    for (const m of CAMPAIGN.slice(1)) expect(minimumShare(m, 80)).toBeLessThanOrEqual(agencyShare(planOf(m, safestPicks(m)), 80))
  })
})

describe('balance (game values)', () => {
  /** Wait on the agency clock (30-day steps, at most `max` days) until a mission can be started */
  function waitFor(world: World, progress: CampaignProgress, m: CampaignMission, max: number) {
    let waited = 0
    while (!(ladder(progress, world.funds, world.popularity)[m.n - 1].open && canAfford(world, planOf(m, safestPicks(m)))) && waited < max) {
      world = advanceDays(world, world.day + 30).world
      waited += 30
    }
    return { world, waited, open: ladder(progress, world.funds, world.popularity)[m.n - 1].open }
  }

  it('a careful player who succeeds every time reaches the Moon base with little waiting', () => {
    let world = flyIceMapper(initialWorld(), 'success')
    let progress = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'success', science: 0, day: world.day, seed: 7 })
    for (const m of CAMPAIGN.slice(1, 3)) {
      const w = waitFor(world, progress, m, 90)
      if (process.env.CAMPAIGN_LOG) console.log(m.id, w.waited, w.world.funds.toFixed(1), w.world.popularity.toFixed(1))
      expect(w.open, `${m.id} opens within three months`).toBe(true)
      ;({ world, progress } = fly(w.world, progress, m, 'success'))
    }
  })

  it('the Mars gate needs at least one strong flight after a clean run to the Moon base', () => {
    let world = flyIceMapper(initialWorld(), 'success')
    let progress = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'success', science: 0, day: world.day, seed: 7 })
    for (const m of CAMPAIGN.slice(1, 3)) ({ world, progress } = fly(waitFor(world, progress, m, 360).world, progress, m, 'success'))
    const mars = missionById('mars-base')
    if (process.env.CAMPAIGN_LOG) console.log('before mars', world.funds.toFixed(1), world.popularity.toFixed(1))
    // Not open, even after three months of funding
    expect(waitFor(world, progress, mars, 90).open).toBe(false)
    // One more strong flight (a repeat Moon base success) opens it within three months
    ;({ world, progress } = fly(world, progress, missionById('moon-base'), 'success'))
    const w = waitFor(world, progress, mars, 90)
    if (process.env.CAMPAIGN_LOG) console.log('after repeat base', w.waited, w.world.funds.toFixed(1), w.world.popularity.toFixed(1))
    expect(w.open).toBe(true)
    ;({ world, progress } = fly(w.world, progress, mars, 'success'))
    expect(nextMission(progress)).toBeNull()
  })

  it('keeps popularity under the 100% ceiling before Mars, even for a player who picks every crowd-pleaser', () => {
    const boldPicks = (m: CampaignMission): Picks => Object.fromEntries(m.choices.map((c) => [c.id, [...c.options].sort((a, b) => b.hype - a.hype)[0].id]))
    let world: World = { ...flyIceMapper(initialWorld(), 'success'), funds: 500 }
    let progress = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'success', science: 0, day: world.day, seed: 7 })
    for (const m of CAMPAIGN.slice(1, 3)) {
      const picks = boldPicks(m)
      const plan = planOf(m, picks)
      const flight = flyMission(m, picks, seedFor(m, picks, 'success'))
      const approved = approveCampaignMission({ ...world, popularity: Math.max(world.popularity, m.gate!.popularity) }, m, plan)
      world = settleCampaignFlight(approved.world, m, flight, approved.paid, true).world
      progress = recordFlight(markOpened(progress, m.id), { missionId: m.id, outcome: 'success', science: 0, day: world.day, seed: flight.seed })
    }
    if (process.env.CAMPAIGN_LOG) console.log('bold popularity before mars', world.popularity.toFixed(1))
    expect(world.popularity).toBeLessThan(100)
  })

  it('a failed Moon landing leaves the agency short of the next gate: it must fly again', () => {
    let world = flyIceMapper(initialWorld(), 'success')
    let progress = recordFlight(emptyProgress(), { missionId: 'ice-mapper', outcome: 'success', science: 0, day: world.day, seed: 7 })
    while (!ladder(progress, world.funds, world.popularity)[1].open) world = advanceDays(world, world.day + 30).world
    ;({ world, progress } = fly(world, progress, missionById('moon-landing'), 'failed'))
    expect(nextMission(progress)!.id).toBe('moon-landing')
    // Funds and popularity both fell; the base gate is far away
    expect(gateMet(missionById('moon-base').gate, world.funds, world.popularity)).toBe(false)
  })

  it('a failure burns the agency share and costs popularity', () => {
    const m = missionById('moon-base')
    const start: World = { ...initialWorld(), funds: 100, popularity: 85 }
    const { world, result } = fly(start, markOpened(emptyProgress(), 'moon-base'), m, 'failed')
    expect(result.moneyNet).toBeLessThan(0)
    expect(result.popularityNet).toBeLessThan(0)
    expect(world.popularity).toBeLessThan(85)
  })
})

function gateMet(g: { funds: number; popularity: number } | null, funds: number, popularity: number) {
  return !g || (funds >= g.funds && popularity >= g.popularity)
}
