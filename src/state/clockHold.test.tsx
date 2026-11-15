import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { StartOverDialog } from '../ui/screens/BaseScreen'

/*
 * The clock holds for any element marked aria-modal="true" (clockHold.ts). A playtester saw the
 * "Start over?" confirmation let days run: this keeps every confirmation on that marker.
 */
describe('modals the clock waits for', () => {
  it('the Start over confirmation marks itself modal', () => {
    const html = renderToString(<StartOverDialog onCancel={() => {}} onConfirm={() => {}} />)
    expect(html).toContain('aria-modal="true"')
  })
})
