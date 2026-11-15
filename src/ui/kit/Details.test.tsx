import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { Details, DetailsPanel, DetailsToggle } from './Details'
import { isDetailsOpen, setDetailsOpen, useDetailsStore } from './detailsState'

/** A sessionStorage stand-in: the tests run in Node, which has none */
function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    data,
  }
}

let storage: ReturnType<typeof fakeStorage>
beforeEach(() => {
  storage = fakeStorage()
  vi.stubGlobal('sessionStorage', storage)
  useDetailsStore.setState({ open: {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('Details state', () => {
  it('starts closed', () => {
    expect(isDetailsOpen('plan')).toBe(false)
  })

  it('remembers each screen on its own', () => {
    setDetailsOpen('plan', true)
    expect(isDetailsOpen('plan')).toBe(true)
    expect(isDetailsOpen('orbit')).toBe(false)
  })

  it('keeps the state for the browser tab, so a reload opens the screen the way it was left', () => {
    setDetailsOpen('plan', true)
    expect(storage.data.get('moonshot:details:plan')).toBe('1')
    // A fresh page: the in-memory state is gone, the tab's storage is not
    useDetailsStore.setState({ open: {} })
    expect(isDetailsOpen('plan')).toBe(true)
    setDetailsOpen('plan', false)
    useDetailsStore.setState({ open: {} })
    expect(isDetailsOpen('plan')).toBe(false)
  })

  it('still works when storage is blocked', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(isDetailsOpen('plan')).toBe(false)
    setDetailsOpen('plan', true)
    expect(isDetailsOpen('plan')).toBe(true)
  })
})

describe('Details control', () => {
  it('is a real button that names the panel it opens', () => {
    const html = renderToString(<Details id="plan">Schedule</Details>)
    expect(html).toMatch(/<button[^>]*type="button"/)
    expect(html).toContain('id="details-toggle-plan"')
    expect(html).toContain('aria-controls="details-panel-plan"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('id="details-panel-plan"')
    expect(html).toContain('aria-labelledby="details-toggle-plan"')
    expect(html).toContain('>Details<')
  })

  it('keeps a closed panel out of the tab order and away from screen readers', () => {
    const html = renderToString(<DetailsPanel id="plan">Schedule</DetailsPanel>)
    expect(html).toMatch(/inert=""/)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-open="false"')
  })

  it('opens: aria-expanded, the other label, and a live panel', () => {
    setDetailsOpen('plan', true)
    const html = renderToString(
      <>
        <DetailsToggle id="plan" openLabel="Hide the schedule" />
        <DetailsPanel id="plan">Schedule</DetailsPanel>
      </>
    )
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Hide the schedule')
    const panel = html.slice(html.indexOf('id="details-panel-plan"') - 5)
    expect(panel).not.toMatch(/inert/)
    expect(panel).not.toContain('aria-hidden')
    expect(panel).toContain('data-open="true"')
  })

  it('always renders the panel content, so the closed-to-open animation has something to grow', () => {
    expect(renderToString(<Details id="plan">The schedule wall</Details>)).toContain('The schedule wall')
  })
})
