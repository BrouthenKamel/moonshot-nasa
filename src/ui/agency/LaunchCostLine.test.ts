import { describe, expect, it } from 'vitest'
import { launchCostText } from './LaunchCostLine'

describe('launchCostText', () => {
  it('says what the retry costs and what the agency has', () => {
    const t = launchCostText(25, 50, 40, 'Relaunch')
    expect(t.text).toMatch(/^Relaunch costs about \$\d+\.\d+M · you have \$40\.0M$/)
    expect(t.short).toBe(false)
  })
  it('flags a shortfall', () => {
    expect(launchCostText(25, 50, 0.5, 'Launch').short).toBe(true)
  })
})
