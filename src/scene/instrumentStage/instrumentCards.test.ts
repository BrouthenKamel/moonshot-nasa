import { describe, it, expect } from 'vitest'
import { instruments } from '../../data/parts'
import { instrumentCardView, instrumentStats, lessonText, rowFocusKey } from './instrumentCards'

const byId = (id: string) => instruments.find((i) => i.id === id)!
const open = { id: '', neededLevel: 1, labLevel: 1, locked: false, text: '' }
const locked = { id: '', neededLevel: 2, labLevel: 1, locked: true, text: 'Needs Research Lab LV 2' }

describe('instrument cards', () => {
  it('keep the key lesson: shadow and altitude limit', () => {
    expect(lessonText(byId('inst-laser'))).toContain('below 20 km')
    expect(lessonText(byId('inst-neutron'))).toContain('below 25 km')
    expect(lessonText(byId('inst-ir-spec'))).toContain('Needs sunlight')
    expect(instrumentStats(byId('inst-camera')).find((s) => s.label === 'Shadow')).toMatchObject({ tone: 'bad' })
  })

  it('a locked instrument aboard stays removable; one not aboard is blocked with its reason', () => {
    expect(instrumentCardView(byId('inst-laser'), true, locked).blocked).toBe(false)
    const v = instrumentCardView(byId('inst-laser'), false, locked)
    expect(v.blocked).toBe(true)
    expect(v.ariaLabel).toContain('Needs Research Lab LV 2')
    expect(instrumentCardView(byId('inst-laser'), false, open).reason).toBeUndefined()
  })

  it('arrow keys wrap along the row', () => {
    expect(rowFocusKey('ArrowRight', 3, 4)).toBe(0)
    expect(rowFocusKey('ArrowLeft', 0, 4)).toBe(3)
    expect(rowFocusKey('End', 0, 4)).toBe(3)
    expect(rowFocusKey('a', 0, 4)).toBeNull()
  })
})
