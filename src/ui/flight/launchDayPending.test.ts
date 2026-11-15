import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLaunchDayPending, isLaunchDayPending, markLaunchDayPending, resumeLaunchDay } from './launchDayPending'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

/** A saved flight: lifted off (or not), with this seed */
const flight = (seed: number, launchedTurn: number | null) => ({ seed, flight: { launchedTurn, launchTurn: 8 } }) as never

// Integration review, 15 Nov: a reload during Launch Day skipped on into the flight and lost the ride
describe('Launch Day survives a reload', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('is pending from liftoff until its onDone clears it', () => {
    expect(isLaunchDayPending(42)).toBe(false)
    markLaunchDayPending(42)
    expect(isLaunchDayPending(42)).toBe(true)
    clearLaunchDayPending()
    expect(isLaunchDayPending(42)).toBe(false)
  })

  it('resumes a saved flight that lifted off with the ride unflown, and only that flight', () => {
    markLaunchDayPending(42)
    expect(resumeLaunchDay(flight(42, 8))).toBe(true)
    // A marker left over from another flight never reopens the game
    expect(resumeLaunchDay(flight(7, 8))).toBe(false)
    // Still on the pad: the launch has not started, nothing to resume
    expect(resumeLaunchDay(flight(42, null))).toBe(false)
  })

  it('resumes the launch month that waits on a deployment card too', () => {
    markLaunchDayPending(42)
    const waiting = { seed: 42, flight: { launchedTurn: null, launchTurn: 8 }, pendingDecision: { key: 'no-signal', turn: 8 } } as never
    expect(resumeLaunchDay(waiting)).toBe(true)
  })

  it('never resumes once the ride is flown', () => {
    markLaunchDayPending(42)
    clearLaunchDayPending()
    expect(resumeLaunchDay(flight(42, 8))).toBe(false)
  })

  it('keeps working when storage is blocked', () => {
    const boom = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    expect(() => markLaunchDayPending(42)).not.toThrow()
    expect(isLaunchDayPending(42)).toBe(false)
    expect(() => clearLaunchDayPending()).not.toThrow()
  })
})
