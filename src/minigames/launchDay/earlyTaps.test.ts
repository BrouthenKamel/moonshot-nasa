import { describe, expect, it } from 'vitest'
import { botPlay, currentEvent, EVENTS, newLaunch, POINTS, POP_MIN_MS, press, step, tapTime, type LaunchState } from './logic'

/** The combo multiplier in logic.ts: 1 + 0.25 per step beyond the first, at most 4 steps */
const comboMultiplier = (combo: number) => 1 + Math.min(Math.max(combo - 1, 0), 4) * 0.25

/** A flight flown perfectly up to the moment `id` is the event waiting, `lead` flight seconds before its mark */
function before(id: string, lead: number): LaunchState {
  const s = newLaunch()
  const dt = 1 / 120
  let guard = 0
  while (s.running && guard++ < 400_000) {
    const ev = currentEvent(s)
    if (ev?.id === id && tapTime(s, ev) - s.t <= lead) return s
    botPlay(s, 'perfect')
    step(s, dt)
  }
  throw new Error(`never reached ${id}`)
}

const TAPS = EVENTS.filter((e) => e.kind === 'tap').map((e) => e.id)

// Integration review, 15 Nov: a PITCH OVER tap about 2 s early scored +100 with no "Too early"
describe('early taps, at every tap moment', () => {
  it('covers all five tap moments, the ignition included', () => {
    expect(TAPS).toEqual(['ignite', 'pitch', 'stage', 'fairing', 'cutoff', 'deploy'])
  })

  for (const id of TAPS) {
    it(`${id}: 2 s early is TOO EARLY, scores nothing and keeps the event waiting`, () => {
      const s = before(id, 2)
      const idx = s.idx
      const score = s.score
      const fb = press(s)!
      expect(fb.grade).toBe('early')
      expect(fb.big).toBe('TOO EARLY')
      expect(fb.points).toBe(0)
      expect(s.score).toBe(score)
      expect(s.idx).toBe(idx)
    })

    it(`${id}: an early tap never scores more than a good one`, () => {
      for (const lead of [1.3, 1, 0.7]) {
        const s = before(id, lead)
        const combo = s.combo
        const fb = press(s)!
        // Graded good at best, so it earns what an on-time good tap would at this combo
        expect(fb.grade, `${lead} s early`).toBe('good')
        expect(fb.points, `${lead} s early`).toBe(Math.round(POINTS.good * comboMultiplier(combo + 1)))
      }
    })
  }

  it('keeps every grade pop on screen at least 1.5 s', () => {
    expect(POP_MIN_MS).toBeGreaterThanOrEqual(1500)
  })
})
