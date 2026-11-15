import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})

import { GoNoGoScreen } from './GoNoGoScreen'
import { useGameStore } from '../../state/gameStore'
import { createDefaultDesign } from '../../sim/budgets'
import { flashlightDesign } from '../../sim/fixtures'
import { estimateSuccess } from '../../sim/odds'
import { checkHeadline } from '../../viz/gonogo/checkHeadline'
import type { CheckResult, Design } from '../../sim/types'

/**
 * Go/No-Go screen cuts (screen budget §2, Jakob 15 Nov): the poll runs on entry, the stamp stands
 * alone, issues are one line with a Fix link, everything else waits behind Details, ≤3 numbers.
 */

const render = (design: Design) => {
  useGameStore.setState({ screen: 'design', designStep: 'go-nogo', design })
  estimateSuccess(design, useGameStore.getState().difficulty) // the odds are worked out, as on screen after a moment
  return renderToString(<GoNoGoScreen />).replace(/<!-- -->/g, '')
}
/** What a player sees before opening Details, in the story view (engineer-only figures are hidden by CSS) */
const visibleText = (html: string) =>
  html
    .replace(/<details[\s\S]*<\/details>/, '')
    // The step header's "08" is shared step chrome (renumbered by stepNumbers.ts, PR 72), not a figure of this screen
    .replace(/(<h1[^>]*>[\s\S]*?)\b\d{2}\b/, '$1')
    .replace(/<(\w+) class="eng-only[^"]*"[^>]*>[^<]*<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&quot;|&amp;/g, ' ')
const numbersIn = (text: string) => text.match(/\d+(\.\d+)?/g) ?? []

describe('Go/No-Go screen cuts', () => {
  beforeEach(() => useGameStore.getState().newGame())

  it('the starting craft (cannot meet the brief): at most 3 numbers before Details', () => {
    const html = render(createDefaultDesign())
    const text = visibleText(html)
    expect(numbersIn(text).length, numbersIn(text).join(' ')).toBeLessThanOrEqual(3)
    expect(text).toMatch(/Chance of full success: about \d+%/)
  })

  it('a craft with red rows: at most 3 numbers before Details, one line per issue with its Fix link', () => {
    const html = render({ ...flashlightDesign, solar: 'solar-body', orbit: 'orbit-100km' })
    const text = visibleText(html)
    expect(numbersIn(text).length, numbersIn(text).join(' ')).toBeLessThanOrEqual(3)
    const lines = html.match(/data-testid="check-line"/g) ?? []
    const red = useGameStore.getState().getGoNoGo().checks.filter((c) => c.status !== 'green')
    expect(lines.length).toBe(red.length)
    expect(visibleText(html)).toContain('Fix at the')
  })

  it('no poll button and no sentence repeating the stamp', () => {
    const html = render(createDefaultDesign())
    expect(html).not.toContain('Run the poll')
    expect(html).not.toContain('Poll again')
    expect(html).not.toContain('it may fly, but even with no bad luck it falls short')
  })

  it('four lamps, without per-slip text', () => {
    const html = render(flashlightDesign)
    expect(html.match(/data-testid="poll-lamp"/g)?.length).toBe(4)
    expect(visibleText(html)).not.toContain('Nothing to check here')
    expect(visibleText(html)).not.toContain('Poll slip')
  })

  it('every check stays reachable behind Details, passed ones included (checklist)', () => {
    const html = render(flashlightDesign)
    const details = html.match(/<details[\s\S]*<\/details>/)![0]
    for (const c of useGameStore.getState().getGoNoGo().checks) expect(details).toContain(`>${c.resource}<`)
    expect(details).toContain('Passed (')
    expect(visibleText(html)).not.toContain('Passed (')
  })
})

describe('check headlines', () => {
  const c = (over: Partial<CheckResult>): CheckResult => ({ resource: 'Mass', status: 'red', value: 0, limit: 0, margin: 0, unit: '', reason: '', ...over })

  it('an explicit headline wins', () => {
    expect(checkHeadline(c({ resource: 'Power', headline: 'The array cannot even carry the bus', reason: 'In full sun 15 W…' }))).toBe('The array cannot even carry the bus')
  })
  it('a first clause without numbers is the headline', () => {
    expect(checkHeadline(c({ resource: 'Science', status: 'yellow', reason: 'No instrument on board can see into the shadowed craters: fit the laser…' }))).toBe(
      'No instrument on board can see into the shadowed craters'
    )
  })
  it('a first clause with numbers falls back to a fixed line', () => {
    expect(checkHeadline(c({ reason: 'The fuelled craft weighs 14.1 kg; the limit is 14 kg.' }))).toBe('Too heavy for the ride')
  })
})
