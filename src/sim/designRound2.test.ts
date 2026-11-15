import { describe, it, expect } from 'vitest'
import { runSimulation } from './simulate'
import { buildReport } from './evaluate'
import { flashlightDesign } from './fixtures'
import { scoreWeights } from '../data/brief'

// Jakob, 14 Nov: the report says what cost the missing points
describe('design round 2: the report explains the score', () => {
  it('gives one plain line for every score part below its maximum, and none for full parts', () => {
    let checked = 0
    for (let seed = 1; seed < 40 && checked < 3; seed++) {
      const r = buildReport(runSimulation(flashlightDesign, 'engineer', seed))
      if (r.outcome !== 'success') continue
      checked++
      const parts = ['coverage', 'data', 'lifetime', 'context', 'money'] as const
      const labels = { coverage: 'Ice coverage', data: 'Science data', lifetime: 'Turns in orbit', context: 'Sunlit-ground map', money: 'Money left' }
      for (const p of parts) {
        const line = r.scoreNotes.find((n) => n.startsWith(labels[p]))
        if (r.score[p] < scoreWeights[p]) {
          expect(line, p).toBeDefined()
          expect(line!).toContain(`${r.score[p]}/${scoreWeights[p]}`)
        } else expect(line, p).toBeUndefined()
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('names the missing IR spectrometer as the reason for no sunlit-ground points', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = buildReport(runSimulation(flashlightDesign, 'engineer', seed))
      if (!r.requirements[0].met) continue
      const line = r.scoreNotes.find((n) => n.startsWith('Sunlit-ground map'))!
      expect(line).toContain('IR spectrometer')
      expect(line).toContain('Research Lab')
      return
    }
  })

  it('says a failed mission earns no money points, and that the unspent money goes back', () => {
    const r = buildReport(runSimulation({ ...flashlightDesign, instruments: ['inst-camera'] }, 'engineer', 1))
    expect(r.outcome).toBe('failed')
    expect(r.scoreNotes.join(' ')).toMatch(/failed mission earns no points for money left. The [0-9.]+ M it did not spend still goes back/)
  })
})
