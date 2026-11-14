import { describe, it, expect } from 'vitest'
import { instrumentLock, lockedInDesign, toggleUnlocked } from './labLocks'

// The demo starts on day 112: the Research Lab is at LV 2 and reaches LV 3 on day 122.
const BEFORE = 112
const AFTER = 122

describe('instrumentLock', () => {
  it('locks the neutron spectrometer below Research Lab LV 3', () => {
    const lock = instrumentLock('inst-neutron', BEFORE)
    expect(lock.locked).toBe(true)
    expect(lock.neededLevel).toBe(3)
    expect(lock.labLevel).toBe(2)
    expect(lock.text).toBe('Needs Research Lab LV 3 · now LV 2 · upgrade done in 10 days at the agency base; let time run with ▶')
  })

  it('counts the days left down to the upgrade', () => {
    expect(instrumentLock('inst-neutron', 120.4).text).toBe(
      'Needs Research Lab LV 3 · now LV 2 · upgrade done in 2 days at the agency base; let time run with ▶'
    )
  })

  it('opens the neutron spectrometer once the lab reaches LV 3', () => {
    const lock = instrumentLock('inst-neutron', AFTER)
    expect(lock.locked).toBe(false)
    expect(lock.labLevel).toBe(3)
    expect(lock.text).toBe('')
  })

  it('leaves the other instruments open at LV 2', () => {
    for (const id of ['inst-ir-spec', 'inst-laser', 'inst-camera']) expect(instrumentLock(id, BEFORE).locked).toBe(false)
  })
})

describe('lockedInDesign', () => {
  it('names a locked instrument a design already holds, without dropping it', () => {
    const design = ['inst-laser', 'inst-neutron']
    const locked = lockedInDesign(design, BEFORE)
    expect(locked.map((l) => l.id)).toEqual(['inst-neutron'])
    expect(design).toEqual(['inst-laser', 'inst-neutron'])
  })
  it('is empty once the lab is high enough', () => {
    expect(lockedInDesign(['inst-laser', 'inst-neutron'], AFTER)).toEqual([])
  })
})

describe('toggleUnlocked', () => {
  it('refuses to add a locked instrument', () => {
    expect(toggleUnlocked(['inst-laser'], 'inst-neutron', BEFORE)).toEqual(['inst-laser'])
  })
  it('still lets the player remove a locked instrument the design holds', () => {
    expect(toggleUnlocked(['inst-laser', 'inst-neutron'], 'inst-neutron', BEFORE)).toEqual(['inst-laser'])
  })
  it('adds open instruments with the usual two-slot rule', () => {
    expect(toggleUnlocked(['inst-laser', 'inst-ir-spec'], 'inst-camera', BEFORE)).toEqual(['inst-ir-spec', 'inst-camera'])
    expect(toggleUnlocked(['inst-laser'], 'inst-neutron', AFTER)).toEqual(['inst-laser', 'inst-neutron'])
  })
})
