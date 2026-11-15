import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './gameStore'
import { useAgencyStore } from './agencyStore'
import { createDefaultDesign, computeBudgets } from '../sim/budgets'
import { isSimComplete, initSim, stepTurn, getDefaultAction } from '../sim/simulate'
import { flashlightDesign } from '../sim/fixtures'
import type { SimState } from '../sim/types'
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
    const st = useGameStore.getState()
    // An event card waits for an answer; take its first option (the standing orders)
    if (st.simState!.pendingDecision) st.answerEvent(st.simState!.pendingDecision.options[0].id)
    else st.advanceTurn()
  }
}

describe('gameStore building navigation', () => {
  beforeEach(reset)

  it('opens the step of a building and remembers it', () => {
    const s = useGameStore.getState()
    s.startNewMission()
    s.openBuilding('factory')
    expect(useGameStore.getState().screen).toBe('design')
    expect(useGameStore.getState().designStep).toBe('spacecraft')
    expect(useGameStore.getState().visitedSteps).toContain('spacecraft')
  })

  it('opens the suggested step when the building holds it', () => {
    const s = useGameStore.getState()
    s.startNewMission()
    s.openBuilding('comms-center')
    expect(useGameStore.getState().designStep).toBe('brief')
    s.openBuilding('comms-center')
    expect(useGameStore.getState().designStep).toBe('planning')
  })

  it('a new mission forgets the visited steps and the mission clock', () => {
    useGameStore.getState().openBuilding('factory')
    useAgencyStore.getState().startMissionClock()
    useGameStore.getState().startNewMission()
    expect(useGameStore.getState().visitedSteps).toEqual([])
    expect(useAgencyStore.getState().missionStartDay).toBeNull()
  })

  it('resetting the demo abandons the mission in both stores', () => {
    useGameStore.getState().openBuilding('factory')
    useGameStore.getState().startSimulation()
    useGameStore.getState().resetDemo()
    const g = useGameStore.getState()
    expect(g.simState).toBeNull()
    expect(g.currentReport).toBeNull()
    expect(g.visitedSteps).toEqual([])
    expect(useAgencyStore.getState().missionStartDay).toBeNull()
    expect(useAgencyStore.getState().lunarMissionStartedDay).toBeNull()
    expect(useAgencyStore.getState().day).toBe(112)
  })

  it('launching returns to the base and starts the mission clock', () => {
    useAgencyStore.getState().resetAgency()
    useGameStore.getState().startSimulation()
    expect(useGameStore.getState().screen).toBe('base')
    expect(useGameStore.getState().simState).not.toBeNull()
    expect(useAgencyStore.getState().missionStartDay).toBe(112)
  })
})

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

  it('stays on the base after the last turn and stores run data', () => {
    runToEnd()
    const st = useGameStore.getState()
    expect(st.screen).toBe('base')
    expect(useAgencyStore.getState().missionClockRunning).toBe(false)
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

// Jakob, 14 Nov: a reload mid-flight must not lose the flight
describe('gameStore keeps the flight across a reload', () => {
  beforeEach(reset)

  it('saves the flight and brings it back where it was, with auto-fly off', async () => {
    useGameStore.getState().startSimulation()
    useGameStore.getState().advanceTurn()
    useGameStore.getState().advanceTurn()
    useGameStore.getState().startAutoFly()
    const before = useGameStore.getState()
    const saved = useGameStore.persist.getOptions().partialize!(before) as Record<string, unknown>
    expect(saved.simState).toBeDefined()
    expect(saved.pendingAction).toBeDefined()
    expect(saved.replayTurn).toBe(before.replayTurn)
    expect('autoFly' in saved).toBe(false)

    // A fresh page: the store starts empty, then loads what was saved
    const json = JSON.parse(JSON.stringify(saved))
    useGameStore.setState({ simState: null, autoFly: true })
    const merged = useGameStore.persist.getOptions().merge!(json, useGameStore.getState()) as ReturnType<
      typeof useGameStore.getState
    >
    expect(merged.simState!.currentTurn).toBe(before.simState!.currentTurn)
    expect(merged.simState!.turnLogs.length).toBe(before.simState!.turnLogs.length)
    expect(merged.autoFly).toBe(false)
  })
})

// Jakob, 14 Nov: the flight plays turn by turn and stops at events and milestones
describe('gameStore turn-by-turn flight', () => {
  beforeEach(reset)

  it('plays one turn per tick and stops by itself at the next milestone', () => {
    useGameStore.getState().startSimulation()
    useGameStore.getState().startAutoFly()
    expect(useGameStore.getState().autoFly).toBe(true)
    const startPhase = useGameStore.getState().simState!.phase
    const startTurn = useGameStore.getState().simState!.currentTurn
    let ticks = 0
    while (useGameStore.getState().autoFly && ticks < 200) {
      useGameStore.getState().autoFlyTick()
      ticks++
    }
    const s = useGameStore.getState().simState!
    expect(useGameStore.getState().autoFly).toBe(false)
    expect(s.currentTurn - startTurn).toBe(ticks) // one turn per tick
    const log = s.turnLogs[s.turnLogs.length - 1]
    expect(s.phase !== startPhase || log.events.length > 0 || !!s.pendingDecision || isSimComplete(s)).toBe(true)
  })

  it('a tick after stopping does nothing', () => {
    useGameStore.getState().startSimulation()
    useGameStore.getState().startAutoFly()
    useGameStore.getState().stopAutoFly()
    const turn = useGameStore.getState().simState!.currentTurn
    useGameStore.getState().autoFlyTick()
    expect(useGameStore.getState().simState!.currentTurn).toBe(turn)
  })
})

/** Fly on standing orders until the craft is in its science orbit; false if the flight ended first */
function flyToOrbit(): boolean {
  useGameStore.setState({ design: flashlightDesign })
  useGameStore.getState().startSimulation()
  let guard = 0
  while (useGameStore.getState().simState!.phase !== 'orbit' && guard++ < 200) {
    const st = useGameStore.getState()
    if (isSimComplete(st.simState!)) return false
    if (st.simState!.pendingDecision) st.answerEvent(st.simState!.pendingDecision.options[0].id)
    else st.advanceTurn()
  }
  return useGameStore.getState().simState!.phase === 'orbit'
}

function reachOrbit() {
  let inOrbit = false
  for (let i = 0; i < 10 && !inOrbit; i++) inOrbit = flyToOrbit()
  expect(inOrbit).toBe(true)
}

// F3 (Jakob, 14 Nov): the player picks how the craft works each month
describe('gameStore choices in flight', () => {
  beforeEach(reset)

  it('keeps the month choice for the next turns, but not the answer to an event card', () => {
    useGameStore.getState().startSimulation()
    useGameStore.getState().setAction({ mode: 'reduced', buyExtraPass: true, choices: { thruster: 'fix' } })
    useGameStore.getState().advanceTurn()
    const a = useGameStore.getState().pendingAction
    expect(a.mode).toBe('reduced')
    expect(a.buyExtraPass).toBe(true)
    expect(a.choices).toBeUndefined()
  })

  it('a new flight starts on full science', () => {
    useGameStore.getState().setAction({ mode: 'safe-mode' })
    useGameStore.getState().startSimulation()
    expect(useGameStore.getState().pendingAction.mode).toBe('full-science')
  })

  it('auto-fly flies each turn with the current choice', () => {
    reachOrbit()
    useGameStore.getState().setAction({ mode: 'safe-mode' })
    useGameStore.getState().startAutoFly()
    useGameStore.getState().autoFlyTick()
    const s = useGameStore.getState().simState!
    expect(s.turnLogs[s.turnLogs.length - 1].dataGenerated).toBe(0)
    expect(useGameStore.getState().pendingAction.mode).toBe('safe-mode')
  })

  it('the extra ground pass costs 0.1 M that month', () => {
    reachOrbit()
    const before = useGameStore.getState().simState!
    const plain = stepTurn(before, getDefaultAction())
    useGameStore.getState().setAction({ buyExtraPass: true })
    useGameStore.getState().advanceTurn()
    const after = useGameStore.getState().simState!
    const money = (s: SimState) => s.flight.main + s.flight.reserve
    expect(money(plain) - money(after)).toBeCloseTo(0.1, 9)
  })
})

// F2 (Jakob, 14 Nov): event cards quote the chance of full success, not a multiplier
describe('gameStore event card odds', () => {
  beforeEach(reset)

  it('the build-delay card says how likely full success is with each answer', () => {
    const design = { ...flashlightDesign, planning: { ...flashlightDesign.planning, testTurns: 3 } }
    let found: SimState | null = null
    for (let seed = 1; seed < 400 && !found; seed++) {
      let s = initSim(design, 'engineer', seed)
      let n = 0
      while (!isSimComplete(s) && !s.pendingDecision && n++ < 60) s = stepTurn(s, getDefaultAction())
      if (s.pendingDecision?.key === 'build-delay') found = s
    }
    expect(found).not.toBeNull()
    useGameStore.setState({ design })
    useGameStore.getState().applyFlight(found!)
    const options = useGameStore.getState().simState!.pendingDecision!.options
    for (const o of options) expect(o.label).toMatch(/About \d+% chance of full success\.$/)
    expect(options.find((o) => o.id === 'cut-test')!.label).not.toMatch(/x\d/)
  })
})

// QC D3: team mode is gone; a save from before drops its keys
describe('gameStore without team mode', () => {
  it('saves no team-mode keys and drops them from an older save', async () => {
    const opts = useGameStore.persist.getOptions()
    const saved = opts.partialize!(useGameStore.getState()) as Record<string, unknown>
    for (const key of ['mode', 'players', 'signOffs']) expect(key in saved).toBe(false)
    expect(opts.version).toBe(2)
    const old = { mode: 'team', players: [{ name: 'A', role: 'ground' }], signOffs: [], designStep: 'orbit' }
    const migrated = (await opts.migrate!(old, 0)) as Record<string, unknown>
    expect(migrated).toEqual({ designStep: 'orbit' })
    const state = useGameStore.getState() as unknown as Record<string, unknown>
    for (const key of ['mode', 'players', 'signOffs', 'setMode', 'setPlayers', 'toggleSignOff']) expect(key in state).toBe(false)
  })
})

// The flight's skip button: one press jumps to the end of the phase the flight is in
describe('skipPhase', () => {
  beforeEach(reset)

  it('jumps to the next phase in one press, unless an event card stops it first', () => {
    useGameStore.getState().startSimulation()
    for (let press = 0; press < 12; press++) {
      const before = useGameStore.getState().simState!
      if (isSimComplete(before)) break
      if (before.pendingDecision) {
        useGameStore.getState().answerEvent(before.pendingDecision.options[0].id)
        continue
      }
      useGameStore.getState().skipPhase()
      const after = useGameStore.getState().simState!
      expect(after.currentTurn).toBeGreaterThan(before.currentTurn)
      // Stopped where it should: a new phase, a card for the player, or the end
      expect(after.phase !== before.phase || !!after.pendingDecision || isSimComplete(after)).toBe(true)
      // ...and never before: every month it skipped stayed in the starting phase
      const skipped = after.turnLogs.slice(before.turnLogs.length, -1)
      for (const log of skipped) expect(log.phase ?? before.phase).toBe(before.phase)
    }
  })
})
