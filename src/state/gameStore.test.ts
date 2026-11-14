import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './gameStore'
import { createDefaultDesign, computeBudgets } from '../sim/budgets'
import { isSimComplete } from '../sim/simulate'
import { buildReport } from '../sim/evaluate'

function reset() {
  useGameStore.setState({
    screen: 'design',
    design: createDefaultDesign(),
    simState: null,
    currentReport: null,
    runHistory: [],
    previousBudgets: null,
    replayTurn: 0,
    replayEntryId: null,
  })
}

function runToEnd() {
  const s = useGameStore.getState()
  s.startSimulation()
  let guard = 0
  while (!isSimComplete(useGameStore.getState().simState!) && guard++ < 500) {
    useGameStore.getState().advanceTurn()
  }
}

describe('gameStore visualiser state', () => {
  beforeEach(reset)

  it('tracks previousBudgets on updateDesign and clears on step change', () => {
    const { difficulty } = useGameStore.getState()
    const base = computeBudgets(createDefaultDesign(), difficulty)
    useGameStore.getState().updateDesign({ solar: 'solar-body' })
    const prev = useGameStore.getState().previousBudgets
    expect(prev).not.toBeNull()
    expect(prev!.powerMargin).toBe(base.powerMargin)
    useGameStore.getState().setDesignStep('orbit')
    expect(useGameStore.getState().previousBudgets).toBeNull()
  })

  it('stays on simulation after the last turn and stores run data', () => {
    runToEnd()
    const st = useGameStore.getState()
    expect(st.screen).toBe('simulation')
    expect(st.currentReport).not.toBeNull()
    expect(st.runHistory[0].run?.turnLogs.length).toBe(st.simState!.turnLogs.length)
    expect(st.runHistory[0].run?.seed).toBe(st.simState!.seed)
    expect(st.replayTurn).toBe(st.simState!.turnLogs.length - 1)
  })

  it('showReport switches to the report screen', () => {
    useGameStore.getState().showReport()
    expect(useGameStore.getState().screen).toBe('report')
  })

  it('openReplay guards entries without run and opens the current run', () => {
    runToEnd()
    const report = useGameStore.getState().currentReport!
    useGameStore.setState({
      screen: 'report',
      runHistory: [{ id: 'old', report }],
    })
    useGameStore.getState().openReplay('old')
    expect(useGameStore.getState().screen).toBe('report')

    useGameStore.getState().openReplay()
    const st = useGameStore.getState()
    expect(st.screen).toBe('replay')
    expect(st.replayTurn).toBe(st.simState!.turnLogs.length - 1)
  })

  it('keeps history capped at 20', () => {
    runToEnd()
    const report = buildReport(useGameStore.getState().simState!)
    for (let i = 0; i < 25; i++) useGameStore.getState().saveToHistory(report)
    expect(useGameStore.getState().runHistory.length).toBe(20)
  })
})
