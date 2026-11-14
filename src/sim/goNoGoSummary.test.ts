import { describe, it, expect } from 'vitest'
import { computeBudgets } from './budgets'
import { goNoGo, getGoNoGoSummary, cannotMeetBrief } from './checks'
import { flashlightDesign, iceCubeDesign } from './fixtures'
import type { Design } from './types'

const result = (d: Design) => goNoGo(d, computeBudgets(d, 'engineer'))

// Jakob, 14 Nov: a Go must not read as an endorsement of a craft that cannot succeed
describe('Go/No-Go headline', () => {
  it('says Go, but this craft cannot meet the brief, when Science is not green', () => {
    const r = result(iceCubeDesign) // IR spectrometer only: flies, but cannot see into shadow
    expect(r.canGo).toBe(true)
    expect(r.checks.find((c) => c.resource === 'Science')!.status).not.toBe('green')
    expect(cannotMeetBrief(r)).toBe(true)
    expect(getGoNoGoSummary(r)).toMatch(/^Go, but this craft cannot meet the brief/)
  })

  it('stays a plain Go for a craft that can meet the brief', () => {
    const r = result(flashlightDesign)
    expect(cannotMeetBrief(r)).toBe(false)
    expect(getGoNoGoSummary(r)).not.toMatch(/cannot meet the brief/)
  })

  it('a No-Go stays a No-Go', () => {
    const r = result({ ...flashlightDesign, radio: 'radio-uhf' })
    expect(r.canGo).toBe(false)
    expect(cannotMeetBrief(r)).toBe(false)
    expect(getGoNoGoSummary(r)).toMatch(/^No-Go/)
  })
})
