import type { Difficulty } from '../data/brief'
import { difficultyPresets, lunarIceMapperBrief, modelConstants as C, programmeHorizonTurns } from '../data/brief'
import { getEventById, type EventType } from '../data/events'
import { getOrbitById } from '../data/orbits'
import { getRideById, missedRideWaitTurns } from '../data/rides'
import { getPartById, type ComputerPart, type PropulsionPart } from '../data/parts'
import { getGroundStationById } from '../data/ground'
import { computeBudgets, newScienceState, scienceTurn, scienceTotals } from './budgets'
import { SeededRNG } from './rng'
import type { Budgets, Decision, Design, FlightState, SimState, TurnAction, TurnEvent, TurnLog } from './types'

/**
 * The flight simulation, one month per turn. Ported from the Lunar Ice Mapper
 * logic map (prototype/lunar_ice_mapper/simulation.py on branch python-core-logic).
 *
 * Each turn draws its dice from seed + turn, so a turn can be replayed exactly.
 * When an event needs the player, stepTurn returns the state unchanged with
 * `pendingDecision` set; calling it again with the answer in `action.choices`
 * replays the turn with the same dice and applies the answer.
 */

class NeedsDecision extends Error {
  readonly decision: Decision
  constructor(decision: Decision) {
    super(decision.title)
    this.decision = decision
  }
}

const BUILD_STAGES = ['design', 'build', 'test', 'integration'] as const
type BuildStage = (typeof BUILD_STAGES)[number] | 'ready'

/**
 * Initialize simulation state from a design.
 */
export function initSim(design: Design, difficulty: Difficulty, seed: number): SimState {
  const b = computeBudgets(design, difficulty)
  const flight: FlightState = {
    main: b.spendable - b.partsCost,
    reserve: b.reserveAmount,
    dvLeft: b.deltaVAvailable,
    transferLeft: b.transferTurns,
    launchTurn: b.rideTurn,
    stages: {
      design: C.designTurns,
      build: b.buildTurns,
      test: design.planning.testTurns,
      integration: C.integrationTurns,
    },
    testTurns: design.planning.testTurns,
    testFactor: b.testFactor,
    missedRides: 0,
    scienceTurns: 0,
    scienceFactor: 1,
    thrusterOk: true,
    launchedTurn: null,
    captureTurn: null,
    captured: false,
    alive: true,
    done: false,
    end: '',
    counts: {
      'build-delay': 0,
      'radiation-reset': 0,
      'station-outage': 0,
      'long-eclipse': 0,
      'instrument-degrades': 0,
      thruster: 0,
      'tests-cut': 0,
    },
    science: newScienceState(design.instruments),
    coverage: 0,
    data: 0,
    context: 0,
    outreach: 0,
  }
  pay(flight, C.testCost * design.planning.testTurns)

  const state: SimState = {
    design,
    difficulty,
    seed,
    currentTurn: 0,
    phase: 'build',
    coveragePercent: 0,
    totalDataReturned: 0,
    totalDataGenerated: 0,
    totalDataLost: 0,
    fuelRemaining: b.deltaVAvailable,
    reserveRemaining: flight.reserve,
    turnsInOrbit: 0,
    capturedIntoOrbit: false,
    contactLost: false,
    failureReason: undefined,
    turnLogs: [],
    allEvents: [],
    flight,
  }
  return state
}

/**
 * Get the default action for a turn.
 */
export function getDefaultAction(): TurnAction {
  return {
    mode: 'full-science',
    buyExtraPass: false,
    eventChoice: undefined,
    useReserve: false,
  }
}

/** Costs come from the main budget, then from the reserve. False once the reserve is overdrawn. */
function pay(f: FlightState, amount: number): boolean {
  f.main -= amount
  if (f.main < 0) {
    f.reserve += f.main
    f.main = 0
  }
  return f.reserve >= 0
}

function buildLeft(f: FlightState): number {
  return f.stages.design + f.stages.build + f.stages.test + f.stages.integration
}

export function buildStage(f: FlightState): BuildStage {
  return BUILD_STAGES.find((s) => f.stages[s] > 0) ?? 'ready'
}

/** Everything one turn needs */
interface TurnContext {
  s: SimState
  f: FlightState
  b: Budgets
  rng: SeededRNG
  odds: number // difficulty multiplier on every event chance
  events: boolean
  action: TurnAction
  log: TurnLog
}

function note(ctx: TurnContext, text: string) {
  ctx.log.notes.push(text)
}

