import { describe, expect, it } from 'vitest'
import { STEP_ORDER as MAP_ORDER, STEP_NAMES as MAP_NAMES } from '../../viz/missionMap'
import { STEP_NAMES, STEP_ORDER, TAB_STEPS, nextLabel, nextStep, stepNumber, stepTitle } from './stepNumbers'

describe('one naming of the steps', () => {
  it('lists the steps in play order, with no separate rocket step', () => {
    expect(STEP_ORDER).toEqual(['brief', 'planning', 'instruments', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo'])
    expect(TAB_STEPS.map((s) => `${stepNumber(s)} ${STEP_NAMES[s]}`)).toEqual([
      '1 Plan',
      '2 Science',
      '3 Craft',
      '4 Orbit',
      '5 Ride',
      '6 Comms',
      '7 Launch',
    ])
  })

  it('is the one list the map reads too', () => {
    expect(MAP_ORDER).toBe(STEP_ORDER)
    expect(MAP_NAMES).toBe(STEP_NAMES)
  })

  it('reads the same on headings and next buttons', () => {
    expect(stepTitle('ride')).toBe('Ride: getting to the Moon')
    expect(nextLabel('orbit')).toBe('Next: Ride →')
    expect(nextLabel('brief')).toBe('Next: Plan →')
    expect(nextLabel('comms')).toBe('Next: Launch →')
    expect(nextLabel('go-nogo')).toBe('')
    for (const s of STEP_ORDER) expect(stepTitle(s).startsWith(`${STEP_NAMES[s]}: `)).toBe(true)
  })

  it('opens an old save made on the rocket step as the craft step', () => {
    expect(stepNumber('rocket')).toBe(stepNumber('spacecraft'))
    expect(nextStep('rocket')).toBe('orbit')
  })
})
