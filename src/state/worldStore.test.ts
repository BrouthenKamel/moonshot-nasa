import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { useWorldStore } from './worldStore'
import { useUiStore } from './uiStore'
import { IDLE_PAUSE_MS, autoPauseReason, clockHeld, modalOpenOnPage, noteInput } from './clockHold'
import { flashlightDesign } from '../sim/fixtures'
import { missionFunding } from '../game/economy'

/** Fly the current mission to its end through the game store, answering every card with its first option */
function flyToEnd() {
  for (let i = 0; i < 200; i++) {
    const sim = useGameStore.getState().simState!
    if (sim.phase === 'complete' || sim.phase === 'failed') return
    if (sim.pendingDecision) useGameStore.getState().answerEvent(sim.pendingDecision.options[0].id)
    else useGameStore.getState().advanceTurn()
  }
}

describe('agency layer follows the mission', () => {
  beforeEach(() => {
    useGameStore.getState().resetDemo()
    useWorldStore.getState().resetWorld()
    useGameStore.setState({ design: flashlightDesign })
  })

  it('pays the agency share when the mission launches', () => {
    const before = useWorldStore.getState()
    useGameStore.getState().startSimulation()
    const after = useWorldStore.getState()
    expect(after.mission).not.toBeNull()
    expect(after.funds).toBeCloseTo(before.funds - missionFunding(25, before.popularity).agencyPays, 5)
  })

  it('books the whole flight: news, money, popularity and settlement', () => {
    useGameStore.getState().startSimulation()
    flyToEnd()
    const w = useWorldStore.getState()
    expect(w.mission?.last.ended).toBe(true)
    expect(w.mission?.settled).toBe(true)
    expect(w.feed.length).toBeGreaterThan(3)
    expect(w.funds).toBeGreaterThanOrEqual(0)
    // The lab finishes the data that came home
    expect(w.research.processed).toBeCloseTo(w.research.received, 5)
  })

  it('resets with the demo', () => {
    useGameStore.getState().startSimulation()
    useGameStore.getState().advanceTurn()
    useGameStore.getState().resetDemo()
    expect(useWorldStore.getState().mission).toBeNull()
  })
})

describe('agency clock', () => {
  beforeEach(() => {
    useGameStore.getState().resetDemo()
    useWorldStore.getState().resetWorld()
    useGameStore.setState({ design: flashlightDesign })
    useWorldStore.getState().setSpeed('normal')
  })

  it('runs days and brings in government money', () => {
    const before = useWorldStore.getState()
    useWorldStore.getState().tick(1) // 1 day
    for (let i = 0; i < 29; i++) useWorldStore.getState().tick(1)
    const after = useWorldStore.getState()
    expect(after.day).toBeCloseTo(before.day + 30, 5)
    expect(after.funds).toBeGreaterThan(before.funds + 0.5)
  })

  it('stands still when paused', () => {
    const before = useWorldStore.getState().day
    useWorldStore.getState().setSpeed('paused')
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(before)
  })

  it('flies one mission month every 30 days and waits for event cards', () => {
    useGameStore.getState().startSimulation()
    const start = useWorldStore.getState().mission!.approvedDay
    useWorldStore.getState().setSpeed('fast')
    for (let i = 0; i < 400; i++) {
      const sim = useGameStore.getState().simState!
      if (sim.phase === 'complete' || sim.phase === 'failed') break
      if (sim.pendingDecision) {
        // The clock waits for the card
        const day = useWorldStore.getState().day
        useWorldStore.getState().tick(1)
        expect(useWorldStore.getState().day).toBe(day)
        useGameStore.getState().answerEvent(sim.pendingDecision.options[0].id)
        continue
      }
      useWorldStore.getState().tick(1) // 10 days
      const now = useGameStore.getState().simState!
      // The mission is never ahead of the clock
      expect(useWorldStore.getState().day).toBeGreaterThanOrEqual(start + now.currentTurn * 30 - 1e-6)
    }
    const w = useWorldStore.getState()
    expect(w.mission?.last.ended).toBe(true)
    expect(w.mission?.settled).toBe(true)
  })
})

describe('agency clock and the launch', () => {
  beforeEach(() => {
    useGameStore.getState().resetDemo()
    useWorldStore.getState().resetWorld()
    useUiStore.setState({ launchAt: null })
    useGameStore.setState({ design: flashlightDesign })
    useWorldStore.getState().setSpeed('fast')
  })

  it('stops at liftoff and holds while the launch animation plays', () => {
    useGameStore.getState().startSimulation()
    // Fly the build months on the clock until the craft launches
    for (let i = 0; i < 200 && useGameStore.getState().simState!.flight.launchedTurn === null; i++) {
      const sim = useGameStore.getState().simState!
      if (sim.pendingDecision) useGameStore.getState().answerEvent(sim.pendingDecision.options[0].id)
      else useWorldStore.getState().tick(1)
    }
    const sim = useGameStore.getState().simState!
    const w = useWorldStore.getState()
    const launchDay = w.mission!.approvedDay + sim.flight.launchedTurn! * 30
    // The tick that launched stopped on the launch day: no day of the trip has passed yet
    expect(w.day).toBeCloseTo(launchDay, 5)

    // While the rocket lifts off on the island, the clock waits
    useUiStore.getState().startLaunch()
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBeCloseTo(launchDay, 5)

    // Once it has gone, the trip starts
    useUiStore.getState().endLaunch()
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBeGreaterThan(launchDay)
  })
})

