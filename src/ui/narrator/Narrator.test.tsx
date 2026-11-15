import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})
import { Narrator } from './Narrator'
import { beatKey } from './beats'
import { useNarratorPrefs } from './narratorPrefs'
import { useGameStore } from '../../state/gameStore'
import { BriefScreen } from '../steps/BriefScreen'
import { STEP_QUESTION } from '../kit'
import { STEP_NAMES, buildingName, firstStop } from '../../viz/missionMap'

describe('Narrator', () => {
  beforeEach(() => {
    useGameStore.getState().newGame()
    useNarratorPrefs.setState({ tipsOff: false, seen: [] })
  })

  it('renders a polite live region for its lines', () => {
    const html = renderToString(<Narrator />)
    expect(html).toContain('aria-live="polite"')
  })

  it('shows the line with one × and a plain "Don’t show tips" link, no header or menu', () => {
    const html = renderToString(<Narrator />).replace(/<!-- -->/g, '')
    expect(html).toContain('aria-label="Close tip"')
    expect(html).toContain('Don’t show tips')
    expect(html).not.toContain('CAPCOM')
    expect(html).not.toContain('Narrator options')
    expect(html).toContain('Commander Rosa Vega: ') // the speaker stays for screen readers
  })

  it('offers to bring tips back once they are switched off', () => {
    useNarratorPrefs.getState().setTipsOff(true)
    expect(renderToString(<Narrator />)).toContain('Show tips from Commander Rosa Vega again')
  })

  it('remembers flight beats per flight and lessons once', () => {
    expect(beatKey({ id: 'launch', text: '', scope: 'run' }, 42)).toBe('launch@42')
    expect(beatKey({ id: 'step-orbit', text: '', scope: 'game' }, 42)).toBe('step-orbit')
  })

  it('marks a beat seen only once', () => {
    useNarratorPrefs.getState().markSeen('start')
    useNarratorPrefs.getState().markSeen('start')
    expect(useNarratorPrefs.getState().seen).toEqual(['start'])
  })
})

describe('brief (I5a)', () => {
  it('names the first stop from the step order, as the map and the mission panel do', () => {
    const html = renderToString(<BriefScreen />)
    const stop = firstStop()
    expect(html).toContain(`Your first stop: ${STEP_NAMES[stop.step]} at the ${buildingName(stop.building)}.`)
    expect(html).toContain(STEP_QUESTION[stop.step])
  })
})
