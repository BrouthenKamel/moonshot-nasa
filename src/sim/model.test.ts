import { describe, it, expect } from 'vitest'
import { computeBudgets, insertionDeltaV } from './budgets'
import { goNoGo } from './checks'
import { initSim, stepTurn, flyUntilDecision, runSimulation, getDefaultAction, isSimComplete } from './simulate'
import { buildReport } from './evaluate'
import { flashlightDesign, lunahMapDesign, iceCubeDesign } from './fixtures'
import { getPartById, type PropulsionPart } from '../data/parts'
import { getOrbitById } from '../data/orbits'
import type { Design, SimState } from './types'

const status = (d: Design, resource: string) =>
  goNoGo(d, computeBudgets(d, 'engineer')).checks.find((c) => c.resource === resource)?.status

describe('calculator reproduces the logic map', () => {
  it('matches the real-mission anchors', () => {
    const chem = getPartById('prop-chemical') as PropulsionPart
    expect(insertionDeltaV(chem, 'direct', getOrbitById('orbit-100km'))).toBe(858) // LRO 854, Lunar Prospector 898
    expect(insertionDeltaV(chem, 'low_energy', getOrbitById('orbit-elliptical'))).toBe(386)
    const ion = getPartById('prop-ion') as PropulsionPart
    expect(insertionDeltaV(ion, 'direct', getOrbitById('orbit-halo'))).toBeNull()

    const flashlight = computeBudgets(flashlightDesign, 'engineer')
    expect(flashlight.totalMass).toBeCloseTo(14.0, 1)
    expect(flashlight.totalVolume).toBeCloseTo(5.9, 2)
    expect(flashlight.deltaVAvailable).toBeCloseTo(227, 0)
    expect(flashlight.totalCost).toBeCloseTo(21.0, 1)

    expect(computeBudgets(lunahMapDesign, 'engineer').transferTurns).toBe(10) // Lunar IceCube plan 9, LunaH-Map 15
    const icecube = computeBudgets(iceCubeDesign, 'engineer')
    expect(icecube.totalMass).toBeCloseTo(12.8, 1)
    expect(icecube.totalCost).toBeCloseTo(24.9, 1)
  })

  it('counts propellant in the mass and the reserve inside the budget', () => {
    const b = computeBudgets(lunahMapDesign, 'engineer')
    expect(b.totalMass - b.dryMass).toBeCloseTo(1.5)
    expect(b.spendable + b.reserveAmount).toBeCloseTo(b.budgetCap)
  })

  it('derives build time from the parts', () => {
    const simple = computeBudgets({ ...flashlightDesign, attitude: 'attitude-basic' }, 'engineer')
    expect(simple.buildEffort).toBeLessThan(computeBudgets(flashlightDesign, 'engineer').buildEffort)
  })
})

describe('instruments and orbits shape the science', () => {
  it('the IR spectrometer cannot map ice in shadow', () => {
    expect(computeBudgets(iceCubeDesign, 'engineer').projectedCoverage).toBe(0)
  })

  it('the camera alone maps no ice, whatever it costs', () => {
    expect(computeBudgets({ ...flashlightDesign, instruments: ['inst-camera'] }, 'engineer').projectedCoverage).toBe(0)
  })

  it('the neutron spectrometer on the halo loop sees too few passes', () => {
    const b = computeBudgets({ ...lunahMapDesign, orbit: 'orbit-halo' }, 'engineer')
    expect(b.projectedCoverage).toBeLessThan(50)
  })

  it('an ice instrument above its altitude limit maps nothing', () => {
    const laser100 = { ...flashlightDesign, orbit: 'orbit-100km' }
    const b = computeBudgets(laser100, 'engineer')
    expect(b.quality['inst-laser']).toBe(0)
    expect(b.coverageRate['inst-laser']).toBe(0)
    expect(b.projectedCoverage).toBe(0)
  })

  it('the IR spectrometer has no altitude limit', () => {
    const b = computeBudgets({ ...iceCubeDesign, orbit: 'orbit-100km' }, 'engineer')
    expect(b.quality['inst-ir-spec']).toBe(1)
  })

  it('a laser without precise pointing loses half its quality', () => {
    const b = computeBudgets({ ...flashlightDesign, attitude: 'attitude-basic' }, 'engineer')
    expect(b.quality['inst-laser']).toBeCloseTo(0.5)
  })
})

