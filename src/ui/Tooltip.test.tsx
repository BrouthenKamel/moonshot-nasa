import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { Tooltip } from './Tooltip'
import { getGlossaryEntry, glossaryForPart, glossaryKeyForLabel } from '../data/glossary'

describe('glossary (QC #54)', () => {
  it('explains the jargon the game shows', () => {
    for (const key of ['adcs', 'uhf', 's-band', 'x-band', 'rad-hard', 'star-tracker', 'wh', 'delta-v', 'eclipse-margin', 'data-margin'])
      expect(getGlossaryEntry(key)?.definition.length).toBeGreaterThan(40)
  })

  it('finds the entry for a dashboard or Go/No-Go label', () => {
    expect(glossaryKeyForLabel('Delta-v margin')).toBe('delta-v')
    expect(glossaryKeyForLabel('Eclipse margin')).toBe('eclipse-margin')
    expect(glossaryKeyForLabel('Data Link')).toBe('data-margin')
    expect(glossaryKeyForLabel('Power')).toBe('wh')
    expect(glossaryKeyForLabel('Time')).toBeUndefined()
  })

  it('finds the jargon in a part', () => {
    expect(glossaryForPart('Precision + star tracker. Precision ADCS').map((e) => e.term)).toEqual([
      'ADCS (attitude control)',
      'Star tracker',
    ])
    expect(glossaryForPart('Rad-hard, redundant')[0].term).toContain('Rad-hard')
    expect(glossaryForPart('Basic')).toEqual([])
  })
})

describe('Tooltip', () => {
  it('can be reached by keyboard and names its explanation for screen readers', () => {
    const html = renderToString(<Tooltip term="delta-v">Delta-v</Tooltip>)
    expect(html).toContain('tabindex="0"')
    const id = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`id="${id}"`)
    expect(html).toContain('role="tooltip"')
    expect(html).toContain('The change in velocity')
  })

  it('leaves the label alone when the term is unknown', () => {
    expect(renderToString(<Tooltip term="nothing">Time</Tooltip>)).toBe('Time')
  })
})