function recordEvent(ctx: TurnContext, eventId: EventType, phase: TurnEvent['phase'], extra: Partial<TurnEvent> = {}) {
  const ev: TurnEvent = {
    eventId,
    turn: ctx.s.currentTurn,
    phase,
    impact: { deltavLost: 0, powerLost: 0, dataLost: 0, turnsLost: 0, reserveSpent: 0 },
    ...extra,
  }
  ctx.log.events.push(ev)
  ctx.s.allEvents.push(ev)
  return ev
}

function decide(ctx: TurnContext, key: EventType, text: string, options: { id: string; label: string }[]): string {
  const answer = ctx.action.choices?.[key]
  if (answer && options.some((o) => o.id === answer)) return answer
  if (ctx.action.autoDecide) return options[0].id
  const def = getEventById(key)
  throw new NeedsDecision({
    key,
    title: def?.name ?? key,
    text,
    options,
    realMission: def?.realWorldSource,
    turn: ctx.s.currentTurn,
  })
}

function fail(ctx: TurnContext, reason: string) {
  ctx.f.alive = false
  ctx.f.end = reason
  note(ctx, reason.charAt(0).toUpperCase() + reason.slice(1) + '.')
}

function capture(ctx: TurnContext, how: string) {
  const { f, b } = ctx
  const needed = b.captureDeltaV ?? Infinity
  if (f.dvLeft < needed) {
    ctx.log.phase = 'capture'
    fail(ctx, 'not enough delta-v left to capture')
    return
  }
  f.dvLeft -= needed
  f.captured = true
  f.captureTurn = ctx.s.currentTurn
  ctx.log.phase = 'capture'
  const orbit = getOrbitById(ctx.s.design.orbit)
  note(ctx, `Capture burn successful (${how}): now in the science orbit, ${orbit?.name ?? ctx.s.design.orbit}.`)
}

// ---------------------------------------------------------------- build
function buildTurn(ctx: TurnContext) {
  const { f, b, rng } = ctx
  const paid = pay(f, C.teamCostPrelaunch)
  const delayEvent = getEventById('build-delay')!
  if (ctx.events && buildLeft(f) > 0 && rng.next() < delayEvent.baseOdds * ctx.odds * (b.buildEffort / 35)) {
    buildDelay(ctx)
  }
  const stage = buildStage(f)
  ctx.log.phase = stage === 'test' ? 'test' : stage === 'ready' ? 'wait' : 'build'
  if (stage !== 'ready') f.stages[stage] -= 1
  const after = buildStage(f)
  note(
    ctx,
    after === 'ready'
      ? `Ready, waiting for the ride on turn ${f.launchTurn}.`
      : `${stage === 'test' ? 'Testing' : stage === 'integration' ? 'Fitting to the ride' : stage === 'design' ? 'Designing' : 'Building'}: ${buildLeft(f)} turn(s) of work left.`
  )
  if (ctx.s.currentTurn === f.launchTurn) {
    if (buildLeft(f) <= 0) launch(ctx)
    else {
      f.launchTurn += missedRideWaitTurns
      f.missedRides += 1
      note(ctx, `Missed the ride: the craft is not ready. Next ride on turn ${f.launchTurn}.`)
    }
  }
  if (!paid && f.alive) fail(ctx, 'budget ran out before launch')
}

function buildDelay(ctx: TurnContext) {
  const { f } = ctx
  const stage = buildStage(f)
  if (stage === 'ready') return
  f.stages[stage] += 1
  f.counts['build-delay'] += 1
  note(ctx, `Build delay during ${stage}: one more turn of work.`)
  const ev = recordEvent(ctx, 'build-delay', 'build', { impact: { deltavLost: 0, powerLost: 0, dataLost: 0, turnsLost: 1, reserveSpent: 0 } })
  // Ask only when the delay costs the ride and there is still testing to cut.
  const readyTurn = ctx.s.currentTurn + buildLeft(f) - 1
  if (readyTurn <= f.launchTurn || f.stages.test <= 0) return
  const worse = C.testFactor[f.testTurns - 1]
  const nextRide = f.launchTurn + missedRideWaitTurns
  const choice = decide(
    ctx,
    'build-delay',
    `A part arrives late or fails inspection. The craft would be ready on turn ${readyTurn}; the ride leaves on turn ${f.launchTurn}.`,
    [
      {
        id: 'wait',
        label: `Accept the delay and miss the ride. The next one leaves on turn ${nextRide}, and the team costs ${C.teamCostPrelaunch} M a turn until then.`,
      },
      {
        id: 'cut-test',
        label: `Cut one test turn and make the ride. Failure odds in flight go from x${f.testFactor} to x${worse}; ${C.testCost} M comes back.`,
      },
    ]
  )
  ev.choiceId = choice
  if (choice === 'cut-test') {
    f.stages.test -= 1
    f.testTurns -= 1
    f.testFactor = worse
    f.main += C.testCost
    f.counts['tests-cut'] += 1
    ev.choiceSucceeded = true
    note(ctx, `Cut one test turn to hold the schedule (failure odds now x${worse}).`)
  }
}