describe('Go / No-Go', () => {
  it('flies the reference designs', () => {
    for (const d of [flashlightDesign, lunahMapDesign, iceCubeDesign]) {
      expect(goNoGo(d, computeBudgets(d, 'engineer')).canGo).toBe(true)
    }
  })

  it('stops the classic mistakes with a reason and a step to fix', () => {
    expect(status({ ...flashlightDesign, radio: 'radio-uhf' }, 'Comms')).toBe('red')
    expect(status({ ...lunahMapDesign, solar: 'solar-1wing' }, 'Delta-v')).toBe('red') // ion engine starved of power
    expect(status({ ...lunahMapDesign, transfer: 'transfer-direct' }, 'Delta-v')).toBe('red')
    expect(status({ ...flashlightDesign, orbit: 'orbit-elliptical' }, 'Delta-v')).toBe('red') // chemical cannot reach it
    expect(status({ ...flashlightDesign, ride: 'ride-gto' }, 'Delta-v')).toBe('red')
    expect(status({ ...flashlightDesign, instruments: ['inst-laser', 'inst-ir-spec'], radio: 'radio-xband' }, 'Volume')).toBe('red')
    const result = goNoGo({ ...flashlightDesign, radio: 'radio-uhf' }, computeBudgets({ ...flashlightDesign, radio: 'radio-uhf' }, 'engineer'))
    for (const c of result.checks.filter((c) => c.status !== 'green')) {
      expect(c.reason.length).toBeGreaterThan(10)
      expect(c.fixStep).toBeDefined()
    }
  })

  it('never makes science red', () => {
    expect(status(iceCubeDesign, 'Science')).toBe('yellow')
  })

  it('names the instruments to fit when none can see into shadow', () => {
    const b = computeBudgets(iceCubeDesign, 'engineer')
    const science = goNoGo(iceCubeDesign, b).checks.find((c) => c.resource === 'Science')!
    expect(science.reason).toContain('laser reflectometer')
    expect(science.reason).toContain('neutron spectrometer')
  })

  it('counts the science margin up from the 70% target (more coverage is better)', () => {
    const b = computeBudgets(flashlightDesign, 'engineer')
    const science = goNoGo(flashlightDesign, b).checks.find((c) => c.resource === 'Science')!
    expect(science.margin).toBeCloseTo(b.projectedCoverage - 70)
    expect(science.margin).toBeGreaterThan(0)
  })
})

describe('flight', () => {
  it('launches on turn 8 and captures after the 4-turn low-energy transfer', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = runSimulation(flashlightDesign, 'engineer', seed)
      expect(isSimComplete(s)).toBe(true)
      if (s.flight.launchedTurn === 8 && s.flight.captured && s.flight.counts.thruster === 0) {
        expect(s.flight.captureTurn).toBe(12)
        return
      }
    }
    throw new Error('no clean launch in 50 flights')
  })

  it('is reproducible from its seed', () => {
    const a = runSimulation(lunahMapDesign, 'engineer', 42)
    const b = runSimulation(lunahMapDesign, 'engineer', 42)
    expect(a.turnLogs.map((l) => l.notes.join('|'))).toEqual(b.turnLogs.map((l) => l.notes.join('|')))
  })

  it('matches the logic map success rates', () => {
    const rates = (d: Design) => {
      const n = 1500
      const out = { success: 0, partial: 0, failed: 0 }
      for (let seed = 1; seed <= n; seed++) out[buildReport(runSimulation(d, 'engineer', seed)).outcome]++
      return { full: out.success / n, partial: out.partial / n, fail: out.failed / n }
    }
    const flashlight = rates(flashlightDesign) // logic map: 84 / 13 / 2
    expect(flashlight.full).toBeGreaterThan(0.78)
    expect(flashlight.fail).toBeLessThan(0.06)
    const icecube = rates(iceCubeDesign) // logic map: 0 / 84 / 15
    expect(icecube.full).toBe(0)
    // Starts with no reserve since the reserve line became a hard limit (14 Nov), so unpaid fixes lose a few more
    expect(icecube.partial).toBeGreaterThan(0.7)
  }, 20_000) // 3000 simulated missions

  it('pauses on an event card and replays the turn with the same dice once answered', () => {
    let found: SimState | null = null
    for (let seed = 1; seed <= 300 && !found; seed++) {
      const s = flyUntilDecision(initSim(flashlightDesign, 'engineer', seed), getDefaultAction())
      if (s.pendingDecision) found = s
    }
    expect(found).not.toBeNull()
    const s = found!
    const d = s.pendingDecision!
    // Nothing happens until the card is answered
    const again = stepTurn(s, getDefaultAction())
    expect(again.currentTurn).toBe(s.currentTurn)
    expect(again.pendingDecision?.key).toBe(d.key)
    // Answering finishes that turn
    const answered = stepTurn(s, { ...getDefaultAction(), choices: { [d.key]: d.options[0].id } })
    expect(answered.pendingDecision).toBeUndefined()
    expect(answered.currentTurn).toBe(s.currentTurn + 1)
    // The first option is what the standing orders choose: same flight as runSimulation
    let manual = answered
    while (!isSimComplete(manual)) {
      manual = stepTurn(manual, getDefaultAction())
      if (manual.pendingDecision) {
        const p = manual.pendingDecision
        manual = stepTurn(manual, { ...getDefaultAction(), choices: { [p.key]: p.options[0].id } })
      }
    }
    const auto = runSimulation(flashlightDesign, 'engineer', s.seed)
    expect(buildReport(manual).score.total).toBe(buildReport(auto).score.total)
  })

  it('says so when there is no reserve to pay for a fix, without claiming a failed choice', () => {
    const noReserve: Design = { ...lunahMapDesign, planning: { ...lunahMapDesign.planning, reservePercent: 0, testTurns: 0 } }
    for (let seed = 1; seed <= 3000; seed++) {
      const s = runSimulation(noReserve, 'engineer', seed)
      const ev = s.allEvents.find((e) => e.eventId === 'thruster')
      if (!ev || s.flight.reserve >= 1) continue
      expect(ev.choiceSucceeded).toBeUndefined()
      const log = s.turnLogs.find((l) => l.turn === ev.turn)!
      expect(log.notes.join(' ')).toContain('No reserve left to pay for a fix')
      return
    }
    throw new Error('no thruster event without reserve in 3000 flights')
  })

  it('spends money every turn and waits for the next ride when late', () => {
    const late: Design = { ...flashlightDesign, planning: { ...flashlightDesign.planning, testTurns: 3 } }
    const s = runSimulation(late, 'engineer', 5)
    const missed = s.turnLogs.find((l) => l.notes.some((n) => n.startsWith('Missed the ride')))
    expect(missed?.turn).toBe(8)
    const launch = s.turnLogs.find((l) => l.notes.some((n) => n.startsWith('Launched')))
    expect(launch?.turn).toBe(14)
    expect(s.flight.main + Math.max(0, s.flight.reserve)).toBeLessThan(25)
  })
})

