import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ReadOuts, TitleLine } from './Overlays'
import { stageModel } from './stageModel'
import { flashlightDesign } from '../../sim/fixtures'

describe('ReadOuts', () => {
  const m = stageModel(flashlightDesign, 'engineer', { orbit: 'orbit-100km', precise: true })
  it('marks the read-outs as a what-if view when a dial differs from the design', () => {
    expect(renderToString(<ReadOuts views={m.instruments} overShadow={false} isWhatIf />)).toContain('What-if view')
  })
  it('has no what-if mark for the real design', () => {
    expect(renderToString(<ReadOuts views={m.instruments} overShadow={false} isWhatIf={false} />)).not.toContain('What-if view')
  })
})

describe('TitleLine', () => {
  it('names the building, the mission and the step in the shared format', () => {
    expect(renderToString(<TitleLine />)).toContain('RESEARCH LAB · LUNAR ICE MAPPER · INSTRUMENTS')
  })
})
