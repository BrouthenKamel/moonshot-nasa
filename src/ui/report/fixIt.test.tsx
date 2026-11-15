import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

// Server rendering reads a store's initial snapshot; make every store read its live state instead.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const live = <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  return { ...actual, default: { ...actual, useSyncExternalStore: live }, useSyncExternalStore: live }
})

import App from '../../App'
import { useGameStore } from '../../state/gameStore'
import { runSimulation } from '../../sim/simulate'
import { buildReport } from '../../sim/evaluate'
import { flashlightDesign, iceCubeDesign } from '../../sim/fixtures'
import type { Design, Report, RequirementResult } from '../../sim/types'
import { classifyCause, fixLabel, topCauses } from './fixIt'
import { FixItPanel } from './FixItPanel'

const reportOf = (design: Design, seed = 1) => buildReport(runSimulation(design, 'engineer', seed))

/** A report with the given missed requirements' causes, for exact ordering cases */
function fakeReport(outcome: Report['outcome'], missed: string[][], scoreNotes: string[] = []): Report {
  const base = reportOf(flashlightDesign)
  const requirements: RequirementResult[] = missed.map((causes, i) => ({
    id: `r${i}`,
    name: `Requirement ${i}`,
    met: false,
    target: 1,
    actual: 0,
    unit: '',
    reason: '',
    causes,
  }))
  return { ...base, outcome, requirements, scoreNotes }
}

describe('topCauses: the decisions behind a failed or partial mission', () => {
  it('a full success has nothing to fix', () => {
    const r = reportOf(flashlightDesign)
    expect(r.outcome).toBe('success')
    expect(topCauses(r)).toEqual([])
  })

  it('an instrument that cannot see into shadow points to the Research Lab', () => {
    const r = reportOf(iceCubeDesign, 1)
    expect(r.outcome).toBe('failed') // 0% ice, however much IR data came home
    const [first] = topCauses(r)
    expect(first).toMatchObject({ step: 'instruments', building: 'research-lab', buildingName: 'Research Lab' })
    expect(first.why).toMatch(/cannot see into the shadowed craters/)
  })

  it('too few passes points to the orbit at the Launch Site', () => {
    const r = reportOf({ ...flashlightDesign, instruments: ['inst-neutron'] }, 1)
    expect(r.outcome).toBe('failed') // ice coverage missed (QC #91)
    expect(topCauses(r)[0]).toMatchObject({ step: 'orbit', building: 'launch-site', decision: 'Orbit choice' })
  })

  it('data that never got home points to the Comms Center', () => {
    const r = reportOf({ ...flashlightDesign, contactHours: 0.25, groundStation: 'ground-small', radio: 'radio-uhf' }, 1)
    expect(r.outcome).toBe('failed')
    expect(topCauses(r)[0]).toMatchObject({ step: 'comms', building: 'comms-center' })
  })

  it('weak pointing points to the Factory', () => {
    const r = reportOf({ ...flashlightDesign, attitude: 'attitude-basic' }, 2)
    expect(r.outcome).toBe('failed') // 69% of the 70% ice target
    expect(topCauses(r)).toEqual([expect.objectContaining({ step: 'spacecraft', building: 'factory', decision: 'Pointing (attitude control)' })])
  })

  it('a craft lost after deployment points to the testing time in planning', () => {
    // A craft that had a reserve: the search ran (or was called off), so testing is what to change
    expect(classifyCause('Contact was lost right after deployment, as happened to Lunar IceCube.')).toMatchObject({ step: 'planning', decision: 'Testing time' })
  })

  it('a craft lost for want of a reserve: one link, "Fix at Plan: hold back a reserve" (QC, 15 Nov)', () => {
    const r = reportOf(iceCubeDesign, 3) // 0% reserve: the no-signal card offered only "Accept the loss"
    expect(r.outcome).toBe('failed')
    const causes = topCauses(r)
    expect(causes).toHaveLength(1)
    expect(causes[0]).toMatchObject({ step: 'planning', decision: 'Reserve', action: 'hold back a reserve' })
    expect(fixLabel(causes[0])).toBe('Fix at Plan: hold back a reserve')
    const html = renderToString(<FixItPanel report={r} />).replace(/<!-- -->/g, '')
    expect(html).toContain('Fix at Plan: hold back a reserve')
  })

  it('names at most two decisions, one per step, in the report order', () => {
    const r = fakeReport('failed', [
      ['The craft never reached its science orbit.', 'Without precise pointing the laser works at 50% of its quality.'],
      ['Too little power: the instruments ran only 60% of the time they could.', 'Too high: the laser only works below 20 km.'],
      ['No reserve was held back for surprises.'],
    ])
    expect(topCauses(r).map((c) => [c.decision, c.step])).toEqual([
      ['Pointing (attitude control)', 'spacecraft'],
      ['Orbit height', 'orbit'],
    ])
  })

  it('score notes speak only when the missed requirements name no decision', () => {
    const note = 'Sunlit-ground map 0/100: no IR spectrometer on board, and only it maps the sunlit ground.'
    expect(topCauses(fakeReport('partial', [['Bad luck stacked up over the mission.']], [note]))[0].step).toBe('instruments')
    expect(
      topCauses(fakeReport('partial', [['Too high: the laser only works below 20 km.']], [note])).map((c) => c.step)
    ).toEqual(['orbit'])
  })

  it('a partial mission (ice met, something else missed) names its decision too', () => {
    const r = fakeReport('partial', [['Missing the ride meant 6 more turns of team cost (3.0 M). Slack in the schedule protects against build delays.']])
    expect(topCauses(r)).toEqual([expect.objectContaining({ step: 'planning', decision: 'Schedule slack' })])
  })

  it('lines that name no decision are skipped', () => {
    for (const line of [
      'The craft never reached its science orbit.',
      'Bad luck stacked up over the mission; the margins were too thin to absorb it.',
      'The money ran out on turn 9, before the craft reached orbit.',
      'Emergency tracking did not find the craft.',
    ])
      expect(classifyCause(line)).toBeNull()
  })
})

describe('the report shows the fix-it loop', () => {
  beforeEach(() => useGameStore.getState().newGame())
  const text = (html: string) => html.replace(/<!-- -->/g, '')

  it('a failed report names the decision with a Fix button and offers a relaunch', () => {
    const sim = runSimulation(iceCubeDesign, 'engineer', 1)
    const report = buildReport(sim)
    useGameStore.setState({ screen: 'report', simState: sim, currentReport: report, design: iceCubeDesign })
    const html = text(renderToString(<App />))
    expect(html).toContain('What to fix')
    expect(html).toContain('Instrument choice')
    expect(html).toContain('Fix at Research Lab')
    expect(html).toContain('Relaunch with changes')
  })

  it('a successful report shows no fix-it panel', () => {
    expect(renderToString(<FixItPanel report={reportOf(flashlightDesign)} />)).toBe('')
  })

  it('a Fix button keeps the design, puts the flight away and opens that step', () => {
    const design = { ...flashlightDesign, attitude: 'attitude-basic' }
    const sim = runSimulation(design, 'engineer', 2)
    const report = buildReport(sim)
    useGameStore.setState({ screen: 'report', simState: sim, currentReport: report, design })
    useGameStore.getState().reviseAt(topCauses(report)[0].step)
    const s = useGameStore.getState()
    expect(s).toMatchObject({ screen: 'design', designStep: 'spacecraft', simState: null, currentReport: null })
    expect(s.design).toEqual(design)
  })
})
