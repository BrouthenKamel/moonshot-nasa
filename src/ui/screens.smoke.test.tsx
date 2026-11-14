import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})
import App from '../App'
import { useGameStore } from '../state/gameStore'
import { flashlightDesign } from '../sim/fixtures'
import { initSim, flyUntilDecision, getDefaultAction } from '../sim/simulate'
import type { DesignStep } from '../sim/types'

/** Every screen renders with the ported model, without throwing. */
describe('screens render', () => {
  beforeEach(() => useGameStore.getState().newGame())

  it('title', () => {
    expect(renderToString(<App />)).toContain('Moonshot')
  })

  const steps: DesignStep[] = ['brief', 'planning', 'instruments', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']
  for (const step of steps) {
    it(`design step ${step}`, () => {
      useGameStore.setState({ screen: 'design', designStep: step })
      const html = renderToString(<App />)
      expect(html.length).toBeGreaterThan(500)
      expect(html).not.toContain('NaN')
    })
  }

  it('the ride and comms screens show real numbers', () => {
    useGameStore.setState({ screen: 'design', designStep: 'ride', design: flashlightDesign })
    expect(renderToString(<App />)).toContain('m/s')
    useGameStore.setState({ designStep: 'comms' })
    expect(renderToString(<App />)).toContain('MB/turn')
  })

  it('simulation with an event card, then the report', () => {
    let s = initSim(flashlightDesign, 'engineer', 1)
    for (let seed = 1; seed <= 300; seed++) {
      s = flyUntilDecision(initSim(flashlightDesign, 'engineer', seed), getDefaultAction())
      if (s.pendingDecision) break
    }
    expect(s.pendingDecision).toBeDefined()
    useGameStore.setState({ screen: 'simulation', simState: s, design: flashlightDesign })
    const html = renderToString(<App />)
    expect(html).toContain(s.pendingDecision!.title)
    expect(html).not.toContain('NaN')

    // Finish the flight through the store, answering every card
    const store = useGameStore.getState()
    store.answerEvent(s.pendingDecision!.options[0].id)
    for (let i = 0; i < 60 && useGameStore.getState().currentReport === null; i++) {
      const st = useGameStore.getState()
      if (st.simState?.pendingDecision) st.answerEvent(st.simState.pendingDecision.options[0].id)
      else st.flyOn()
    }
    expect(useGameStore.getState().currentReport).not.toBeNull()
    useGameStore.getState().showReport()
    const report = renderToString(<App />)
    expect(report).toContain('/ 1000')
    expect(report).not.toContain('NaN')

    useGameStore.getState().openReplay()
    expect(renderToString(<App />)).toContain('Mission Replay')
  })
})
