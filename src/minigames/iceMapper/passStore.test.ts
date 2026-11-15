import { beforeEach, describe, expect, it } from 'vitest'
import { passDue, useIcePassStore } from './passStore'

const sim = (phase: string, captured: boolean, seed = 7) => ({ seed, phase, flight: { captured } })

describe('first mapping pass hand-off', () => {
  beforeEach(() => useIcePassStore.setState({ played: false, doneSeed: null }))

  it('is due once the craft is in its science orbit, not before', () => {
    expect(passDue(sim('transfer', false), null)).toBe(false)
    expect(passDue(sim('capture', false), null)).toBe(false)
    expect(passDue(sim('orbit', true), null)).toBe(true)
  })

  it('is not due after the flight has ended or once this flight has had its pass', () => {
    expect(passDue(sim('failed', true), null)).toBe(false)
    expect(passDue(sim('complete', true), null)).toBe(false)
    expect(passDue(sim('orbit', true, 7), 7)).toBe(false)
    expect(passDue(sim('orbit', true, 8), 7)).toBe(true) // a new flight gets its own pass
  })

  it('can be skipped only after one has been flown', () => {
    useIcePassStore.getState().finish(7, false)
    expect(useIcePassStore.getState().played).toBe(false)
    useIcePassStore.getState().finish(8, true)
    expect(useIcePassStore.getState()).toMatchObject({ played: true, doneSeed: 8 })
    useIcePassStore.getState().finish(9, false)
    expect(useIcePassStore.getState().played).toBe(true)
  })
})