function launch(ctx: TurnContext) {
  const { f, rng, s } = ctx
  const ride = getRideById(s.design.ride)
  pay(f, ride?.cost ?? 0)
  f.launchedTurn = s.currentTurn
  ctx.log.phase = 'transfer'
  note(ctx, `Launched on the ${ride?.name ?? 'ride'}.`)
  const ev = getEventById('no-signal')!
  const recovery = ev.choices.find((c) => c.id === 'recover')!
  const computer = getPartById(s.design.computer) as ComputerPart | undefined
  if (ctx.events && rng.next() < ev.baseOdds * f.testFactor * (computer?.resetFactor ?? 1) * ctx.odds) {
    note(ctx, 'No signal after deployment.')
    const record = recordEvent(ctx, 'no-signal', 'launch')
    let recovered = false
    if (f.reserve >= recovery.reserveCost) {
      const choice = decide(ctx, 'no-signal', ev.description, [
        {
          id: 'recover',
          label: `Book emergency tracking on the big dishes: ${Math.round(recovery.successChance * 100)}% chance to find the craft; ${recovery.reserveCost} M from the reserve if it works.`,
        },
        { id: 'give-up', label: 'Give up the search. The mission is lost.' },
      ])
      record.choiceId = choice
      if (choice === 'recover' && rng.next() < recovery.successChance) {
        f.reserve -= recovery.reserveCost
        recovered = true
        record.impact.reserveSpent = recovery.reserveCost
        note(ctx, `Emergency tracking found the craft (reserve -${recovery.reserveCost} M).`)
      }
      record.choiceSucceeded = recovered
    } else {
      note(ctx, `No reserve left to pay for emergency tracking (${recovery.reserveCost} M needed).`)
    }
    if (!recovered) {
      fail(ctx, 'lost contact after deployment')
      return
    }
  }
  if (f.transferLeft === null) {
    fail(ctx, 'this craft cannot reach the science orbit')
    return
  }
  if (f.transferLeft === 0) capture(ctx, 'direct transfer')
}

// ---------------------------------------------------------------- transfer
function transferTurn(ctx: TurnContext) {
  const { f, b, rng, s } = ctx
  ctx.log.phase = 'transfer'
  if (!pay(f, b.transferCostPerTurn)) {
    f.done = true
    fail(ctx, 'budget ran out during transfer')
    return
  }
  const ev = getEventById('thruster')!
  const fix = ev.choices.find((c) => c.id === 'fix')!
  const propulsion = getPartById(s.design.propulsion) as PropulsionPart | undefined
  const impulsive = propulsion?.impulsive ?? true
  if (ctx.events && f.thrusterOk && rng.next() < ev.baseOdds * f.testFactor * ctx.odds) {
    f.counts.thruster += 1
    note(ctx, 'Thruster underperforms.')
    const record = recordEvent(ctx, 'thruster', 'transfer')
    const effect = impulsive ? 'the delta-v on board is halved' : 'the rest of the transfer takes twice as long'
    let fixed = false
    if (f.reserve >= fix.reserveCost) {
      const choice = decide(ctx, 'thruster', `${ev.description} If nothing is done, ${effect}.`, [
        {
          id: 'fix',
          label: `Have the team work on a fix: ${Math.round(fix.successChance * 100)}% chance; if it works it costs ${fix.reserveCost} M from the reserve and 1 extra turn.`,
        },
        { id: 'accept', label: `Fly on as it is: ${effect}.` },
      ])
      record.choiceId = choice
      if (choice === 'fix' && rng.next() < fix.successChance) {
        f.reserve -= fix.reserveCost
        f.transferLeft = (f.transferLeft ?? 0) + 1
        fixed = true
        record.impact.reserveSpent = fix.reserveCost
        record.impact.turnsLost = 1
        note(ctx, `Thruster fixed (reserve -${fix.reserveCost} M, +1 turn).`)
      }
      record.choiceSucceeded = fixed
    } else {
      // Nothing to choose: no card, and no choice that "failed"
      note(ctx, `No reserve left to pay for a fix (${fix.reserveCost} M needed).`)
    }
    if (!fixed) {
      f.thrusterOk = false
      if (impulsive) {
        record.impact.deltavLost = f.dvLeft * 0.5
        f.dvLeft *= 0.5
        note(ctx, `Thruster stays weak: delta-v on board halved to ${f.dvLeft.toFixed(0)} m/s.`)
      } else {
        const before = f.transferLeft ?? 0
        f.transferLeft = before * 2
        record.impact.turnsLost = before
        note(ctx, `Thruster stays weak: ${f.transferLeft - 1} more turns to arrival.`)
      }
    }
  }
  f.transferLeft = (f.transferLeft ?? 0) - 1
  note(ctx, f.transferLeft > 0 ? `In transfer: ${f.transferLeft} turn(s) to arrival.` : 'Arriving at the Moon.')
  if (f.transferLeft <= 0) capture(ctx, 'after the transfer')
}

