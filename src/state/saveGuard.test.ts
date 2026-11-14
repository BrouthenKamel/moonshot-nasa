import { describe, it, expect } from 'vitest'
import { sanitizeSavedGame } from './saveGuard'
import { useGameStore, GAME_SAVE_VERSION } from './gameStore'
import { createDefaultDesign } from '../sim/budgets'
import { initSim } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'
import { FIXED_DIFFICULTY } from './gameStore'

const defaults = createDefaultDesign()

describe('old saved games load safely (QC #70)', () => {
  it('a design without "planning" falls back to the default design', () => {
    const { planning: _drop, ...old } = createDefaultDesign()
    const out = sanitizeSavedGame({ design: old })
    expect(out.design).toEqual(defaults)
  })

  it('a design with the old difficulty field keeps its choices, without the field', () => {
    const old = { ...createDefaultDesign(), radio: 'radio-xband', difficulty: 'cadet' }
    const out = sanitizeSavedGame({ design: old })
    expect(out.design?.radio).toBe('radio-xband')
    expect(out.design).not.toHaveProperty('difficulty')
  })

  it('a design naming a part that no longer exists falls back to the default design', () => {
    const out = sanitizeSavedGame({ design: { ...createDefaultDesign(), radio: 'radio-gone' } })
    expect(out.design).toEqual(defaults)
  })

  it('garbage gives an empty, playable save', () => {
    for (const junk of [null, undefined, 42, 'x', [], { design: 'nope', simState: 7, runHistory: 'x', visitedSteps: {} }]) {
      const out = sanitizeSavedGame(junk)
      expect(out.design).toEqual(defaults)
      expect(out.simState ?? null).toBeNull()
      expect(out.currentReport ?? null).toBeNull()
      expect(out.runHistory ?? []).toEqual([])
      expect(out.visitedSteps ?? []).toEqual([])
    }
  })

  it('a broken flight is dropped, a good one is kept', () => {
    const sim = initSim(createDefaultDesign(), FIXED_DIFFICULTY, 1)
    expect(sanitizeSavedGame({ simState: sim }).simState).toEqual(sim)
    const { flight: _f, ...noFlight } = sim
    expect(sanitizeSavedGame({ simState: noFlight }).simState).toBeNull()
    const oldDesign = { ...sim, design: { ...sim.design, planning: undefined } }
    expect(sanitizeSavedGame({ simState: oldDesign }).simState).toBeNull()
  })

  it('a report without a flight is dropped; history keeps only well-formed entries', () => {
    const sim = initSim(createDefaultDesign(), FIXED_DIFFICULTY, 1)
    const report = buildReport(sim)
    const out = sanitizeSavedGame({
      currentReport: report,
      runHistory: [{ id: 'a', report }, { id: 'b' }, 'junk', { id: 'c', report: { outcome: 'success' } }],
    })
    expect(out.currentReport).toBeNull()
    expect(out.runHistory?.map((e) => e.id)).toEqual(['a'])
  })

  it('unknown steps are dropped from the visited list', () => {
    const out = sanitizeSavedGame({ visitedSteps: ['brief', 'launch-pad', 3], designStep: 'gone' })
    expect(out.visitedSteps).toEqual(['brief'])
    expect(out.designStep).toBe('brief')
  })
})

// Node's test run has no working localStorage, so these call the store's own
// persist options (migrate, then merge) the way a reload does.
describe('the game store loads a save through the guard', () => {
  const load = (state: unknown, version: number) => {
    const opts = useGameStore.persist.getOptions()
    const migrated = version === opts.version ? state : opts.migrate!(state, version)
    return opts.merge!(migrated, useGameStore.getState())
  }

  it('saves with a version', () => {
    expect(useGameStore.persist.getOptions().version).toBe(GAME_SAVE_VERSION)
    expect(GAME_SAVE_VERSION).toBeGreaterThan(0)
  })

  it('an old version-0 save without planning does not crash and gives the default design', () => {
    const { planning: _drop, ...old } = createDefaultDesign()
    expect(load({ design: old }, 0).design).toEqual(defaults)
  })

  it('an old version-0 save that still fits keeps its design', () => {
    const out = load({ design: { ...createDefaultDesign(), radio: 'radio-xband' }, visitedSteps: ['brief'] }, 0)
    expect(out.design.radio).toBe('radio-xband')
    expect(out.visitedSteps).toEqual(['brief'])
  })

  it('garbage in storage gives a playable game', () => {
    const out = load('garbage', 0)
    expect(out.design).toEqual(defaults)
    expect(out.simState).toBeNull()
  })

  it('a reload lands on the base, even when an old save remembered the report (QC #84)', () => {
    const sim = initSim(createDefaultDesign(), FIXED_DIFFICULTY, 1)
    expect(load({ screen: 'report', simState: sim }, 0).screen).toBe('base')
    expect(load({ screen: 'design' }, GAME_SAVE_VERSION).screen).toBe('base')
  })
})

