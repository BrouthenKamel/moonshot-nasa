import { describe, expect, it } from 'vitest'
import { KIT_PART_IDS } from '../../data/craftKit'
import { createDefaultDesign } from '../../sim/budgets'
import type { Design } from '../../sim/types'
import { allCraftParts, buildCraft, envelopeBreach, instanceBox, INTERNAL_PARTS, overlapDepth, type CraftInstance } from './craftBuild'

const solar = ['solar-body', 'solar-1wing', 'solar-2wing']
const battery = ['battery-small', 'battery-medium', 'battery-large']
const computer = ['computer-basic', 'computer-redundant']
const attitude = ['attitude-basic', 'attitude-precision']
const prop = ['prop-coldgas', 'prop-chemical', 'prop-chemical-large', 'prop-ion', 'prop-ion-large']
const radio = ['radio-uhf', 'radio-sband', 'radio-xband']
const instruments = [
  ['inst-ir-spec'],
  ['inst-camera'],
  ['inst-laser'],
  ['inst-neutron'],
  ['inst-ir-spec', 'inst-camera'],
  ['inst-laser', 'inst-camera'],
  ['inst-camera', 'inst-laser'],
  ['inst-neutron', 'inst-camera'],
  ['inst-laser', 'inst-ir-spec'],
  ['inst-neutron', 'inst-ir-spec'],
  ['inst-neutron', 'inst-laser'],
]

function* designs(): Generator<Design> {
  for (const s of solar)
    for (const b of battery)
      for (const c of computer)
        for (const a of attitude)
          for (const p of prop)
            for (const r of radio)
              for (const i of instruments)
                yield { ...createDefaultDesign(), solar: s, battery: b, computer: c, attitude: a, propulsion: p, radio: r, instruments: i }
}

/**
 * Stacked boards in the kit interleave by design (connectors reach into the next board's standoffs),
 * so their boxes overlap. The kit's own checker accepts them in the reference build; these are the only
 * pairs allowed to, and never by more than the deepest the reference build shows.
 */
const STACK_PAIRS = new Set(['eps x obc', 'obc x transceiver', 'backplane x eps', 'backplane x battery', 'backplane x instrument:inst-camera', 'obc_b x transceiver'])
const MAX_STACK_OVERLAP = 0.0155
const TOLERANCE = 0.0015

describe('buildCraft', () => {
  it('uses only parts that exist in the kit, with unique keys', () => {
    const known = new Set<string>(KIT_PART_IDS)
    for (const d of designs()) {
      const list = buildCraft(d)
      expect(new Set(list.map((i) => i.key)).size).toBe(list.length)
      for (const i of list) expect(known.has(i.part), i.part).toBe(true)
    }
  })

  it('has exactly one engine and one instrument per chosen instrument', () => {
    for (const d of designs()) {
      const list = buildCraft(d)
      expect(list.filter((i) => i.slot === 'propulsion')).toHaveLength(1)
      expect(list.filter((i) => i.slot === 'instrument')).toHaveLength(d.instruments.length)
    }
  })

  it('keeps every internal module inside the 6U box, for every combination of choices', () => {
    for (const d of designs())
      for (const i of buildCraft(d)) if (INTERNAL_PARTS.has(i.part)) expect(envelopeBreach(i), `${i.key} in ${JSON.stringify(d)}`).toBeLessThanOrEqual(TOLERANCE)
  })

  it('never lets two modules collide, apart from the boards that stack', () => {
    for (const d of designs()) {
      const list = buildCraft(d).filter((i) => INTERNAL_PARTS.has(i.part))
      for (let a = 0; a < list.length; a++)
        for (let b = a + 1; b < list.length; b++) {
          const depth = overlapDepth(instanceBox(list[a]), instanceBox(list[b]))
          if (depth <= TOLERANCE) continue
          const pair = [list[a].key, list[b].key].sort().join(' x ')
          expect(STACK_PAIRS.has(pair), `${pair} overlap ${(depth * 1000).toFixed(1)} mm`).toBe(true)
          expect(depth).toBeLessThanOrEqual(MAX_STACK_OVERLAP)
        }
    }
  })

  it('shows what each choice means', () => {
    const base = createDefaultDesign()
    const by = (d: Design, key: string) => buildCraft(d).find((i) => i.key === key)
    // wings: body-mounted ones stay folded, the smaller deployable set has two panels a side
    expect(by({ ...base, solar: 'solar-body' }, 'wing_py')!.foldedAlways).toBe(true)
    expect(by({ ...base, solar: 'solar-1wing' }, 'wing_py')!.hidden).toEqual(['hinge_2'])
    expect(by({ ...base, solar: 'solar-2wing' }, 'wing_py')!.hidden).toEqual([])
    // two boards for the redundant computer
    expect(buildCraft({ ...base, computer: 'computer-redundant' }).filter((i) => i.part === 'obc_board')).toHaveLength(2)
    expect(buildCraft({ ...base, computer: 'computer-basic' }).filter((i) => i.part === 'obc_board')).toHaveLength(1)
    // the precision set has the star tracker and the cluster, the basic one a single wheel
    const precise = buildCraft({ ...base, attitude: 'attitude-precision' }).map((i) => i.part)
    expect(precise).toEqual(expect.arrayContaining(['star_tracker', 'rw_cluster', 'imu_box']))
    const basic = buildCraft({ ...base, attitude: 'attitude-basic' }).map((i) => i.part)
    expect(basic).toContain('reaction_wheel')
    expect(basic).not.toContain('star_tracker')
    // radios
    expect(buildCraft({ ...base, radio: 'radio-uhf' }).map((i) => i.part)).toEqual(expect.arrayContaining(['uhf_antenna']))
    expect(buildCraft({ ...base, radio: 'radio-xband' }).map((i) => i.part)).toEqual(expect.arrayContaining(['dish_antenna', 'transponder']))
    // engines
    const engine = (p: string) => by({ ...base, propulsion: p }, 'engine')!.part
    expect(engine('prop-ion')).toBe('ion_engine')
    expect(engine('prop-coldgas')).toBe('cold_gas_module')
    expect(engine('prop-chemical')).toBe('green_monoprop_module')
  })

  it('keeps the key of a part when only its size changes, so it resizes instead of being swapped', () => {
    const base = createDefaultDesign()
    const a = buildCraft({ ...base, battery: 'battery-small' }).find((i: CraftInstance) => i.key === 'battery')!
    const b = buildCraft({ ...base, battery: 'battery-large' }).find((i: CraftInstance) => i.key === 'battery')!
    expect(a.part).toBe(b.part)
    expect(a.scale).toBeLessThan(b.scale)
    expect(b.scale).toBe(1)
  })

  it('preloads every part that any combination of choices can put on the craft', () => {
    const preload = new Set<string>(allCraftParts())
    for (const d of designs()) for (const i of buildCraft(d)) expect(preload.has(i.part), i.part).toBe(true)
  })
})
