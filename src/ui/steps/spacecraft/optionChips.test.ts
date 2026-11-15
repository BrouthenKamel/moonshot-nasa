import { describe, expect, it } from 'vitest'
import { computeBudgets } from '../../../sim/budgets'
import { trayGroups } from '../../../viz/spacecraft/trayOptions'
import { useGameStore } from '../../../state/gameStore'
import { allStats, cardChips, optionChips } from './optionChips'

describe('optionChips', () => {
  const s = useGameStore.getState()
  const groups = trayGroups(computeBudgets(s.design, s.difficulty))

  it('turns every number of every tray option into a labelled chip, the key number first', () => {
    for (const g of groups)
      for (const o of g.options) {
        const chips = optionChips(g.key, o)
        expect(chips.length).toBe(o.stats.split(' · ').length)
        expect(chips.every((c) => c.value.length > 0)).toBe(true)
        expect(chips.some((c) => c.label === 'Cost')).toBe(true)
      }
  })

  it('labels a fuelled engine by its fuelled and dry mass', () => {
    const prop = groups.find((g) => g.key === 'propulsion')!
    const chips = optionChips('propulsion', prop.options[0])
    expect(chips[0].label).toBe('Fuelled')
    expect(chips[0].value).toMatch(/^\d+(\.\d)? kg$/)
    expect(chips.find((c) => c.label === 'Dry')).toBeDefined()
  })

  it('puts one number on each card, its trade, and every number in the tooltip', () => {
    const trade = { solar: / W$/, battery: / Wh$/, computer: / MB$/, attitude: /°$/, propulsion: / kg$/ } as const
    for (const g of groups)
      for (const o of g.options) {
        const chips = cardChips(g.key, o)
        expect(chips).toHaveLength(1)
        expect(chips[0].value).toMatch(trade[g.key])
        expect(allStats(g.key, o).split(' · ')).toHaveLength(optionChips(g.key, o).length)
      }
  })
})
