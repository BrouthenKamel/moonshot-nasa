import { describe, it, expect } from 'vitest'
import { createDefaultDesign } from '../../sim/budgets'
import { flashlightDesign } from '../../sim/fixtures'
import { flyUntilDecision, getDefaultAction, initSim, runSimulation, stepTurn } from '../../sim/simulate'
import { flightShot } from './flightDirector'
import { endCaption } from './endCaption'

describe('the space view says how a flight ended (QC, 15 Nov)', () => {
  it('a craft lost at deployment: "Lost at deployment", though the camera shot still reads transfer', () => {
    const card = flyUntilDecision(initSim(createDefaultDesign(), 'engineer', 3), getDefaultAction())
    expect(card.pendingDecision?.key).toBe('no-signal')
    const lost = stepTurn(card, { ...getDefaultAction(), choices: { 'no-signal': 'accept' } })
    expect(lost.flight.end).toBe('lost contact after deployment')
    // What made the caption say "On the way to the Moon": the shot as FlightStage asks for it
    const shot = flightShot(lost.design, lost.turnLogs, lost.turnLogs.length - 1, { terminal: 'failed', transferLeft: lost.flight.transferLeft, monthFraction: 0 })
    expect(shot.stage).toBe('transfer')
    expect(endCaption(lost)).toBe('Lost at deployment · no signal since launch')
  })

  it('a mission that ended another way says so', () => {
    const done = runSimulation(flashlightDesign, 'engineer', 1)
    expect(['failed', 'complete']).toContain(done.phase)
    expect(endCaption(done)).toMatch(/^(Mission over|Lost)/)
  })

  it('still flying: no end caption', () => {
    expect(endCaption(initSim(flashlightDesign, 'engineer', 1))).toBeNull()
  })
})
