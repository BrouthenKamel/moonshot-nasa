import { describe, expect, it } from 'vitest'
import { liftoffReached } from './launchOrder'

const flight = (launchedTurn: number | null) => ({ launchedTurn, launchTurn: 8 }) as never
const decision = (key: string, turn: number) => ({ key, turn, title: '', text: '', options: [] }) as never

// Integration review, 15 Nov: "No signal after deployment" came up before the player flew the ride
describe('liftoffReached', () => {
  it('is false on the pad and true once the core records liftoff', () => {
    expect(liftoffReached({ flight: flight(null) })).toBe(false)
    expect(liftoffReached({ flight: flight(8) })).toBe(true)
  })

  it('counts the launch month that stops on a deployment event as flown, so Launch Day plays first', () => {
    expect(liftoffReached({ flight: flight(null), pendingDecision: decision('no-signal', 8) })).toBe(true)
  })

  it('does not count a ground event, or a deployment event from another month', () => {
    expect(liftoffReached({ flight: flight(null), pendingDecision: decision('build-delay', 8) })).toBe(false)
    expect(liftoffReached({ flight: flight(null), pendingDecision: decision('no-signal', 7) })).toBe(false)
  })
})
