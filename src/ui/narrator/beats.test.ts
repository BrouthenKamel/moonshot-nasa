import { describe, it, expect } from 'vitest'
import { pickBeat, BEAT_IDS, type NarratorInput } from './beats'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { initSim } from '../../sim/simulate'
import type { Report, SimState } from '../../sim/types'

const design = createDefaultDesign()
const budgets = computeBudgets(design, 'engineer')
const gng = goNoGo(design, budgets)

const IR = { name: 'IR Spectrometer', seesShadow: false, maxAltitudeKm: null, flownOn: 'Lunar IceCube' }
const LASER = { name: 'Laser Reflectometer', seesShadow: true, maxAltitudeKm: 20, flownOn: 'Lunar Flashlight' }

function input(over: Partial<NarratorInput> = {}): NarratorInput {
  return {
    screen: 'base',
    designStep: 'brief',
    visitedSteps: [],
    sim: null,
    report: null,
    budgets,
    goNoGo: gng,
    instruments: [IR],
    ...over,
  }
}

function sim(over: Partial<SimState> = {}, flight: Partial<SimState['flight']> = {}): SimState {
  const s = initSim(design, 'engineer', 1)
  return { ...s, ...over, flight: { ...s.flight, ...flight } }
}

const report = (over: Partial<Report>): Report =>
  ({ outcome: 'success', coverageAchieved: 81.4, dataReturned: 412.6, ...over }) as Report

describe('pickBeat', () => {
  it('greets a new player on the base map and points at the Comms Center', () => {
    const b = pickBeat(input())
    expect(b?.id).toBe('start')
    expect(b?.text).toMatch(/Comms Center/)
  })

  it('says nothing on the base once the player has started designing', () => {
    expect(pickBeat(input({ visitedSteps: ['brief'] }))).toBeNull()
  })

  it('sends the player to the Research Lab from the brief when nothing sees into the craters (I5a)', () => {
    const b = pickBeat(input({ screen: 'design', designStep: 'brief' }))
    expect(b?.id).toBe('step-brief')
    expect(b?.text).toMatch(/Research Lab/)
    expect(b?.text).toMatch(/dark craters/)
  })

  it('drops the Research Lab hint once an instrument sees into the dark', () => {
    const b = pickBeat(input({ screen: 'design', designStep: 'brief', instruments: [LASER] }))
    expect(b?.id).toBe('step-brief')
    expect(b?.text).not.toMatch(/Research Lab/)
  })

  it('reads the budget numbers in the planning line from the budgets', () => {
    const b = pickBeat(input({ screen: 'design', designStep: 'planning' }))
    expect(b?.id).toBe('step-planning')
    expect(b?.text).toContain(`${budgets.budgetCap} M`)
    expect(b?.text).toContain(`${budgets.reserveAmount.toFixed(1)} M`)
  })

  it('teaches the shadow lesson in the Research Lab, and the height limit once fixed', () => {
    const ir = pickBeat(input({ screen: 'design', designStep: 'instruments' }))
    expect(ir?.id).toBe('step-instruments')
    expect(ir?.text).toMatch(/Lunar Flashlight/)
    const laser = pickBeat(input({ screen: 'design', designStep: 'instruments', instruments: [LASER] }))
    expect(laser?.text).toContain('20 km')
  })

  it('has a line for every design step', () => {
    for (const step of ['spacecraft', 'orbit', 'ride', 'comms'] as const) {
      const b = pickBeat(input({ screen: 'design', designStep: step }))
      expect(b?.id).toBe(`step-${step}`)
      expect(b?.text.length).toBeGreaterThan(10)
    }
    expect(pickBeat(input({ screen: 'design', designStep: 'ride' }))?.text).toContain(`month ${budgets.rideTurn}`)
  })

  it('reads the Go / No-Go verdict', () => {
    const go = pickBeat(input({ screen: 'design', designStep: 'go-nogo', goNoGo: { ...gng, canGo: true, blockers: [] } }))
    expect(go?.id).toBe('go-nogo')
    expect(go?.text).toMatch(/your call/i)
    const red = pickBeat(
      input({ screen: 'design', designStep: 'go-nogo', goNoGo: { ...gng, canGo: false, blockers: [gng.checks[0], gng.checks[1]] } })
    )
    expect(red?.text).toMatch(/2 red bars/)
  })

  it('follows the flight: building, launch, capture, orbit', () => {
    expect(pickBeat(input({ sim: sim({ phase: 'build' }) }))?.id).toBe('flight-build')
    expect(pickBeat(input({ sim: sim({ phase: 'wait' }) }))?.text).toMatch(/month \d+/)
    expect(pickBeat(input({ sim: sim({ phase: 'transfer' }) }))?.id).toBe('launch')
    expect(pickBeat(input({ sim: sim({ phase: 'capture' }) }))?.id).toBe('capture')
    expect(pickBeat(input({ sim: sim({ phase: 'orbit' }) }))?.id).toBe('orbit')
  })

  it('speaks up at an event card, naming the real mission when there is one', () => {
    const decision = { key: 'radiation-reset', title: 'Radiation hit', text: '', options: [], realMission: 'LunaH-Map', turn: 3 }
    const b = pickBeat(input({ sim: sim({ phase: 'transfer', pendingDecision: decision as never }) }))
    expect(b?.id).toBe('event')
    expect(b?.text).toContain('LunaH-Map')
  })

  it('ends in each outcome with the numbers from the report', () => {
    const done = sim({ phase: 'complete' })
    const ok = pickBeat(input({ sim: done, report: report({ outcome: 'success' }) }))
    expect(ok?.id).toBe('end-success')
    expect(ok?.text).toContain('81%')
    expect(ok?.text).toContain('413 MB')
    expect(pickBeat(input({ sim: done, report: report({ outcome: 'partial' }) }))?.id).toBe('end-partial')
    expect(pickBeat(input({ sim: done, report: report({ outcome: 'failed' }) }))?.id).toBe('end-failed')
    const lost = sim({ phase: 'failed' }, { alive: false, end: 'lost contact after deployment' })
    expect(pickBeat(input({ sim: lost, report: report({ outcome: 'failed' }) }))?.id).toBe('end-lost')
  })

  it('does not say the craft was lost when the money ran out (QC, 15 Nov)', () => {
    const broke = sim({ phase: 'failed' }, { alive: false, end: 'budget ran out in orbit' })
    const b = pickBeat(input({ sim: broke, report: report({ outcome: 'failed' }) }))
    expect(b?.id).toBe('end-stopped')
    expect(b?.text).toContain('The money ran out')
    expect(b?.text).not.toContain('lost her')
  })

  it('gives the ending on the report screen too', () => {
    const b = pickBeat(input({ screen: 'report', sim: sim({ phase: 'complete' }), report: report({ outcome: 'partial' }) }))
    expect(b?.id).toBe('end-partial')
  })

  it('stays quiet on the replay screen', () => {
    expect(pickBeat(input({ screen: 'replay', sim: sim({ phase: 'complete' }), report: report({}) }))).toBeNull()
  })

  it('only uses known beat ids', () => {
    const ids = new Set<string>(BEAT_IDS)
    const samples = [
      input(),
      input({ screen: 'design', designStep: 'comms' }),
      input({ sim: sim({ phase: 'orbit' }) }),
      input({ sim: sim({ phase: 'complete' }), report: report({}) }),
    ]
    for (const s of samples) expect(ids.has(pickBeat(s)!.id)).toBe(true)
  })
})
