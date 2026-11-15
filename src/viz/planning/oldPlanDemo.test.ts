import { describe, expect, it } from 'vitest'
import { wantsOldPlan } from './oldPlanDemo'

describe('the ?plan=old demo switch', () => {
  it('shows the old Plan screen only when asked', () => {
    expect(wantsOldPlan('?plan=old')).toBe(true)
    expect(wantsOldPlan('?minigame=ice&plan=old')).toBe(true)
    expect(wantsOldPlan('')).toBe(false)
    expect(wantsOldPlan('?plan=new')).toBe(false)
  })
})
