import { describe, expect, it } from 'vitest'
import { iceFailureBeat, beatAt, easeOutBack, easeOutElastic, payoffBeats, payoffCues, payoffDuration, restTime, seg } from './payoffTimeline'
import type { Outcome, PayoffKind } from './types'

const KINDS: PayoffKind[] = ['ice-map', 'moon-landing', 'moon-base', 'mars-base']
const OUTCOMES: Outcome[] = ['success', 'partial', 'failed']

describe('payoff timeline', () => {
  for (const kind of KINDS)
    for (const outcome of OUTCOMES) {
      describe(`${kind} × ${outcome}`, () => {
        const beats = payoffBeats(kind, outcome)
        const end = payoffDuration(kind, outcome)

        it('runs 8 to 16.5 seconds', () => {
          expect(end).toBeGreaterThanOrEqual(8)
          expect(end).toBeLessThanOrEqual(16.5)
        })

        it('has beats with a kicker and a sentence', () => {
          expect(beats.length).toBeGreaterThan(0)
          for (const b of beats) {
            expect(b.kicker.length).toBeGreaterThan(0)
            expect(b.text.length).toBeGreaterThan(0)
          }
        })

        it('keeps beats in time order', () => {
          for (let i = 1; i < beats.length; i++) expect(beats[i].at).toBeGreaterThan(beats[i - 1].at)
        })

        it('starts the first caption at once and leaves the last one time to be read', () => {
          expect(beats[0].at).toBeLessThan(1)
          expect(beats[beats.length - 1].at).toBeLessThan(end - 2)
        })

        it('plays its sound cues inside the show', () => {
          for (const c of payoffCues(kind, outcome)) expect(c.at).toBeLessThan(end)
        })

        it('holds the reduced-motion frame on the final caption', () => {
          const r = restTime(kind, outcome)
          expect(r).toBeLessThan(end)
          expect(beatAt(beats, r)).toBe(beats[beats.length - 1])
        })
      })
    }

  it('ends each outcome differently', () => {
    for (const kind of KINDS) {
      const last = OUTCOMES.map((o) => payoffBeats(kind, o).at(-1)?.text)
      expect(new Set(last).size).toBe(3)
    }
  })

  it('names the brief captions exactly', () => {
    expect(payoffBeats('ice-map', 'success').at(-1)?.text).toBe('Water ice mapped in the permanently shadowed craters.')
    expect(payoffBeats('moon-landing', 'success').at(-1)?.text).toBe('Touchdown.')
    expect(payoffBeats('moon-landing', 'failed').at(-1)?.text).toBe('Contact lost at touchdown.')
  })

  it('shows no caption before the first beat and the latest one after', () => {
    const beats = payoffBeats('moon-landing', 'success')
    expect(beatAt(beats, 0)).toBeNull()
    expect(beatAt(beats, 100)).toBe(beats[beats.length - 1])
  })

  it('eases from 0 to 1', () => {
    expect(seg(-1, 0, 2)).toBe(0)
    expect(seg(1, 0, 2)).toBe(0.5)
    expect(seg(5, 0, 2)).toBe(1)
    expect(easeOutElastic(0)).toBe(0)
    expect(easeOutElastic(1)).toBe(1)
    expect(easeOutBack(0)).toBeCloseTo(0)
    expect(easeOutBack(1)).toBeCloseTo(1)
  })
})

describe('the failed ice map names its real cause', () => {
  it('does not say "went silent before its first scan" for a budget failure', () => {
    expect(iceFailureBeat('budget ran out in orbit').text).toMatch(/money ran out/)
    expect(payoffBeats('ice-map', 'failed', 'budget ran out in orbit').at(-1)?.text).not.toMatch(/went silent/)
  })
  it('keeps the silence for a lost craft and names a lost capture', () => {
    expect(iceFailureBeat('lost contact after deployment').text).toMatch(/went silent/)
    expect(iceFailureBeat('not enough delta-v left to capture').text).toMatch(/brake into lunar orbit/)
  })
  it('keeps the old line when the cause is unknown', () => {
    expect(payoffBeats('ice-map', 'failed').at(-1)?.text).toMatch(/went silent/)
  })
})
