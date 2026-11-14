import type { Difficulty } from '../data/brief'
import { difficultyPresets, lunarIceMapperBrief } from '../data/brief'
import { events, getEventsForPhase, type MissionPhase } from '../data/events'
import { getOrbitById } from '../data/orbits'
import { getRideById, missedRideWaitTurns, missedRideTeamCostPerTurn } from '../data/rides'
import { getTransferById } from '../data/transfers'
import { getPartById, type ComputerPart } from '../data/parts'
import { computeBudgets } from './budgets'
import { SeededRNG } from './rng'
import type {
  Design,
  SimState,
  TurnLog,
  TurnAction,
  TurnEvent,
} from './types'

/**
 * Initialize simulation state from a design.
 */
export function initSim(design: Design, difficulty: Difficulty, seed: number): SimState {
  const budgets = computeBudgets(design, difficulty)

  return {
    design,
    difficulty,
    seed,

    currentTurn: 0,
    phase: 'build',

    coveragePercent: 0,
    totalDataReturned: 0,
    totalDataGenerated: 0,
    totalDataLost: 0,
    fuelRemaining: budgets.deltaVAvailable,
    reserveRemaining: budgets.reserveAmount,
    turnsInOrbit: 0,

    capturedIntoOrbit: false,
    contactLost: false,
    failureReason: undefined,

    turnLogs: [],
    allEvents: [],
  }
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

/**
 * Check if an event occurs this turn based on difficulty and mitigations.
 */
function checkForEvent(
  rng: SeededRNG,
  phase: MissionPhase,
  difficulty: Difficulty,
  design: Design,
  budgets: ReturnType<typeof computeBudgets>
): TurnEvent | undefined {
  const preset = difficultyPresets[difficulty]
  const phaseEvents = getEventsForPhase(phase)

  for (const event of phaseEvents) {
    let odds = event.baseOdds * preset.eventOddsMultiplier

    // Apply mitigations
    for (const mitigation of event.mitigations) {
      if (checkMitigation(mitigation.condition, design, budgets)) {
        odds *= mitigation.oddsMultiplier
      }
    }

    if (rng.chance(odds)) {
      return {
        eventId: event.id,
        turn: 0, // filled in by caller
        phase,
        impact: { deltavLost: 0, powerLost: 0, dataLost: 0, turnsLost: 0, reserveSpent: 0 },
      }
    }
  }

  return undefined
}

/**
 * Check if a mitigation condition is met.
 */
function checkMitigation(
  condition: string,
  design: Design,
  _budgets: ReturnType<typeof computeBudgets>
): boolean {
  const computer = getPartById(design.computer) as ComputerPart | undefined

  switch (condition) {
    case 'Redundant propulsion system':
      return false // Would need to track this separately
    case 'Extra testing phase':
      return design.planning.testTurns >= 2
    case 'Redundant flight computer':
      return computer?.redundant ?? false
    case 'High-reliability radio':
      return design.radio === 'radio-sband' || design.radio === 'radio-xband'
    case 'Large onboard storage':
      return (computer?.storage ?? 0) >= 16
    case 'Precision ADCS with redundancy':
      return design.attitude === 'attitude-precision'
    case 'Basic ADCS (magnetorquers)':
      return design.attitude === 'attitude-basic'
    default:
      return false
  }
}

/**
 * Resolve an event with a player choice.
 */
function resolveEvent(
  eventOccurred: TurnEvent,
  choiceId: string | undefined,
  useReserve: boolean,
  reserveRemaining: number,
  rng: SeededRNG
): TurnEvent {
  const event = events.find((e) => e.id === eventOccurred.eventId)
  if (!event || event.choices.length === 0) return eventOccurred

  // Find the chosen option, or default to first
  const choice = event.choices.find((c) => c.id === choiceId) ?? event.choices[0]

  eventOccurred.choiceId = choice.id

  // Check if player can afford reserve cost
  let reserveSpent = 0
  if (choice.reserveCost > 0 && useReserve && reserveRemaining >= choice.reserveCost) {
    reserveSpent = choice.reserveCost
  }

  // Roll for success
  const succeeded = rng.chance(choice.successChance)
  eventOccurred.choiceSucceeded = succeeded

  // Apply impact
  if (succeeded) {
    // Reduced impact on success
    eventOccurred.impact = {
      deltavLost: choice.impactOnMission.deltavLoss * 0.2,
      powerLost: choice.impactOnMission.powerLoss * 0.2,
      dataLost: choice.impactOnMission.dataLoss * 0.2,
      turnsLost: 0,
      reserveSpent,
    }
  } else {
    // Full impact on failure
    eventOccurred.impact = {
      deltavLost: choice.impactOnMission.deltavLoss,
      powerLost: choice.impactOnMission.powerLoss,
      dataLost: choice.impactOnMission.dataLoss,
      turnsLost: choice.impactOnMission.turnLoss,
      reserveSpent,
    }
  }

  return eventOccurred
}

/**
 * Step the simulation forward one turn.
 */
export function stepTurn(state: SimState, action: TurnAction): SimState {
  const rng = new SeededRNG(state.seed + state.currentTurn * 1000)
  const budgets = computeBudgets(state.design, state.difficulty)
  const orbit = getOrbitById(state.design.orbit)
  const ride = getRideById(state.design.ride)
  const transfer = getTransferById(state.design.transfer)

  const nextState: SimState = { ...state }
  nextState.currentTurn++

  const log: TurnLog = {
    turn: nextState.currentTurn,
    phase: state.phase,
    coveragePercent: state.coveragePercent,
    dataGenerated: 0,
    dataSent: 0,
    dataLost: 0,
    totalDataReturned: state.totalDataReturned,
    fuelRemaining: state.fuelRemaining,
    batteryState: budgets.batteryCapacity,
    reserveRemaining: state.reserveRemaining,
    events: [],
    notes: [],
  }

  // Handle current phase
  switch (state.phase) {
    case 'build': {
      log.notes.push(`Build phase: turn ${nextState.currentTurn} of ${budgets.buildTurns}`)
      if (nextState.currentTurn >= budgets.buildTurns) {
        nextState.phase = 'test'
        log.notes.push('Build complete. Starting test phase.')
      }
      break
    }

    case 'test': {
      const testTurn = nextState.currentTurn - budgets.buildTurns
      log.notes.push(`Test phase: turn ${testTurn} of ${budgets.testTurns}`)
      if (testTurn >= budgets.testTurns) {
        // Check if we make the ride
        if (nextState.currentTurn < (ride?.departureTurn ?? 8)) {
          nextState.phase = 'wait'
          log.notes.push('Testing complete. Waiting for ride.')
        } else if (nextState.currentTurn === (ride?.departureTurn ?? 8)) {
          nextState.phase = 'transfer'
          log.notes.push('Testing complete. Launching!')
        } else {
          // Missed the ride
          nextState.phase = 'wait'
          nextState.reserveRemaining -= missedRideTeamCostPerTurn
          log.notes.push(`Missed the ride! Waiting ${missedRideWaitTurns} turns for next opportunity.`)
        }
      }
      break
    }

    case 'wait': {
      const rideTurn = ride?.departureTurn ?? 8
      if (nextState.currentTurn >= rideTurn) {
        nextState.phase = 'transfer'
        log.notes.push('Ride available. Launching!')
      } else {
        log.notes.push(`Waiting for ride on turn ${rideTurn}...`)
      }
      break
    }

    case 'transfer': {
      // Check for transfer events
      const event = checkForEvent(rng, 'transfer', state.difficulty, state.design, budgets)
      if (event) {
        event.turn = nextState.currentTurn
        const resolved = resolveEvent(
          event,
          action.eventChoice,
          action.useReserve,
          nextState.reserveRemaining,
          rng
        )
        log.events.push(resolved)
        nextState.allEvents.push(resolved)
        nextState.fuelRemaining -= resolved.impact.deltavLost
        nextState.reserveRemaining -= resolved.impact.reserveSpent
        log.notes.push(`Event: ${events.find((e) => e.id === event.eventId)?.name}`)
      }

      // Progress through transfer
      const transferDuration = transfer?.durationTurns ?? 1
      const transferStartTurn = ride?.departureTurn ?? 8
      const turnsInTransfer = nextState.currentTurn - transferStartTurn

      log.notes.push(`Transfer phase: turn ${turnsInTransfer + 1} of ${transferDuration}`)

      // Consume transfer delta-v (proportionally)
      const deltaVPerTurn = budgets.deltaVTransfer / transferDuration
      nextState.fuelRemaining -= deltaVPerTurn
      log.fuelRemaining = nextState.fuelRemaining

      if (turnsInTransfer + 1 >= transferDuration) {
        nextState.phase = 'capture'
        log.notes.push('Transfer complete. Approaching lunar orbit insertion.')
      }
      break
    }

    case 'capture': {
      // This is the critical moment
      log.notes.push('Lunar Orbit Insertion burn!')

      // Check for capture events (thruster clog, etc.)
      const event = checkForEvent(rng, 'capture', state.difficulty, state.design, budgets)
      if (event) {
        event.turn = nextState.currentTurn
        const resolved = resolveEvent(
          event,
          action.eventChoice,
          action.useReserve,
          nextState.reserveRemaining,
          rng
        )
        log.events.push(resolved)
        nextState.allEvents.push(resolved)
        nextState.fuelRemaining -= resolved.impact.deltavLost
        nextState.reserveRemaining -= resolved.impact.reserveSpent
        log.notes.push(`Event during capture: ${events.find((e) => e.id === event.eventId)?.name}`)
      }

      // Check if we have enough fuel for capture
      if (nextState.fuelRemaining >= budgets.deltaVCapture) {
        nextState.fuelRemaining -= budgets.deltaVCapture
        nextState.capturedIntoOrbit = true
        nextState.phase = 'orbit'
        log.notes.push('Capture burn successful! In lunar orbit.')
      } else {
        // Failed to capture
        nextState.phase = 'failed'
        nextState.failureReason = `Insufficient delta-v for capture. Needed ${budgets.deltaVCapture.toFixed(0)} m/s, had ${nextState.fuelRemaining.toFixed(0)} m/s.`
        log.notes.push('Capture burn failed: insufficient fuel.')
      }
      log.fuelRemaining = nextState.fuelRemaining
      break
    }

    case 'orbit': {
      nextState.turnsInOrbit++
      log.notes.push(`Orbit phase: turn ${nextState.turnsInOrbit} of ${lunarIceMapperBrief.missionDurationTurns}`)

      // Check for orbit events
      const event = checkForEvent(rng, 'orbit', state.difficulty, state.design, budgets)
      if (event) {
        event.turn = nextState.currentTurn
        const resolved = resolveEvent(
          event,
          action.eventChoice,
          action.useReserve,
          nextState.reserveRemaining,
          rng
        )
        log.events.push(resolved)
        nextState.allEvents.push(resolved)
        nextState.fuelRemaining -= resolved.impact.deltavLost
        nextState.reserveRemaining -= resolved.impact.reserveSpent
        nextState.totalDataLost += resolved.impact.dataLost

        // Check for contact loss (critical)
        if (resolved.eventId === 'comm-loss' && !resolved.choiceSucceeded) {
          nextState.contactLost = true
          nextState.phase = 'failed'
          nextState.failureReason = 'Communication with spacecraft lost.'
          log.notes.push('Contact lost with spacecraft. Mission failed.')
        }
      }

      if (nextState.phase === 'orbit') {
        // Station keeping
        const skDeltaV = budgets.deltaVStationKeeping
        if (nextState.fuelRemaining >= skDeltaV) {
          nextState.fuelRemaining -= skDeltaV
        } else {
          // Can't maintain orbit - will eventually deorbit
          log.notes.push('Warning: Low fuel for station keeping.')
        }

        // Science data generation based on operating mode
        let dataMultiplier = 1.0
        if (action.mode === 'reduced') {
          dataMultiplier = 0.5
        } else if (action.mode === 'safe-mode') {
          dataMultiplier = 0
        }

        const dataGenerated = budgets.dataPerTurn * dataMultiplier
        log.dataGenerated = dataGenerated
        nextState.totalDataGenerated += dataGenerated

        // Downlink
        let downlinkCapacity = budgets.downlinkPerTurn
        if (action.buyExtraPass) {
          downlinkCapacity *= 1.5
          nextState.reserveRemaining -= 0.1 // Cost of extra DSN time
        }

        const dataSent = Math.min(dataGenerated, downlinkCapacity)
        const dataLost = Math.max(0, dataGenerated - downlinkCapacity - budgets.storageCapacity)

        log.dataSent = dataSent
        log.dataLost = dataLost
        nextState.totalDataReturned += dataSent
        nextState.totalDataLost += dataLost

        // Coverage
        const coveragePerTurn = orbit?.coveragePerTurn ?? 5
        nextState.coveragePercent = Math.min(100, state.coveragePercent + coveragePerTurn * dataMultiplier)
        log.coveragePercent = nextState.coveragePercent

        // Check mission duration
        if (nextState.turnsInOrbit >= lunarIceMapperBrief.missionDurationTurns) {
          nextState.phase = 'complete'
          log.notes.push('Mission duration complete!')
        }
      }

      log.fuelRemaining = nextState.fuelRemaining
      log.totalDataReturned = nextState.totalDataReturned
      log.reserveRemaining = nextState.reserveRemaining
      break
    }

    case 'complete':
    case 'failed':
      // No more turns
      break
  }

  nextState.turnLogs = [...state.turnLogs, log]
  return nextState
}

/**
 * Run a complete simulation with default actions.
 */
export function runSimulation(
  design: Design,
  difficulty: Difficulty,
  seed: number
): SimState {
  let state = initSim(design, difficulty, seed)

  // Run until complete or failed (max 50 turns as safety)
  let turns = 0
  while (state.phase !== 'complete' && state.phase !== 'failed' && turns < 50) {
    state = stepTurn(state, getDefaultAction())
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
