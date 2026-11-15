import { describe, expect, it } from 'vitest'
import { boxesOverlap, coversContent, quietCorner, type Box } from './overlap'

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom })

describe('narrator overlap', () => {
  const bubble = box(8, 400, 184, 590)

  it('boxes that share area overlap; boxes that only touch do not', () => {
    expect(boxesOverlap(bubble, box(100, 500, 300, 520))).toBe(true)
    expect(boxesOverlap(bubble, box(184, 400, 300, 590))).toBe(false)
    expect(boxesOverlap(bubble, box(0, 0, 100, 100))).toBe(false)
  })

  it('a readout under the bubble counts as covered', () => {
    expect(coversContent(bubble, [box(0, 0, 50, 20), box(150, 560, 400, 580)])).toBe(true)
  })

  it('clear space beside the bubble does not', () => {
    expect(coversContent(bubble, [box(300, 560, 700, 580), box(0, 0, 800, 40)])).toBe(false)
  })

  it('screen-reader-only slivers are not content', () => {
    expect(coversContent(bubble, [box(20, 450, 21, 451)])).toBe(false)
  })

  it('puts the folded icon in the first corner with nothing under it', () => {
    const view = { width: 800, height: 600 }
    expect(quietCorner([], view, 30)).toBe('bl')
    expect(quietCorner([box(0, 560, 300, 590)], view, 30)).toBe('br')
    expect(quietCorner([box(0, 560, 300, 590), box(600, 560, 800, 590)], view, 30)).toBe('tr')
    expect(quietCorner([box(0, 560, 300, 590), box(600, 560, 800, 590), box(700, 0, 800, 40)], view, 30)).toBe('tl')
    // every corner busy: stay bottom-left
    const busy = [box(0, 560, 300, 590), box(600, 560, 800, 590), box(700, 0, 800, 40), box(0, 0, 100, 40)]
    expect(quietCorner(busy, view, 30)).toBe('bl')
  })
})
