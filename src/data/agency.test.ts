import { describe, it, expect } from 'vitest'
import { buildings, instrumentLabLevel, researchLabLevel } from './agency'

describe('Research Lab level', () => {
  const up = buildings.find((b) => b.id === 'research-lab')!.upgrade!

  it('is level 2 until the upgrade finishes, then level 3', () => {
    expect(researchLabLevel(up.startDay)).toBe(2)
    expect(researchLabLevel(up.endDay - 0.01)).toBe(2)
    expect(researchLabLevel(up.endDay)).toBe(3)
    expect(researchLabLevel(up.endDay + 100)).toBe(3)
  })

  it('needs level 3 for the neutron spectrometer and nothing extra for the rest', () => {
    expect(instrumentLabLevel['inst-neutron']).toBe(3)
    for (const id of ['inst-ir-spec', 'inst-laser', 'inst-camera']) expect(instrumentLabLevel[id] ?? 1).toBe(1)
  })
})
