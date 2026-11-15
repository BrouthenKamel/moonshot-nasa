import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})

import { CommsScreen } from './CommsScreen'
import { useGameStore } from '../../state/gameStore'
import { createDefaultDesign } from '../../sim/budgets'

/**
 * Comms cuts (Jakob, 15 Nov): the console keeps the controls (radio slot, dish aim, contact
 * hours), the separate Contact time panel is gone, each card shows one number, and the
 * "Arrow keys to switch" hint is gone.
 */
const render = () => {
  useGameStore.setState({ screen: 'design', designStep: 'comms', design: createDefaultDesign() })
  return renderToString(<CommsScreen />).replace(/<!-- -->/g, '')
}

describe('Comms screen cuts', () => {
  beforeEach(() => useGameStore.getState().resetDesign())

  it('sets the contact hours inside the link console, with a real range input', () => {
    const html = render()
    const console = html.slice(html.indexOf('aria-labelledby="link-console-title"'), html.indexOf('id="radio-tray-title"'))
    expect(console).toContain('data-testid="dish-aim-handle"')
    expect(console).toContain('data-testid="contact-time"')
    expect(console).toMatch(/<input[^>]*id="contact-hours"[^>]*type="range"/)
  })

  it('has no separate Contact time panel and no arrow-key hint', () => {
    const html = render()
    expect(html.match(/data-testid="contact-time"/g)).toHaveLength(1)
    expect(html).not.toContain('Hours a day booked on the dish. More hours carry more data but cost money every month.</p>')
    expect(html).not.toContain('Arrow keys to switch')
  })

  it('names the dish size as a choice: the sizes on the track, the trade-off and the price', () => {
    const html = render()
    const row = html.slice(html.indexOf('data-testid="dish-size"'), html.indexOf('data-testid="contact-time"'))
    expect(row).toContain('Dish size')
    expect(row).not.toContain('Aim dish')
    for (const label of ['University 4 m', 'Partner 21 m', 'DSN 34 m']) expect(row).toContain(label)
    // The new design books the Partner 21 m dish for 1 h a day at $0.03M per hour
    expect(row).toContain('64 kbps · up to 2 h a day')
    expect(row).toContain('$0.03M a month')
    expect(row).toMatch(/role="slider"[^>]*aria-label="Dish size"/)
  })

  it('keeps the station cards behind Details, so the dish size is the one control by default', () => {
    const html = render()
    const panel = html.slice(html.indexOf('data-testid="details-panel-comms-stations"'))
    expect(html).toContain('data-testid="details-toggle-comms-stations"')
    expect(panel).toContain('id="station-tray-title"')
    expect(panel.slice(0, 400)).toContain('inert')
  })

  it('shows one stat per radio and station card', () => {
    const html = render()
    const stats = (from: string, to: string) => {
      const part = html.slice(html.indexOf(from), to ? html.indexOf(to) : undefined)
      return (part.match(/<dt/g) ?? []).length
    }
    expect(stats('id="radio-tray-title"', 'id="station-tray-title"')).toBe(3)
    expect(stats('id="station-tray-title"', '')).toBe(3)
  })
})
