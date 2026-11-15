import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { BenchControls, TitleLine } from './Overlays'

describe('BenchControls', () => {
  const html = (altitudeKm: number) =>
    renderToString(<BenchControls altitudeKm={altitudeKm} looking={false} hasInstruments onToggleLookThrough={() => {}} />).replace(/<!-- -->/g, '')
  it('keeps Look through and says, with one number, which orbit it tests at', () => {
    expect(html(15)).toContain('Look through')
    expect(html(15)).toContain('Tested at your planned orbit, 15 km over the pole: change it in Orbit')
  })
  it('has no altitude lever or what-if dials any more', () => {
    expect(html(15)).not.toContain('altitude-lever')
    expect(html(100)).not.toContain('100 km</span>')
  })
})

describe('TitleLine', () => {
  it('names the building, the mission and the step in the shared format', () => {
    expect(renderToString(<TitleLine />)).toContain('RESEARCH LAB · LUNAR ICE MAPPER · INSTRUMENTS')
  })
})