// ---------------------------------------------------------------- science
function scienceTurnStep(ctx: TurnContext) {
  const { f, b, rng, s } = ctx
  const brief = lunarIceMapperBrief
  ctx.log.phase = 'orbit'
  if (!pay(f, b.opsCostPerTurn)) {
    f.done = true
    fail(ctx, 'budget ran out in orbit')
    return
  }
  let duty = ctx.action.mode === 'safe-mode' ? 0 : ctx.action.mode === 'reduced' ? 0.5 : 1
  let link = 1
  if (ctx.action.buyExtraPass) {
    link *= 1.5
    pay(f, 0.1)
  }
  if (ctx.events) {
    const computer = getPartById(s.design.computer) as ComputerPart | undefined
    const station = getGroundStationById(s.design.groundStation)
    if (rng.next() < getEventById('radiation-reset')!.baseOdds * (computer?.resetFactor ?? 1) * ctx.odds) {
      duty = 0
      f.counts['radiation-reset'] += 1
      recordEvent(ctx, 'radiation-reset', 'orbit')
      note(ctx, 'Radiation reset: safe mode, no science this turn.')
    }
    if (rng.next() < (station?.outageChance ?? 0) * ctx.odds) {
      link *= 0.5
      f.counts['station-outage'] += 1
      recordEvent(ctx, 'station-outage', 'orbit')
      note(ctx, 'Ground station outage: half the contact time.')
    }
    if (rng.next() < getEventById('long-eclipse')!.baseOdds * ctx.odds && !b.batteryLongOk) {
      duty = 0
      f.counts['long-eclipse'] += 1
      recordEvent(ctx, 'long-eclipse', 'orbit')
      note(ctx, 'Long eclipse drained the battery: safe mode, no science this turn.')
    }
    if (rng.next() < getEventById('instrument-degrades')!.baseOdds * f.testFactor * ctx.odds) {
      f.scienceFactor *= 0.8
      f.counts['instrument-degrades'] += 1
      recordEvent(ctx, 'instrument-degrades', 'orbit')
      note(ctx, 'Instrument degraded: 20% less science per turn from now on.')
    }
  }
  const lostBefore = f.science.lost
  const turn = scienceTurn(s.design, b, f.science, duty, link, f.scienceFactor)
  ctx.log.dataGenerated = turn.made
  ctx.log.dataSent = turn.sent
  ctx.log.dataLost = f.science.lost - lostBefore
  f.scienceTurns += 1
  f.dvLeft -= b.deltaVStationKeeping
  if (f.dvLeft < 0) fail(ctx, 'out of propellant, orbit lost')

  // End test
  const beforeCoverage = f.coverage
  const beforeData = f.data
  ;[f.coverage, f.data, f.context, f.outreach] = scienceTotals(s.design, f.science)
  note(ctx, `Science turn ${f.scienceTurns}: ice mapped ${f.coverage.toFixed(1)}%, ${f.data.toFixed(0)} MB home.`)
  if (!f.alive) return
  const turnsNeeded = brief.missionDurationTurns
  const dataTarget = difficultyPresets[s.difficulty]?.dataTarget ?? 300
  const coverageTarget = 70
  if (f.scienceTurns >= turnsNeeded) {
    if (f.coverage >= coverageTarget && f.data >= dataTarget) {
      f.done = true
      f.end = 'all requirements met'
      note(ctx, 'All requirements met: mission complete.')
      return
    }
    const growing =
      (f.coverage < coverageTarget && f.coverage - beforeCoverage > C.progressMinCoverage) ||
      (f.data < dataTarget && f.data - beforeData > C.progressMinData)
    if (!growing || f.scienceTurns >= turnsNeeded + C.extensionMaxTurns) {
      f.done = true
      f.end = 'primary mission over'
      note(ctx, growing ? 'Mission over: the extended mission has run its full length.' : 'Mission over: the science has stopped growing.')
      return
    }
    if (f.alive && f.scienceTurns === turnsNeeded) {
      note(ctx, 'Primary mission done but targets not yet met: extended mission begins.')
    }
  }
}

