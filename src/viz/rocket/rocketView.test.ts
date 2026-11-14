import { describe, expect, it } from 'vitest'
import { assets } from '../../assets/manifest'
import { BODY_RADIUS_M, DEFAULT_ROCKET, partsForSlot, rocketParts, rocketSlots } from '../../data/rocket'
import { blockedReason, layoutRocket, normalizeRocket, optionsFor, pick, rocketChecks, rocketStats } from './rocketView'

describe('rocket catalogue', () => {
  it('has a default that is made of real parts', () => {
    const { config, notes } = normalizeRocket(DEFAULT_ROCKET)
    expect(config).toEqual(DEFAULT_ROCKET)
    expect(notes).toEqual([])
  })

  it('gives every slot at least two options, and every optional slot a "none"', () => {
    for (const slot of rocketSlots) {
      const parts = partsForSlot(slot.id)
      expect(parts.length, slot.id).toBeGreaterThanOrEqual(2)
      expect(parts.some((p) => p.id === 'none'), slot.id).toBe(slot.optional)
    }
  })

  it('points every shown part at a model in the asset manifest', () => {
    const ids = new Set(assets.map((a) => a.id as string))
    for (const p of rocketParts) {
      if (p.id === 'none') expect(p.model).toBeNull()
      else expect(ids.has(p.model as string), p.id).toBe(true)
    }
  })

  it('explains every part in plain words', () => {
    for (const p of rocketParts) expect(p.what.length, p.id).toBeGreaterThan(20)
  })
})

describe('layoutRocket', () => {
  it('stacks by the kit rules: engines down, core on 0, upper on core, nose on top', () => {
    const l = layoutRocket(DEFAULT_ROCKET) // medium core 9, short upper 2.5, fairing 5.4, cluster3 1.35
    const y = Object.fromEntries(l.placed.map((p) => [p.slot, p.y]))
    expect(y.engine).toBe(0)
    expect(y.stage1).toBe(0)
    expect(y.stage2).toBe(9)
    expect(y.nose).toBe(11.5)
    expect(l.top).toBeCloseTo(16.9)
    expect(l.bottom).toBeCloseTo(-1.35)
    expect(l.heightUnits).toBeCloseTo(18.25)
    expect(l.heightM).toBeCloseTo(18.25 * BODY_RADIUS_M)
  })

  it('puts the nose on the core when there is no upper stage, and skips empty slots', () => {
    const l = layoutRocket({ ...DEFAULT_ROCKET, stage2: 'none', fins: 'none', boosters: 'none' })
    expect(l.placed.map((p) => p.slot)).toEqual(['engine', 'stage1', 'nose'])
    expect(l.placed.find((p) => p.slot === 'nose')!.y).toBe(9)
  })
})

describe('repairing a rocket', () => {
  it('replaces unknown ids with the default', () => {
    const { config } = normalizeRocket({ engine: 'warp-drive', nose: 'nose_cone' })
    expect(config.engine).toBe(DEFAULT_ROCKET.engine)
    expect(config.nose).toBe('nose_cone')
  })

  it('does not let heavy boosters sit beside a short core, and says so', () => {
    const heavy = { ...DEFAULT_ROCKET, stage1: 'stage1_medium', boosters: 'boosters_2_heavy' }
    expect(normalizeRocket(heavy).notes).toEqual([])
    const r = pick(heavy, 'stage1', 'stage1_short')
    expect(r.config.boosters).toBe('boosters_2')
    expect(r.notes[0]).toMatch(/taller core/)
  })

  it('shows heavy boosters as blocked on a short core only', () => {
    const heavy = rocketParts.find((p) => p.id === 'boosters_2_heavy')!
    expect(blockedReason({ ...DEFAULT_ROCKET, stage1: 'stage1_short' }, heavy)).toMatch(/taller core/)
    expect(blockedReason({ ...DEFAULT_ROCKET, stage1: 'stage1_long' }, heavy)).toBeNull()
    const opts = optionsFor({ ...DEFAULT_ROCKET, stage1: 'stage1_short' }, 'boosters')
    expect(opts.find((o) => o.part.id === 'boosters_2_heavy')!.blocked).not.toBeNull()
    expect(opts.filter((o) => o.selected)).toHaveLength(1)
  })
})

describe('stats and checks', () => {
  it('counts stages, engines and boosters', () => {
    expect(rocketStats(DEFAULT_ROCKET)).toMatchObject({ stages: 2, engines: 3, boosters: 2 })
    expect(rocketStats({ ...DEFAULT_ROCKET, stage2: 'none', engine: 'engine_cluster9', boosters: 'none' })).toMatchObject({
      stages: 1,
      engines: 9,
      boosters: 0,
    })
  })

  it('warns, without blocking, when there is no upper stage or a crew capsule', () => {
    const ok = rocketChecks(DEFAULT_ROCKET)
    expect(ok.every((c) => c.tone === 'green')).toBe(true)
    const odd = rocketChecks({ ...DEFAULT_ROCKET, stage2: 'none', nose: 'nose_capsule' })
    expect(odd.map((c) => c.tone)).toEqual(['yellow', 'yellow'])
  })
})