describe('report explains the misses', () => {
  const missOf = (d: Design, id: string, seed = 3) =>
    buildReport(runSimulation(d, 'engineer', seed)).requirements.find((r) => r.id === id)!

  it('IR spectrometer: cannot see into the shadowed craters', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = buildReport(runSimulation(iceCubeDesign, 'engineer', seed))
      if (!r.requirements[0].met) continue // lost on the way
      const coverage = r.requirements.find((q) => q.id === 'coverage')!
      expect(coverage.met).toBe(false)
      expect(coverage.causes.join(' ')).toContain('cannot see into the shadowed craters')
      return
    }
  })

  it('every missed requirement has at least one cause, every met one none', () => {
    for (const d of [flashlightDesign, lunahMapDesign, iceCubeDesign]) {
      for (let seed = 1; seed <= 60; seed++) {
        const r = buildReport(runSimulation(d, 'engineer', seed))
        for (const q of r.requirements) expect(q.causes.length > 0).toBe(!q.met)
        expect(r.score.total).toBeGreaterThanOrEqual(0)
        expect(r.score.total).toBeLessThanOrEqual(1000)
      }
    }
  })

  it('the "perfect craft" line counts the turns actually flown, so it never contradicts the result', () => {
    const design = { ...lunahMapDesign, orbit: 'orbit-halo' }
    for (let seed = 1; seed <= 200; seed++) {
      const s = runSimulation(design, 'engineer', seed)
      if (s.flight.scienceTurns <= 12) continue
      const coverage = buildReport(s).requirements.find((r) => r.id === 'coverage')!
      const line = coverage.causes.find((c) => c.startsWith('Too few passes'))
      if (!line) continue
      expect(line).toContain(`in ${s.flight.scienceTurns} turns`)
      const ideal = Number(line.match(/maps only (\d+)%/)![1])
      expect(ideal).toBeGreaterThanOrEqual(Math.floor(s.flight.coverage))
      return
    }
    throw new Error('no extended neutron-halo flight in 200 seeds')
  })

  it('neutron on the halo loop: too few passes', () => {
    const coverage = missOf({ ...lunahMapDesign, orbit: 'orbit-halo' }, 'coverage')
    if (!coverage.met && coverage.causes[0] !== 'The craft never reached its science orbit.') {
      expect(coverage.causes.join(' ')).toContain('Too few passes')
    }
  })
})
