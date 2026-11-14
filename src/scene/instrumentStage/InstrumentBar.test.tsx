import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { InstrumentBar } from './InstrumentBar'

describe('InstrumentBar', () => {
  const html = (chosen: string[], day: number) =>
    renderToString(<InstrumentBar chosen={chosen} day={day} onToggle={() => {}} />).replace(/<!-- -->/g, '')

  it('MVP: shows every instrument open and pressable, with no level text', () => {
    const out = html(['inst-laser'], 112)
    expect(out).not.toContain('Locked')
    expect(out).not.toMatch(/LV \d/)
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Neutron spectrometer/s)
  })

  it('shows no lock once the lab is high enough', () => {
    expect(html([], 122)).not.toContain('Locked')
  })
})
