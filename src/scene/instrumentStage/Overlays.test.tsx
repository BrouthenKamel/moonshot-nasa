import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ForecastPanel, TitleLine } from './Overlays'
import { stageModel } from './stageModel'
import { flashlightDesign } from '../../sim/fixtures'

describe('ForecastPanel', () => {
  const m = stageModel(flashlightDesign, 'engineer')
  const html = renderToString(<ForecastPanel forecast={m.forecast} altitudeKm={m.altitudeKm} />).replace(/<!-- -->/g, '')
  it('says, with one number, which orbit the lab tests at', () => {
    expect(html).toContain('Tested at your planned orbit, 15 km over the pole: change it in Orbit')
  })
  it('has no Look through control or altitude lever', () => {
    expect(html).not.toContain('Look through')
    expect(html).not.toContain('altitude-lever')
  })
})

describe('TitleLine', () => {
  it('names the building, the mission and the step in the shared format', () => {
    expect(renderToString(<TitleLine />)).toContain('RESEARCH LAB · LUNAR ICE MAPPER · INSTRUMENTS')
  })
})
