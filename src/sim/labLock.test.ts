import { describe, it, expect } from 'vitest'
import { computeBudgets } from './budgets'
import { goNoGo } from './checks'
import { lunahMapDesign, flashlightDesign, iceCubeDesign } from './fixtures'

// Demo days: the Research Lab is LV 2 on day 112 and reaches LV 3 on day 122.
describe('Go / No-Go and the Research Lab level', () => {
  const run = (day?: number) => goNoGo(lunahMapDesign, computeBudgets(lunahMapDesign, 'engineer'), day)

  it('blocks a design holding an instrument above the lab level, and says why', () => {
    const result = run(112)
    const lab = result.checks.find((c) => c.resource === 'Research Lab')
    expect(lab?.status).toBe('red')
    expect(lab?.reason).toBe('Neutron Spectrometer needs Research Lab level 3; the lab is level 2 (upgrade done in 10 days at the base; let time run with ▶).')
    expect(lab?.fixStep).toBe('instruments')
    expect(result.canGo).toBe(false)
  })

  it('has no lab check without a base day', () => {
    expect(run().checks.some((c) => c.resource === 'Research Lab')).toBe(false)
  })

  it('has no lab check once the lab is high enough', () => {
    expect(run(122).checks.some((c) => c.resource === 'Research Lab')).toBe(false)
  })

  it('has no lab check when nothing aboard is locked', () => {
    const b = computeBudgets(flashlightDesign, 'engineer')
    expect(goNoGo(flashlightDesign, b, 112).checks.some((c) => c.resource === 'Research Lab')).toBe(false)
  })
})

describe('Science advice and the Research Lab level', () => {
  const OLD = 'fit the laser reflectometer or the neutron spectrometer at the Research Lab'
  const NEW = 'fit the laser reflectometer (the neutron spectrometer unlocks at Research Lab level 3)'
  const science = (day?: number) =>
    goNoGo(iceCubeDesign, computeBudgets(iceCubeDesign, 'engineer'), day).checks.find((c) => c.resource === 'Science')!.reason

  it('does not suggest the neutron spectrometer while it is locked', () => {
    expect(science(112)).toContain(NEW)
    expect(science(112)).not.toContain(OLD)
  })

  it('suggests both once the lab is high enough, or when no base day is given', () => {
    expect(science(122)).toContain(OLD)
    expect(science()).toContain(OLD)
  })
})
