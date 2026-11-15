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
import { StartOverDialog } from './screens/BaseScreen'
import { useGameStore } from '../state/gameStore'
import { useAgencyStore } from '../state/agencyStore'
import { useWorldStore } from '../state/worldStore'
import { flashlightDesign } from '../sim/fixtures'
import { initSim, flyUntilDecision, getDefaultAction } from '../sim/simulate'
import type { DesignStep } from '../sim/types'
import { clearOddsCache, estimateSuccess, planningOdds } from '../sim/odds'

/** Every screen renders with the ported model, without throwing. */
describe('screens render', () => {
  beforeEach(() => useGameStore.getState().newGame())

  it('the game starts on the base map, with no mission chosen yet', () => {
    useWorldStore.getState().resetWorld()
    expect(useGameStore.getState().screen).toBe('base')
    const html = renderToString(<App />)
    expect(html).toContain('No mission running')
    expect(html).toContain('New mission')
    expect(html).not.toContain('Select Difficulty')
  })

  // The agency layer: clock, funds, popularity, notifications and the current mission card.
  // Still no building levels, build plots or list of made-up missions.
  it('the base shows the agency layer and the current mission', () => {
    useWorldStore.getState().resetWorld()
    const html = renderToString(<App />).replace(/<!-- -->/g, '')
    for (const gone of ['PUBLIC SUPPORT', 'Funding trend', 'Upcoming', 'Reset demo', '+ BUILD', 'coming soon', '>Missions<', 'LV ']) {
      expect(html).not.toContain(gone)
    }
    expect(html).toContain('Day 112')
    expect(html).toContain('Pause time')
    expect(html).toContain('FUNDS')
    expect(html).toContain('POPULARITY')
    expect(html).toContain('Notifications')
    expect(html).not.toMatch(/Aurora-1|Relay Pathfinder|Solar Scout/)
    expect(html).toContain('Start over')
    expect(html).toContain('Mute sound')

    // Once a mission is chosen, its card shows the stage, the next step and a progress bar
    useWorldStore.getState().openMission()
    const open = renderToString(<App />).replace(/<!-- -->/g, '')
    expect(open).toContain('Lunar Ice Mapper')
    expect(open).toContain('Month 0')
    expect(open).not.toContain('Mission log') // before launch
    expect(open).toContain('Planning')
    expect(open).toContain('Next: Brief at the Communications Center')
    expect(open).toContain('role="progressbar"')
  })

  it('start over asks in the game first, then resets the mission on the base', () => {
    const dialog = renderToString(<StartOverDialog onCancel={() => {}} onConfirm={() => {}} />)
    expect(dialog).toContain('role="dialog"')
    expect(dialog).toContain('Start over?')
    expect(dialog).toContain('Keep going')
    useGameStore.getState().openBuilding('factory')
    useGameStore.getState().startNewMission()
    expect(useGameStore.getState().screen).toBe('base')
    expect(useGameStore.getState().visitedSteps).toEqual([])
  })

  // Jakob, 14 Nov: no difficulty levels for now; one fixed setting (the Engineer values)
  it('shows no difficulty anywhere and plays on the fixed Engineer values', () => {
    useGameStore.setState({ difficulty: 'cadet' })
    useGameStore.getState().newGame()
    expect(useGameStore.getState().difficulty).toBe('engineer')
    const pages = [renderToString(<App />)]
    for (const step of ['brief', 'planning', 'go-nogo'] as DesignStep[]) {
      useGameStore.setState({ screen: 'design', designStep: step })
      pages.push(renderToString(<App />))
    }
    for (const html of pages) {
      expect(html).not.toMatch(/Difficulty|Cadet|Flight Director|>Engineer</)
    }
  })

  const steps: DesignStep[] = ['brief', 'planning', 'instruments', 'rocket', 'spacecraft', 'orbit', 'ride', 'comms', 'go-nogo']
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

  it('MVP: the instrument step locks nothing and shows no lab level', () => {
    const text = () => renderToString(<App />).replace(/<!-- -->/g, '')
    useAgencyStore.setState({ day: 112 })
    useGameStore.setState({
      screen: 'design',
      designStep: 'instruments',
      design: { ...flashlightDesign, instruments: ['inst-laser'] },
    })
    const html = text()
    expect(html).not.toContain('Research Lab LV')
    expect(html).not.toContain('Needs Research Lab')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Neutron Spectrometer/s)
    useGameStore.setState({ design: { ...flashlightDesign, instruments: ['inst-laser', 'inst-neutron'] } })
    expect(text()).not.toContain('has not unlocked')
  })

  it('a red Go/No-Go row offers a button that walks to the building that fixes it', () => {
    const heavy = { ...flashlightDesign, solar: 'solar-body' }
    useGameStore.setState({ screen: 'design', designStep: 'go-nogo', design: heavy })
    const html = renderToString(<App />).replace(/<!-- -->/g, '')
    expect(html).toMatch(/<button[^>]*>Fix at the [A-Z][^<]*<\/button>/)
  })

  it('the ride and comms screens show real numbers', () => {
    useGameStore.setState({ screen: 'design', designStep: 'ride', design: flashlightDesign })
    expect(renderToString(<App />)).toContain('m/s')
    useGameStore.setState({ designStep: 'comms' })
    expect(renderToString(<App />)).toContain('MB/month')
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
    // The score explains itself when points are missing (Jakob, 14 Nov)
    const r = useGameStore.getState().currentReport!
    if (r.score.total < 1000) expect(report).toContain('What cost you points')

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
    const html = renderToString(<App />).replace(/<!-- -->/g, '')
    expect(html).toContain(s.pendingDecision!.title)
    expect(html).not.toContain('NaN')
    // The clock is the flight's month, and the mission log shows the flight's own events
    expect(html).toContain(`Month ${s.currentTurn}`)
    expect(html).toContain(`Event, month ${s.pendingDecision!.turn}`)
    expect(html).toContain('Mission log')
    expect(html).not.toMatch(/mission day/i)
    useGameStore.getState().setScreen('design')
    useGameStore.getState().setScreen('base')
    expect(useGameStore.getState().simState!.currentTurn).toBe(s.currentTurn)
    expect(renderToString(<App />)).toContain(s.pendingDecision!.title)
  })

  it('base screen labels show core numbers while designing', () => {
    useAgencyStore.getState().resetAgency()
    useAgencyStore.getState().markLunarMissionStarted()
    useGameStore.setState({ screen: 'base', simState: null, design: flashlightDesign })
    useWorldStore.getState().openMission() // designing: a mission was chosen (before that, New mission is the only start)
    const html = renderToString(<App />)
    expect(html).toContain('13.2 / 14 kg') // 14.0 before the balance redesign (lighter chemical module)
    expect(html).toContain('Click a building to walk in')
    expect(html).toContain('month 8')
    expect(html).not.toMatch(/\bturns?\b/i)
  })

  it('a finished mission: the top bar opens the report, and the log shows the end', () => {
    useGameStore.setState({ screen: 'base', simState: null, design: flashlightDesign, currentReport: null })
    useGameStore.getState().startSimulation()
    for (let i = 0; i < 80 && useGameStore.getState().currentReport === null; i++) {
      const st = useGameStore.getState()
      if (st.simState?.pendingDecision) st.answerEvent(st.simState.pendingDecision.options[0].id)
      else st.flyOn()
    }
    const sim = useGameStore.getState().simState!
    const html = renderToString(<App />).replace(/<!-- -->/g, '')
    expect(html).toContain(`Month ${sim.currentTurn}`)
    expect(html).toContain('See the report')
    expect(html).toContain('Mission log')
    expect(html).toMatch(/Success|Partial success|Failed/)
  })

  // F2 (Jakob, 14 Nov): the Go/No-Go review says how likely full success is
  it('Go/No-Go shows the chance of full success next to the verdict', () => {
    const design = { ...flashlightDesign, planning: { ...flashlightDesign.planning, testTurns: 1 } }
    useGameStore.setState({ screen: 'design', designStep: 'go-nogo', design })
    // Not worked out yet: says so instead of a number
    clearOddsCache()
    expect(renderToString(<App />)).toContain('Working out the chance of full success')
    const e = estimateSuccess(design, 'engineer')
    const html = renderToString(<App />)
    expect(html).toContain(`Chance of full success: about ${Math.round(e.success * 100)}%`)
  })

  it('the planning controls read out the chance of full success for each setting', () => {
    useGameStore.setState({ screen: 'design', designStep: 'planning', design: flashlightDesign })
    planningOdds(flashlightDesign, 'engineer')
    const html = renderToString(<App />)
    expect(html).toMatch(/Chance of full success: about \d+%/)
    expect(html).toMatch(/0 test months: about \d+%/)
    expect(html).toMatch(/20% reserve: about \d+%/)
  })
})