// ---------------------------------------------------------------- turn engine
function runTurn(s: SimState, action: TurnAction) {
  const f = s.flight
  const b = computeBudgets(s.design, s.difficulty)
  s.currentTurn += 1
  const log: TurnLog = {
    turn: s.currentTurn,
    phase: s.phase,
    coveragePercent: f.coverage,
    dataGenerated: 0,
    dataSent: 0,
    dataLost: 0,
    totalDataReturned: f.data,
    fuelRemaining: f.dvLeft,
    batteryState: b.batteryCapacity,
    reserveRemaining: f.reserve,
    events: [],
    notes: [],
  }
  const ctx: TurnContext = {
    s,
    f,
    b,
    rng: new SeededRNG(s.seed + s.currentTurn * 1000),
    odds: difficultyPresets[s.difficulty]?.eventOddsMultiplier ?? 1,
    events: true,
    action,
    log,
  }
  if (f.launchedTurn === null) buildTurn(ctx)
  else if (!f.captured) transferTurn(ctx)
  else scienceTurnStep(ctx)

  if (!f.done && f.alive && s.currentTurn >= programmeHorizonTurns) {
    f.done = true
    f.end = 'the programme was closed: time ran out'
    note(ctx, 'The programme is closed: time ran out.')
  }

  // Mirror the flight into the fields the screens read
  s.phase =
    !f.alive || (f.done && !f.captured)
      ? 'failed'
      : f.done
        ? 'complete'
        : f.launchedTurn === null
          ? buildStage(f) === 'test'
            ? 'test'
            : buildStage(f) === 'ready'
              ? 'wait'
              : 'build'
          : f.captured
            ? 'orbit'
            : 'transfer'
  s.coveragePercent = f.coverage
  s.totalDataReturned = f.data
  s.totalDataGenerated += log.dataGenerated
  s.totalDataLost = f.science.lost
  s.fuelRemaining = f.dvLeft
  s.reserveRemaining = f.reserve
  s.turnsInOrbit = f.scienceTurns
  s.capturedIntoOrbit = f.captured
  s.contactLost = f.end === 'lost contact after deployment'
  s.failureReason = f.alive ? undefined : f.end
  log.coveragePercent = f.coverage
  log.totalDataReturned = f.data
  log.fuelRemaining = f.dvLeft
  log.reserveRemaining = f.reserve
  s.turnLogs = [...s.turnLogs, log]
}

/**
 * Step the simulation forward one turn. If an event card needs the player,
 * returns the state unchanged with `pendingDecision` set.
 */
export function stepTurn(state: SimState, action: TurnAction): SimState {
  if (isSimComplete(state)) return state
  const next: SimState = structuredClone({ ...state, pendingDecision: undefined })
  try {
    runTurn(next, action)
  } catch (e) {
    if (e instanceof NeedsDecision) return { ...state, pendingDecision: e.decision }
    throw e
  }
  return next
}

/**
 * Fly turns until the mission ends or an event card needs the player.
 */
export function flyUntilDecision(state: SimState, action: TurnAction, maxTurns = programmeHorizonTurns): SimState {
  let s = stepTurn(state, action)
  let n = 1
  while (!isSimComplete(s) && !s.pendingDecision && n < maxTurns) {
    s = stepTurn(s, getDefaultAction())
    n++
  }
  return s
}

/**
 * Run a complete simulation on standing orders (every event card gets its first option).
 */
export function runSimulation(design: Design, difficulty: Difficulty, seed: number): SimState {
  let state = initSim(design, difficulty, seed)
  const action: TurnAction = { ...getDefaultAction(), autoDecide: true }
  let turns = 0
  while (!isSimComplete(state) && turns < programmeHorizonTurns + 5) {
    state = stepTurn(state, action)
    turns++
  }
  return state
}

/**
 * Check if simulation is complete.
 */
export function isSimComplete(state: SimState): boolean {
  return state.phase === 'complete' || state.phase === 'failed'
}
