import type { FirstPass } from './firstPass'
import type { Difficulty } from '../data/brief'
import type { EventType } from '../data/events'

/** Design step IDs */
export type DesignStep =
  | 'brief'
  | 'planning'
  | 'instruments'
  | 'rocket'
  | 'spacecraft'
  | 'orbit'
  | 'ride'
  | 'comms'
  | 'go-nogo'

/** Planning choices from step 1 */
export interface PlanningChoices {
  buildTurns: number // kept for saved designs; build time now follows from the parts (Budgets.buildTurns)
  testTurns: number // turns for testing (0 to 3)
  reservePercent: number // % of the budget held back for surprises
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
  /** The launch rocket assembled on the Rocket step (part ids per slot). Looks only: it does not change the mission numbers. Missing means the default rocket. */
  rocket?: Record<'engine' | 'stage1' | 'stage2' | 'nose' | 'fins' | 'boosters', string>
  contactHours?: number // hours a day booked on the ground station; the station's default if missing
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
  dataPerTurn: number // MB made per turn by the instruments at the power available
  downlinkPerTurn: number // MB that can be sent home per turn
  storageCapacity: number // MB onboard storage
  dataMarginPerTurn: number // MB/turn surplus (downlink - generated)

  // Reliability (shown only)
  overallReliability: number // combined reliability 0-1
  testingBonus: number // reliability improvement from testing

  // Lunar Ice Mapper model (see src/sim/budgets.ts)
  dryMass: number // kg without propellant
  propellantMass: number // kg
  buildEffort: number // points; 10 a turn
  testFactor: number // multiplies the odds of things going wrong in flight
  spendable: number // $M: budget minus reserve
  busPower: number // W: computer, pointing, radio listening, heater
  instrumentPower: number // W with every instrument on
  transmitExtraPower: number // W the radio adds while transmitting
  scienceDuty: number // 0-1 share of the time the instruments can run
  sunlitShare: number // 0-1 share of each orbit in sunlight (the power sentences name it)
  observingShare: number // 0-1 share of each orbit spent over the pole
  averagePowerLeft: number // W left for the instruments averaged over the orbit's shadow and radio time
  transmitShare: number // 0-1 share of the contact time the radio can transmit
  batteryUsableWh: number
  batteryNeedWh: number // Wh to get through one eclipse
  batteryOk: boolean
  batteryLongNeedWh: number // Wh for the bus alone through a long (3-hour) eclipse
  batteryLongOk: boolean // survives a 3-hour long eclipse on the bus alone
  captureDeltaV: number | null // m/s from the drop-off into orbit (ride extra included); null = impossible
  thrustPower: number // W left for an electric engine while thrusting
  thrustLevel: number // 0-1 share of nominal thrust
  transferTurns: number | null // turns from launch to capture; null = cannot get there
  arrivalTurn: number | null
  deltaVAfterCapture: number
  upkeepTurns: number // turns of holding the orbit the propellant allows after capture
  linkKbps: number
  contactHours: number
  opsCostPerTurn: number // $M per turn in orbit
  transferCostPerTurn: number // $M per turn of transfer
  costPrelaunch: number // $M
  quality: Record<string, number> // per instrument, 0-1
  coverageRate: Record<string, number> // per instrument: share of the unmapped region observed per turn
  projectedCoverage: number // % ice coverage after 12 clean turns
  projectedData: number // MB science data after 12 clean turns
  projectedContext: number
  projectedOutreach: number
  projectedLost: number
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
  /** One short line for the Go/No-Go card when the reason needs its numbers to be read; the reason sits behind Details */
  headline?: string
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
  choices?: Partial<Record<EventType, string>> // answers to event cards, by event
  autoDecide?: boolean // answer every event card with its first option (standing orders)
}

/** An event card that waits for the player */
export interface Decision {
  key: EventType
  title: string
  text: string
  options: { id: string; label: string }[]
  realMission?: string
  turn: number
}

/** Event that occurred during a turn */
export interface TurnEvent {
  eventId: EventType
  turn: number
  phase: 'build' | 'launch' | 'transfer' | 'capture' | 'orbit'
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

  // Event card waiting for the player; the turn is replayed with the same dice once answered
  pendingDecision?: Decision

  /** How the first mapping pass went (src/sim/firstPass.ts); absent until it is taken, and then month 1 runs as the autopilot */
  firstPass?: FirstPass

  // Internal flight state of the Lunar Ice Mapper model
  flight: FlightState
}

/** Science bookkeeping per instrument */
export interface ScienceState {
  observed: Record<string, number> // % of the region observed
  waiting: Record<string, number> // % observed but still on board
  mapped: Record<string, number> // % whose data is home
  storedBy: Record<string, number> // MB on board per instrument
  returned: Record<string, number> // MB home per instrument
  stored: number
  lost: number
}

export type FlightCounter =
  | 'build-delay'
  | 'radiation-reset'
  | 'station-outage'
  | 'long-eclipse'
  | 'instrument-degrades'
  | 'thruster'
  | 'tests-cut'

export interface FlightState {
  main: number // $M main budget left
  reserve: number // $M reserve left; below 0 = overdrawn
  dvLeft: number
  transferLeft: number | null
  launchTurn: number
  stages: { design: number; build: number; test: number; integration: number }
  testTurns: number
  testFactor: number
  missedRides: number
  scienceTurns: number
  scienceFactor: number
  thrusterOk: boolean
  launchedTurn: number | null
  captureTurn: number | null
  captured: boolean
  alive: boolean
  done: boolean
  end: string
  counts: Record<FlightCounter, number>
  science: ScienceState
  coverage: number // % ice coverage mapped (data home)
  data: number // MB science data home
  context: number
  outreach: number
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
  causes: string[] // for a miss: the chain walked back to the decisions and events behind it
}

/** Score breakdown (out of 1000) */
export interface ScoreBreakdown {
  coverage: number // out of 400
  data: number // out of 250
  lifetime: number // out of 150
  context: number // out of 100: sunlit-ground mapping by the IR spectrometer
  money: number // out of 100: money left
  total: number
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
  /** The craft itself was lost (not just stopped for lack of money); absent in reports saved before 15 Nov */
  craftLost?: boolean

  // Requirements
  requirements: RequirementResult[]
  requirementsMet: number
  requirementsTotal: number

  // Score
  score: ScoreBreakdown
  /** What cost the missing points: one plain line per score part below its maximum */
  scoreNotes: string[]

  // Stats
  totalCost: number
  dataReturned: number
  outreachReturned: number // MB of camera pictures home (not science)
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
