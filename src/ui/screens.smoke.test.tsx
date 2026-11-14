import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})
// The 3D island needs WebGL; render its labels as text instead
vi.mock('../scene/BaseMap', () => ({
  BaseMap: ({ labels }: { labels: Record<string, { status: string }> }) => (
    <div>
      {Object.entries(labels).map(([id, l]) => (
        <span key={id}>{l.status}</span>
      ))}
    </div>
  ),
}))
import App from '../App'
import { useGameStore } from '../state/gameStore'
import { useAgencyStore } from '../state/agencyStore'
import { flashlightDesign } from '../sim/fixtures'
import { initSim, flyUntilDecision, getDefaultAction } from '../sim/simulate'
import type { DesignStep } from '../sim/types'

/** Every screen renders with the ported model, without throwing. */
describe('screens render', () => {
  beforeEach(() => useGameStore.getState().newGame())

  it('the game starts on the agency map, with the difficulty picked there', () => {
    expect(useGameStore.getState().screen).toBe('base')
    const html = renderToString(<App />)
    expect(html).toContain('Agency dashboard')
    expect(html).toContain('Engineer')
    expect(html).not.toContain('Select Difficulty')
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

  it('the instruments summary counts in singular and plural', () => {
    const text = () => renderToString(<App />).replace(/<[^>]+>/g, '').replace(/<!-- -->/g, '')
    useGameStore.setState({ screen: 'design', designStep: 'instruments', design: flashlightDesign })
    expect(text()).toContain('1 instrument')
    expect(text()).not.toContain('1 instruments')
    useGameStore.setState({ design: { ...flashlightDesign, instruments: ['inst-laser', 'inst-neutron'] } })
    expect(text()).toContain('2 instruments')
  })

  it('the instrument step locks what the Research Lab has not unlocked', () => {
    const text = () => renderToString(<App />).replace(/<!-- -->/g, '')
    useAgencyStore.setState({ day: 112 })
    useGameStore.setState({ screen: 'design', designStep: 'instruments', design: flashlightDesign })
    const html = text()
    expect(html).toContain('Needs Research Lab LV 3 · now LV 2')
    // The neutron card cannot be picked while it is locked
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Neutron Spectrometer/s)
    useAgencyStore.setState({ day: 122 })
    expect(text()).not.toContain('Needs Research Lab LV 3')
  })

  it('a saved design holding a locked instrument keeps it and says so', () => {
    useAgencyStore.setState({ day: 112 })
    useGameStore.setState({
      screen: 'design',
      designStep: 'instruments',
      design: { ...flashlightDesign, instruments: ['inst-laser', 'inst-neutron'] },
    })
    const html = renderToString(<App />).replace(/<!-- -->/g, '')
    expect(html).toContain('Neutron Spectrometer is in your design but the Research Lab has not unlocked it yet')
    expect(useGameStore.getState().design.instruments).toEqual(['inst-laser', 'inst-neutron'])
  })

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

  it('base screen shows a waiting event card and keeps it after leaving and coming back', () => {
    let s = initSim(flashlightDesign, 'engineer', 1)
    for (let seed = 1; seed <= 300; seed++) {
      s = flyUntilDecision(initSim(flashlightDesign, 'engineer', seed), getDefaultAction())
      if (s.pendingDecision) break
    }
    useAgencyStore.getState().resetAgency()
    useAgencyStore.getState().markLunarMissionStarted()
    useAgencyStore.getState().startMissionClock()
    useGameStore.setState({ screen: 'base', simState: s, design: flashlightDesign })
    const html = renderToString(<App />)
    expect(html).toContain(s.pendingDecision!.title)
    expect(html).not.toContain('NaN')
    useGameStore.getState().setScreen('design')
    useGameStore.getState().setScreen('base')
    expect(useGameStore.getState().simState!.currentTurn).toBe(s.currentTurn)
    expect(renderToString(<App />)).toContain(s.pendingDecision!.title)
  })

  it('base screen labels show core numbers while designing', () => {
    useAgencyStore.getState().resetAgency()
    useAgencyStore.getState().markLunarMissionStarted()
    useGameStore.setState({ screen: 'base', simState: null, design: flashlightDesign })
    const html = renderToString(<App />)
    expect(html).toContain('14.0 / 14 kg')
    expect(html).toContain('Click a building to walk in')
  })
})
