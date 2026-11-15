import { describe, expect, it } from 'vitest'
import { newsDrawerOpen } from './newsDrawer'

describe('the notifications drawer', () => {
  it('stays folded when nothing asks for it, including once a mission is chosen', () => {
    expect(newsDrawerOpen({ openedByPlayer: false, decisionWaiting: false })).toBe(false)
  })

  it('opens when the player opens it', () => {
    expect(newsDrawerOpen({ openedByPlayer: true, decisionWaiting: false })).toBe(true)
  })

  it('opens by itself only for an event that needs a decision', () => {
    expect(newsDrawerOpen({ openedByPlayer: false, decisionWaiting: true })).toBe(true)
  })
})
