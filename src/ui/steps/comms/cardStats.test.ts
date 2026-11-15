import { describe, expect, it } from 'vitest'
import { cardStat, hoverStats } from './cardStats'

describe('Comms card stats', () => {
  const stats = [
    { label: 'Link', value: '64 kbps' },
    { label: 'Mass', value: '0.3 kg' },
    { label: 'Cost', value: '$0.4M' },
  ]

  it('keeps one number on the card', () => {
    expect(cardStat(stats)).toEqual([{ label: 'Link', value: '64 kbps' }])
    expect(cardStat([])).toEqual([])
  })

  it('puts the rest on hover', () => {
    expect(hoverStats(stats)).toBe('Mass: 0.3 kg · Cost: $0.4M')
    expect(hoverStats(stats.slice(0, 1))).toBe('')
  })
})
