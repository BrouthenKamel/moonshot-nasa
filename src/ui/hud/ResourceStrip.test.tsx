import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})
import { ResourceStrip } from './ResourceStrip'
import { useGameStore } from '../../state/gameStore'
import { flashlightDesign } from '../../sim/fixtures'

const strip = () => renderToString(<ResourceStrip />).replace(/<!-- -->/g, '')

describe('the header verdict chip', () => {
  beforeEach(() => {
    useGameStore.getState().newGame()
  })

  it('is plain text while nothing is red', () => {
    useGameStore.setState({ design: flashlightDesign })
    const html = strip()
    expect(html).not.toContain('<button')
  })

  it('becomes a button that says where the blocker is fixed, in the map\'s building names', () => {
    useGameStore.setState({ design: { ...flashlightDesign, propulsion: 'prop-coldgas' } })
    const html = strip()
    expect(html).toContain('BLOCKER')
    expect(html).toContain('<button')
    expect(html).toContain('Delta-v: Launch Site')
    expect(html).toContain('Click to go there')
  })
})
