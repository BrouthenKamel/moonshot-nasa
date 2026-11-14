import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})
import { FlightControls } from './FlightControls'
import { useGameStore } from '../../state/gameStore'
import { flashlightDesign } from '../../sim/fixtures'
import { getDefaultAction, initSim, isSimComplete, stepTurn } from '../../sim/simulate'
import type { SimState, TurnAction } from '../../sim/types'

function inOrbit(): SimState {
  for (let seed = 1; seed < 50; seed++) {
    let s = initSim(flashlightDesign, 'engineer', seed)
    const action: TurnAction = { ...getDefaultAction(), autoDecide: true }
    let n = 0
    while (!isSimComplete(s) && s.phase !== 'orbit' && n++ < 60) s = stepTurn(s, action)
    if (s.phase === 'orbit') return s
  }
  throw new Error('no seed reached orbit')
}

// F3 (Jakob, 14 Nov): a "This month" panel during the science turns
describe('FlightControls: This month', () => {
  beforeEach(() => useGameStore.getState().newGame())

  it('offers the month choices as a labelled radio group in the science orbit', () => {
    useGameStore.setState({ simState: inOrbit(), pendingAction: getDefaultAction() })
    const html = renderToString(<FlightControls />)
    expect(html).toContain('This month')
    expect(html).toContain('role="radiogroup"')
    expect(html.match(/role="radio"/g)?.length).toBe(3)
    expect(html).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Full science/)
    expect(html).toContain('Reduced')
    expect(html).toContain('Safe mode')
    expect(html).toContain('Buy an extra ground pass (0.1 M)')
    expect(html).toMatch(/type="checkbox"/)
  })

  it('shows the chosen mode as checked', () => {
    useGameStore.setState({ simState: inOrbit(), pendingAction: { ...getDefaultAction(), mode: 'safe-mode' } })
    const html = renderToString(<FlightControls />)
    expect(html).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Safe mode/)
  })

  it('is not shown before the science orbit', () => {
    useGameStore.setState({ simState: initSim(flashlightDesign, 'engineer', 1) })
    const html = renderToString(<FlightControls />)
    expect(html).not.toContain('This month')
  })
})