describe('the clock waits while the player reads', () => {
  beforeEach(() => {
    useGameStore.getState().resetDemo()
    useWorldStore.getState().resetWorld()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    noteInput()
  })

  it('a fresh game starts paused and stays paused until the first real action', () => {
    const start = useWorldStore.getState()
    expect(start.speed).toBe('paused')
    expect(start.clockStarted).toBe(false)
    for (let i = 0; i < 10; i++) useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(start.day)
    expect(useWorldStore.getState().funds).toBe(start.funds)
  })

  it('choosing a mission leaves the clock paused until the player presses Play', () => {
    const start = useWorldStore.getState().day
    useWorldStore.getState().openMission()
    expect(useWorldStore.getState().speed).toBe('paused')
    for (let i = 0; i < 5; i++) useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(start)
    useWorldStore.getState().setSpeed('normal')
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBeCloseTo(start + 1, 5)
  })

  it('a paused clock stays paused when a modal opens and closes', () => {
    const start = useWorldStore.getState().day
    let modal: object | null = {}
    vi.stubGlobal('document', { querySelector: (sel: string) => (sel === '[aria-modal="true"]' ? modal : null) })
    useWorldStore.getState().tick(1)
    modal = null // the player closed the dialog
    for (let i = 0; i < 5; i++) useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(start)
    expect(useWorldStore.getState().speed).toBe('paused')
  })

  it('Play starts it too, and a later mission keeps the speed the player chose', () => {
    useWorldStore.getState().setSpeed('paused') // an explicit choice
    useWorldStore.getState().openMission()
    expect(useWorldStore.getState().speed).toBe('paused')
    useWorldStore.getState().setSpeed('fast')
    useWorldStore.getState().openMission()
    expect(useWorldStore.getState().speed).toBe('fast')
  })

  it('holds while a modal is open over the base, and runs again once it closes', () => {
    useWorldStore.getState().setSpeed('normal')
    let modal: object | null = {}
    vi.stubGlobal('document', { querySelector: (sel: string) => (sel === '[aria-modal="true"]' ? modal : null) })
    const start = useWorldStore.getState().day
    for (let i = 0; i < 9; i++) useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(start)
    modal = null
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBeCloseTo(start + 1, 5)
  })

  it('a hidden tab pauses the clock for real: it stays paused when the tab comes back', () => {
    useWorldStore.getState().setSpeed('normal')
    const page = { hidden: true, querySelector: () => null }
    vi.stubGlobal('document', page)
    const start = useWorldStore.getState().day
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().speed).toBe('paused')
    page.hidden = false
    for (let i = 0; i < 5; i++) useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(start) // only the player's Play resumes it
    useWorldStore.getState().setSpeed('normal')
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBeCloseTo(start + 1, 5)
  })

  it('five minutes without input pause the clock until Play', () => {
    useWorldStore.getState().setSpeed('fast')
    noteInput(performance.now() - IDLE_PAUSE_MS - 1)
    const start = useWorldStore.getState().day
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(start)
    expect(useWorldStore.getState().speed).toBe('paused')
    noteInput() // the player is back, but the clock waits for Play
    useWorldStore.getState().tick(1)
    expect(useWorldStore.getState().day).toBe(start)
  })

  it('Reset demo pauses the fresh game again', () => {
    useWorldStore.getState().setSpeed('fast')
    useWorldStore.getState().resetWorld()
    expect(useWorldStore.getState().speed).toBe('paused')
    expect(useWorldStore.getState().clockStarted).toBe(false)
  })
})

describe('clockHeld', () => {
  it('holds for an event card, the launch, or an open modal, and only then', () => {
    const none = { decisionWaiting: false, launching: false, modalOpen: false }
    expect(clockHeld(none)).toBe(false)
    expect(clockHeld({ ...none, decisionWaiting: true })).toBe(true)
    expect(clockHeld({ ...none, launching: true })).toBe(true)
    expect(clockHeld({ ...none, modalOpen: true })).toBe(true)
  })

  it('auto-pauses for a hidden tab or a long idle stretch, and only then', () => {
    expect(autoPauseReason({ hidden: false, idleMs: 0 })).toBeNull()
    expect(autoPauseReason({ hidden: false, idleMs: IDLE_PAUSE_MS - 1 })).toBeNull()
    expect(autoPauseReason({ hidden: true, idleMs: 0 })).toBe('hidden')
    expect(autoPauseReason({ hidden: false, idleMs: IDLE_PAUSE_MS })).toBe('idle')
  })

  it('sees no modal without a page (tests, server render)', () => {
    expect(modalOpenOnPage()).toBe(false)
  })
})
