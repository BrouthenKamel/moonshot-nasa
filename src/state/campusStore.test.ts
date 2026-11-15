import { describe, expect, it } from 'vitest'
import { mergeInsights } from './campusStore'
import type { Insight } from '../minigames/contract'

const ins = (id: string, value: number): Insight => ({ id, room: 'thermal-vac', text: id, metric: { label: 'x', value, unit: '%' } })

describe('mergeInsights', () => {
  it('a replay overwrites the same insight in place and appends new ones', () => {
    const out = mergeInsights([ins('a', 1), ins('b', 2)], [ins('a', 9), ins('c', 3)])
    expect(out.map((i) => [i.id, i.metric.value])).toEqual([
      ['a', 9],
      ['b', 2],
      ['c', 3],
    ])
  })
})
