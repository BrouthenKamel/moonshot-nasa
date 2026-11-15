import { describe, expect, it } from 'vitest'
import { computeBudgets } from '../../sim/budgets'
import { iceCubeDesign } from '../../sim/fixtures'
import type { Budgets } from '../../sim/types'
import { RESOURCE_ORDER, isUnlocked, resourcePips } from './resources'

const b = computeBudgets(iceCubeDesign, 'engineer')
const pip = (pips: ReturnType<typeof resourcePips>, id: string) => pips.find((p) => p.id === id)!

describe('resource strip unlocks', () => {
  it('shows all six in a fixed order', () => {
    expect(resourcePips(b, []).map((p) => p.id)).toEqual(RESOURCE_ORDER)
  })

  it('on a fresh campus only budget and time are known', () => {
    const pips = resourcePips(b, [])
    expect(pips.filter((p) => p.unlocked).map((p) => p.id)).toEqual(['budget', 'time'])
    for (const p of pips.filter((p) => !p.unlocked)) expect(p.detail).toMatch(/Clean Room|Science Lab|Ground Station/)
  })

  it('each room reveals the numbers it measures', () => {
    expect(isUnlocked('data', ['science-lab'])).toBe(true)
    expect(isUnlocked('mass', ['science-lab'])).toBe(false)
    expect(isUnlocked('mass', ['clean-room'])).toBe(true)
    expect(isUnlocked('power', ['thermal-vac'])).toBe(true)
    expect(isUnlocked('comms', ['ground-station'])).toBe(true)
    expect(isUnlocked('comms', ['briefing', 'science-lab', 'clean-room'])).toBe(false)
  })

  it('after the first three rooms: mass, power, budget, data and time', () => {
    const pips = resourcePips(b, ['briefing', 'science-lab', 'clean-room'])
    expect(pips.filter((p) => p.unlocked).map((p) => p.id)).toEqual(['mass', 'power', 'budget', 'data', 'time'])
  })
})

describe('resource strip numbers come from computeBudgets', () => {
  const all = resourcePips(b, ['clean-room', 'science-lab', 'ground-station'])

  it('budget shows money left of the total, like the HQ board', () => {
    const p = pip(all, 'budget')
    expect(p.unlocked && p.value).toBe(`$${b.budgetMargin.toFixed(1)}M of $${b.budgetCap.toFixed(1)}M`)
  })

  it('mass shows the total mass', () => {
    const p = pip(all, 'mass')
    expect(p.unlocked && p.value).toBe(`${b.totalMass.toFixed(1)} kg`)
  })

  it('every unlocked pip has a one-line detail', () => {
    for (const p of all) {
      expect(p.detail.length).toBeGreaterThan(10)
      expect(p.detail).not.toContain('\n')
      expect(p.detail).not.toMatch(/NaN|undefined/)
      if (p.unlocked) expect(p.level).toBeGreaterThanOrEqual(0)
      if (p.unlocked) expect(p.level).toBeLessThanOrEqual(1)
    }
  })

  it('tones follow the margins', () => {
    const bad: Budgets = { ...b, massMargin: -1, powerMargin: -5, budgetMargin: -2, timeMarginTurns: -1, dataMarginPerTurn: -10 }
    const pips = resourcePips(bad, ['clean-room', 'science-lab', 'ground-station'])
    const tone = (id: string) => {
      const p = pip(pips, id)
      return p.unlocked ? p.tone : null
    }
    expect(tone('mass')).toBe('nogo')
    expect(tone('power')).toBe('nogo')
    expect(tone('budget')).toBe('nogo')
    expect(tone('time')).toBe('nogo')
    expect(tone('comms')).toBe('caution')
    expect(pip(pips, 'mass').detail).toMatch(/over/)
  })

  it('a flat battery turns power red even with sunlight to spare', () => {
    const p = pip(resourcePips({ ...b, powerMargin: 20, batteryOk: false }, ['clean-room']), 'power')
    expect(p.unlocked && p.tone).toBe('nogo')
  })
})
