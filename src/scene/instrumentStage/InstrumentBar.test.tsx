import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { InstrumentBar } from './InstrumentBar'

describe('InstrumentBar', () => {
  const html = (chosen: string[], day: number) =>
    renderToString(<InstrumentBar chosen={chosen} day={day} onToggle={() => {}} />).replace(/<!-- -->/g, '')

  it('shows a locked instrument as locked and not pressable', () => {
    const out = html(['inst-laser'], 112)
    expect(out).toContain('Locked · needs Research Lab LV 3')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Neutron spectrometer/s)
  })

  it('keeps a locked instrument that is aboard removable', () => {
    expect(html(['inst-neutron'], 112)).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Neutron spectrometer/s)
  })

  it('shows no lock once the lab is high enough', () => {
    expect(html([], 122)).not.toContain('Locked')
  })
})
