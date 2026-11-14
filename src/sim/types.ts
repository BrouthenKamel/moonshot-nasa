import type { Difficulty } from '../data/brief'
import type { EventType } from '../data/events'

/** Player role in team mode */
export type Role = 'ground' | 'science' | 'space' | 'launch'

/** Player in team mode */
export interface Player {
  name: string
  role: Role
}

/** Design step IDs */
export type DesignStep =
  | 'brief'
  | 'planning'
  | 'instruments'
  | 'spacecraft'
  | 'orbit'
  | 'ride'
  | 'comms'
  | 'go-nogo'

/** Planning choices from step 1 */
export interface PlanningChoices {
  buildTurns: number // turns for build phase
  testTurns: number // turns for testing
  reservePercent: number // % budget held in reserve
}

/** Complete spacecraft design (steps 1-6) */
export interface Design {
  // Step 1: Planning
  planning: PlanningChoices

  // Step 2: Instruments (part IDs)
  instruments: string[]

  // Step 3: Spacecraft config (part IDs)
  structure: string
  solar: string
  battery: string
  radio: string
  computer: string
  attitude: string
  propulsion: string

  // Step 4: Orbit selection
  orbit: string

  // Step 5: Ride and transfer
  ride: string
  transfer: string

  // Step 6: Communications
  groundStation: string
}

/** Computed resource budgets from design */
export interface Budgets {
  // Mass
  totalMass: number // kg
  massLimit: number // kg (from constraints)
  massMargin: number // kg remaining

  // Volume
  totalVolume: number // U
  volumeLimit: number // U (6U)
  volumeMargin: number // U remaining

  // Power (in sun)
  powerGenerated: number // W
  powerConsumed: number // W
  powerMargin: number // W remaining
  thrustingPowerConsumed: number // W during propulsion

  // Power (in eclipse)
  eclipsePowerConsumed: number // W
  eclipseDurationMinutes: number // minutes per orbit
  batteryCapacity: number // Wh
  batteryMarginMinutes: number // how long battery lasts beyond eclipse

  // Cost
  partsCost: number // $M
  rideCost: number // $M
  groundCost: number // $M (setup)
  groundCostPerTurn: number // $M per turn
  operationsCost: number // $M estimated
  totalCost: number // $M
  budgetCap: number // $M from difficulty
  budgetMargin: number // $M remaining
  reserveAmount: number // $M held in reserve

  // Time
  buildTurns: number
  testTurns: number
  totalPrepTurns: number
  rideTurn: number
  readyTurn: number // when spacecraft is ready
  timeMarginTurns: number // turns between ready and ride

  // Delta-v
  deltaVAvailable: number // m/s
  deltaVTransfer: number // m/s needed for transfer
  deltaVCapture: number // m/s needed for orbit insertion
  deltaVStationKeeping: number // m/s per turn
  deltaVTotal: number // m/s needed (transfer + capture + 12*SK)
  deltaVMargin: number // m/s remaining

  // Data
  dataPerTurn: number // GB generated per turn by instruments
  downlinkPerTurn: number // GB that can be sent home per turn
  storageCapacity: number // GB onboard storage
  dataMarginPerTurn: number // GB/turn surplus (downlink - generated)

  // Reliability
  overallReliability: number // combined reliability 0-1
  testingBonus: number // reliability improvement from testing
}

/** Resource bar status */
export type BarStatus = 'green' | 'yellow' | 'red'

/** Go/No-Go check result for one resource */
export interface CheckResult {
  resource: string
  status: BarStatus
  value: number
  limit: number
  margin: number
  unit: string
  reason: string
  fixStep?: DesignStep
}

/** Complete Go/No-Go assessment */
export interface GoNoGoResult {
  canGo: boolean
  checks: CheckResult[]
  blockers: CheckResult[] // only red items
  warnings: CheckResult[] // only yellow items
}

/** Operating mode during simulation */
export type OperatingMode = 'full-science' | 'reduced' | 'safe-mode'

/** Per-turn player action */
export interface TurnAction {
  mode: OperatingMode
  buyExtraPass: boolean // spend money for extra DSN pass
  eventChoice?: string // ID of chosen response to event
  useReserve: boolean // spend reserve on event fix
}

/** Event that occurred during a turn */
export interface TurnEvent {
  eventId: EventType
  turn: number
  phase: 'transfer' | 'capture' | 'orbit'
  choiceId?: string
  choiceSucceeded?: boolean
  impact: {
    deltavLost: number
    powerLost: number
    dataLost: number
    turnsLost: number
    reserveSpent: number
  }
}

/** Log entry for one turn */
export interface TurnLog {
  turn: number
  phase: 'build' | 'test' | 'wait' | 'transfer' | 'capture' | 'orbit' | 'complete' | 'failed'
  // State at end of turn
  coveragePercent: number
  dataGenerated: number // GB this turn
  dataSent: number // GB this turn
  dataLost: number // GB this turn (overflow)
  totalDataReturned: number // cumulative GB
  fuelRemaining: number // m/s equivalent
  batteryState: number // Wh
  reserveRemaining: number // $M
  // Events
  events: TurnEvent[]
  // Notes
  notes: string[]
}

/** Simulation state */
export interface SimState {
  // Configuration
  design: Design
  difficulty: Difficulty
  seed: number

  // Progress
  currentTurn: number
  phase: 'build' | 'test' | 'wait' | 'transfer' | 'capture' | 'orbit' | 'complete' | 'failed'

  // Cumulative state
  coveragePercent: number
  totalDataReturned: number // GB
  totalDataGenerated: number // GB
  totalDataLost: number // GB
  fuelRemaining: number // m/s
  reserveRemaining: number // $M
  turnsInOrbit: number

  // Mission status
  capturedIntoOrbit: boolean
  contactLost: boolean
  failureReason?: string

  // History
  turnLogs: TurnLog[]
  allEvents: TurnEvent[]
}

/** Requirement check in final report */
export interface RequirementResult {
  id: string
  name: string
  met: boolean
  target: number
  actual: number
  unit: string
  reason: string
  traceToDecision?: string // which design choice caused this
}

/** Score breakdown */
export interface ScoreBreakdown {
  requirements: number // out of 600
  science: number // out of 200
  efficiency: number // out of 100
  riskHandling: number // out of 100
  total: number // out of 1000
}

/** What to change hints */
export interface ChangeHint {
  area: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
}

/** Final mission report */
export interface Report {
  // Outcome
  outcome: 'success' | 'partial' | 'failed'
  outcomeReason: string

  // Requirements
  requirements: RequirementResult[]
  requirementsMet: number
  requirementsTotal: number

  // Score
  score: ScoreBreakdown

  // Stats
  totalCost: number
  dataReturned: number
  coverageAchieved: number
  turnsInOrbit: number
  eventsEncountered: number
  eventsHandledWell: number

  // Comparison data
  playerMass: number
  playerCost: number

  // Improvement hints
  hints: ChangeHint[]

  // For history
  design: Design
  difficulty: Difficulty
  timestamp: number
}

/** Run history entry */
export interface RunHistoryEntry {
  id: string
  report: Report
  run?: RunRecord
}

/** Stored run data so a finished run can be replayed */
export interface RunRecord {
  seed: number
  turnLogs: TurnLog[]
  allEvents: TurnEvent[]
}

/** Game mode */
export type GameMode = 'solo' | 'team'

/** Team sign-off state for Go/No-Go */
export interface SignOff {
  role: Role
  playerName: string
  approved: boolean
  concern?: string
}
