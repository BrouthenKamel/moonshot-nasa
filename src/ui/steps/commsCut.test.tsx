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
import { groundStations } from '../../data/ground'
import { radios } from '../../data/parts'

/**
 * Comms cuts on the one-screen layout (Jakob, 15 Nov): each radio and dish tile shows one
 * number, its data home a month; the other figures show on hover; one control for the hours.
 */
const render = () => {
  useGameStore.setState({ screen: 'design', designStep: 'comms', design: createDefaultDesign() })
  return renderToString(<CommsScreen />).replace(/<!-- -->/g, '')
}

/** The visible text of each choice tile, keyed by its id, with its hover title */
const tiles = (html: string) =>
  [...html.matchAll(/<button[^>]*data-choice-id="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map(([open, id, body]) => ({
    id,
    title: open.match(/title="([^"]*)"/)?.[1] ?? '',
    text: body
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&quot;|&amp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }))

describe('Comms screen cuts', () => {
  beforeEach(() => useGameStore.getState().resetDesign())

  it('shows one number on each radio and dish tile', () => {
    const all = tiles(render())
    expect(all.map((t) => t.id).sort()).toEqual([...radios.map((r) => r.id), ...groundStations.map((g) => g.id)].sort())
    for (const t of all) {
      // The names carry sizes ("about 4 m", "21 m", "34 m"); the tile's figures are what counts
      const name = (radios.find((r) => r.id === t.id)?.name ?? groundStations.find((g) => g.id === t.id)?.name ?? '').replace(/'/g, ' ')
      const figures = t.text.replace(name, '').match(/\d[\d,.]*/g) ?? []
      expect(figures.length, `${t.id}: ${t.text}`).toBeLessThanOrEqual(1)
    }
  })

  it('puts the other figures on hover: cost and size for a radio, rate, price and hours for a dish', () => {
    const all = tiles(render())
    const partner = all.find((t) => t.id === 'ground-medium')!
    expect(partner.title).toMatch(/^64 kbps · \$\d+k a month · up to 2 h a day$/)
    expect(partner.text).toContain('Outages sometimes')
    const iris = all.find((t) => t.id === 'radio-sband')!
    expect(iris.title).toMatch(/kg · .* U · \$/)
  })

  it('names the chosen dish trade-off and monthly price on the dish row', () => {
    const html = render()
    const row = html.slice(html.indexOf('Dish on Earth'), html.indexOf('data-choice-id="ground-small"'))
    // The new design books the Partner 21 m dish for 1 h a day
    expect(row).toMatch(/Partner 21 m Dish: 64 kbps, up to 2 h a day · \$\d+k a month/)
  })

  it('has one control for the dish hours', () => {
    const html = render()
    expect(html.match(/id="contact-hours"/g)).toHaveLength(1)
    expect(html).not.toContain('Arrow keys to switch')
  })
})
