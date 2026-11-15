import { describe, it, expect } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { cannotMeetBrief, goNoGo } from '../../sim/checks'
import { archetypes, flashlightDesign } from '../../sim/fixtures'
import { getAsset } from '../../assets/manifest'
import type { Design } from '../../sim/types'
import { POLL_TIMING, pollEnd } from './pollEnd'
import { stations } from './stations'

const endOf = (d: Design) => {
  const r = goNoGo(d, computeBudgets(d, 'engineer'))
  return { r, end: pollEnd(r, cannotMeetBrief(r), stations(r.checks)), st: stations(r.checks) }
}

describe('the poll closes with the same word as the stamp (QC, 15 Nov)', () => {
  it('a craft that cannot meet the brief: "Go with a caution on Science", never "all stations are go"', () => {
    const { r, end } = endOf(createDefaultDesign())
    expect(r.canGo).toBe(true)
    expect(cannotMeetBrief(r)).toBe(true)
    expect(end).toEqual({ kind: 'caution', text: 'Go with a caution on Science.' })
  })

  it('every yellow station is named', () => {
    const d: Design = { ...flashlightDesign, solar: 'solar-body', orbit: 'orbit-halo' }
    const { r, end, st } = endOf(d)
    const yellow = st.filter((s) => s.status === 'yellow').map((s) => s.title)
    if (r.canGo && yellow.length) for (const name of yellow) expect(end.kind === 'caution' && end.text).toContain(name)
  })

  it('"All stations are go … cleared for launch" only when no station is yellow and the brief can be met', () => {
    for (const d of Object.values(archetypes)) {
      const { r, end, st } = endOf(d)
      const allGreen = r.canGo && !cannotMeetBrief(r) && st.every((s) => s.status === 'green') && r.warnings.length === 0
      expect(end.kind === 'go', JSON.stringify(st.map((s) => s.status))).toBe(allGreen)
    }
    expect((getAsset('voice.poll-all-go') as { prompt?: string }).prompt).toMatch(/All stations are go/)
  })

  it('a red station closes with "hold the count"', () => {
    const { r, end } = endOf({ ...flashlightDesign, solar: 'solar-body', orbit: 'orbit-100km' })
    expect(r.canGo).toBe(false)
    expect(end).toEqual({ kind: 'nogo', voice: 'voice.poll-hold' })
  })
})

describe('re-poll speed', () => {
  it('a re-poll after a design change runs 3× faster than the first poll', () => {
    const total = (t: { open: number; gap: number; end: number }) => t.open + 4 * t.gap + t.end
    expect(total(POLL_TIMING.full) / total(POLL_TIMING.fast)).toBeCloseTo(3, 5)
  })
})
