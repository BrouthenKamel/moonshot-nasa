import { describe, it, expect } from 'vitest'
import { buildings, EXTENSION_INSTRUMENT_LAB_LEVEL, instrumentLabLevel, researchLabLevel } from './agency'

describe('Research Lab level', () => {
  const up = buildings.find((b) => b.id === 'research-lab')!.upgrade!

  it('is level 2 until the upgrade finishes, then level 3', () => {
    expect(researchLabLevel(up.startDay)).toBe(2)
    expect(researchLabLevel(up.endDay - 0.01)).toBe(2)
    expect(researchLabLevel(up.endDay)).toBe(3)
    expect(researchLabLevel(up.endDay + 100)).toBe(3)
  })

  it('locks no instrument in the MVP: every part is available', () => {
    expect(instrumentLabLevel).toEqual({})
  })

  it('keeps the agency extension table: level 3 for the neutron spectrometer', () => {
    expect(EXTENSION_INSTRUMENT_LAB_LEVEL['inst-neutron']).toBe(3)
  })
})
