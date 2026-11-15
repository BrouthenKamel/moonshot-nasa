import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { PlanNav, PlanVSlider } from './PlanPanel'
import { transferBlocker, positionOfDays, daysAt, type TransferPlan } from '../../../viz/ride/transferPlan'

const text = (html: string) => html.replace(/<!-- -->/g, '')

describe('PlanNav', () => {
  it('disables the way on and says why when the next step is blocked', () => {
    const html = text(
      renderToString(<PlanNav back={{ label: '← Launch', to: () => {} }} next={{ label: 'Comms →', to: 'comms', blockedBy: 'Fix the transfer first' }} />)
    )
    expect(html).toContain('Fix the transfer first')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Comms →/)
  })

  it('leaves the way on open without a reason', () => {
    const html = text(renderToString(<PlanNav back={{ label: '← Launch', to: () => {} }} next={{ label: 'Comms →', to: 'comms' }} />))
    expect(html).not.toContain('Fix the transfer first')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Comms →/)
  })
})

describe('PlanVSlider marks', () => {
  it('draws each mark as a labelled button', () => {
    const html = text(
      renderToString(
        <PlanVSlider
          label="Flight time"
          value={0.5}
          onChange={() => {}}
          valueText="20 days"
          topText="120 days"
          bottomText="4 days"
          marks={[
            { at: 0, label: 'Direct, 4–5 days (needs a chemical engine)' },
            { at: positionOfDays(90), label: 'Low-energy, 90+ days (CAPSTONE took about 4 months)' },
          ]}
        />
      )
    )
    expect(html).toContain('Direct, 4–5 days (needs a chemical engine)')
    expect(html).toContain('Low-energy, 90+ days (CAPSTONE took about 4 months)')
    expect((html.match(/data-testid="slider-mark"/g) ?? []).length).toBe(2)
  })

  it('the marks sit on the real day counts', () => {
    expect(daysAt(0)).toBe(4)
    expect(daysAt(positionOfDays(90))).toBe(90)
  })
})

describe('transferBlocker', () => {
  const ok = { checks: [{ label: 'Fuel', status: 'green', reason: '' }], ionEngine: false, days: 20, minDays: 4, cruiseMonths: 1 } as unknown as TransferPlan
  it('is null when nothing is red', () => expect(transferBlocker(ok)).toBeNull())
  it('blocks on a red Fuel check', () =>
    expect(transferBlocker({ ...ok, checks: [{ label: 'Fuel', status: 'red', reason: 'x' }] })).toBe('Fix the transfer first'))
  it('does not block on a yellow check', () =>
    expect(transferBlocker({ ...ok, checks: [{ label: 'Fuel', status: 'yellow', reason: 'x' }] })).toBeNull())
  it('does not block on a red Budget row: Comms costs are set on the next screen', () =>
    expect(transferBlocker({ ...ok, checks: [{ label: 'Budget', status: 'red', reason: 'x' }] })).toBeNull())
  it('blocks an ion engine on a fast flight', () =>
    expect(transferBlocker({ ...ok, ionEngine: true, days: 4, minDays: 90 })).toBe('Fix the transfer first'))
  it('blocks when the Moon is never reached', () => expect(transferBlocker({ ...ok, cruiseMonths: null })).toBe('Fix the transfer first'))
})
