import { computeBudgets } from '../../sim/budgets'
import { lunarIceMapperBrief, type Difficulty } from '../../data/brief'
import { rides, getRideById, type Ride } from '../../data/rides'
import { transfers, isTransferCompatible, transferDays } from '../../data/transfers'
import { getPartById, type PropulsionPart } from '../../data/parts'
import type { BarStatus, Budgets, CheckResult, Design } from '../../sim/types'
import { orbitColour, orbitShortName } from './orbitColours'

/**
 * Everything the launch pad shows, from the game's own numbers: the departures
 * board, the transfer signs, the path, the propellant tank, the timeline and the
 * four Go / No-Go bars this step can turn red. Pure: no DOM, no three.js.
 */

export type Reach = 'ok' | 'noWay' | 'noPower' | 'flyPast'
export type RowStatus = 'onTime' | 'tooEarly' | 'tooHeavy' | 'wrongEngine' | 'cantReach' | 'overBudget'
export type DropKind = 'gto' | 'trans-lunar' | 'lunar-vicinity'

export interface BoardRow {
  id: string
  name: string
  dropWords: string
  turn: number
  fee: number
  limitKg: number
  burn: number | null
  planCost: number
  overBudget: boolean
  arrivalTurn: number | null
  status: RowStatus
  statusLabel: string
  selected: boolean
}

export interface TransferSign {
  id: string
  type: 'direct' | 'low_energy'
  title: string
  sub: string
  selectable: boolean
  selected: boolean
}

export interface TankLayer {
  key: 'climb' | 'capture' | 'hold' | 'spare'
  label: string
  value: number
  colour: string
}

export type BarResource = 'Delta-v' | 'Mass' | 'Time' | 'Budget'

export interface BarView {
  resource: BarResource
  status: BarStatus
  reason: string
}

export interface RideView {
  reach: Reach
  status: 'go' | 'caution' | 'nogo'
  statusLabel: 'GO FOR LAUNCH' | 'CAUTION' | 'NO GO'
  rows: BoardRow[]
  signs: TransferSign[]
  rideName: string
  path: {
    drop: DropKind
    dropLabel: string
    transferType: 'direct' | 'low_energy'
    spiral: boolean
    spiralLabel: string
    dots: number
    captureLabel: string
    blockedLabel: string | null
  }
  orbit: { colour: string; shortName: string }
  tank: {
    available: number
    propellantKg: number
    layers: TankLayer[]
    shortBy: number
    greyLabel: string | null
    scaleMax: number
  }
  timeline: {
    turns: number
    readyTurn: number
    rideTurn: number
    transferTurns: number | null
    arrivalTurn: number | null
    late: boolean
    direct: boolean
    showMapping: boolean
    flyPast: boolean
  }
  bars: BarView[]
  reasons: BarView[]
  payload: { mass: number; limit: number; over: boolean }
  costLine: string
}

export const MAX_DOTS = 24

const DROP_WORDS: Record<DropKind, string> = {
  gto: 'to Earth orbit (GTO)',
  'trans-lunar': 'to a path to the Moon',
  'lunar-vicinity': 'close to the Moon',
}

const DROP_LABEL: Record<DropKind, string> = {
  gto: 'DROP-OFF: EARTH ORBIT (GTO)',
  'trans-lunar': 'DROP-OFF: PATH TO THE MOON',
  'lunar-vicinity': 'DROP-OFF: CLOSE TO THE MOON',
}

const STATUS_LABEL: Record<Exclude<RowStatus, 'cantReach' | 'overBudget'>, string> = {
  wrongEngine: 'WRONG ENGINE',
  tooHeavy: 'TOO HEAVY',
  tooEarly: 'TOO EARLY',
  onTime: 'ON TIME',
}

const REACH_LABEL: Record<Exclude<Reach, 'ok'>, string> = {
  noWay: 'NO WAY THROUGH',
  noPower: 'NO POWER',
  flyPast: "CAN'T BRAKE",
}

const BAR_ORDER: BarResource[] = ['Delta-v', 'Mass', 'Time', 'Budget']

const LAYER_COLOUR = { climb: '#e8a33d', hold: '#b9b2a3', spare: '#6faf7a' }

function reachOf(b: Budgets): Reach {
  if (b.captureDeltaV === null) return 'noWay'
  if (b.transferTurns === null) return 'noPower'
  if (b.deltaVAvailable < b.captureDeltaV) return 'flyPast'
  return 'ok'
}

function engineType(design: Design): 'electric' | 'chemical' | 'cold-gas' {
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  return propulsion?.type ?? 'chemical'
}

function boardRow(design: Design, difficulty: Difficulty, ride: Ride, engine: string): BoardRow {
  const b = computeBudgets({ ...design, ride: ride.id }, difficulty)
  const wrongEngine = engine === 'electric' ? !ride.electricCompatible : !ride.chemicalCompatible
  const reach = reachOf(b)
  // The reserve line is a hard limit (the Budget check is red above what is spendable)
  const overBudget = b.totalCost > b.spendable
  const status: RowStatus = wrongEngine
    ? 'wrongEngine'
    : reach !== 'ok'
      ? 'cantReach'
      : b.massMargin < 0
        ? 'tooHeavy'
        : b.readyTurn > ride.departureTurn
          ? 'tooEarly'
          : overBudget
            ? 'overBudget'
            : 'onTime'
  const statusLabel =
    status === 'cantReach'
      ? REACH_LABEL[reach as Exclude<Reach, 'ok'>]
      : status === 'overBudget'
        ? b.totalCost <= b.budgetCap
          ? 'INTO THE RESERVE'
          : 'OVER BUDGET'
        : STATUS_LABEL[status]
  return {
    id: ride.id,
    name: ride.name.toUpperCase(),
    dropWords: DROP_WORDS[ride.dropOffOrbit],
    turn: ride.departureTurn,
    fee: ride.cost,
    limitKg: b.massLimit,
    burn: b.captureDeltaV,
    planCost: b.totalCost,
    overBudget,
    arrivalTurn: reach === 'ok' ? b.arrivalTurn : null,
    status,
    statusLabel,
    selected: design.ride === ride.id,
  }
}

const fin = (x: number) => (Number.isFinite(x) ? x : 0)

export function buildRideView(design: Design, difficulty: Difficulty, budgets: Budgets, checks: CheckResult[]): RideView {
  const b = budgets
  const reach = reachOf(b)
  const blocked = reach === 'noWay' || reach === 'noPower'
  const engine = engineType(design)
  const ride = getRideById(design.ride)
  const drop: DropKind = ride?.dropOffOrbit ?? 'trans-lunar'
  const transferType = transfers.find((t) => t.id === design.transfer)?.type ?? 'low_energy'
  const colour = orbitColour(design.orbit)
  const shortName = orbitShortName(design.orbit)

  // Board, in departure order, each row a what-if with that ride
  const rows = [...rides].sort((a, c) => a.departureTurn - c.departureTurn).map((r) => boardRow(design, difficulty, r, engine))

  // Transfer signs, low-energy first
  const signs: TransferSign[] = [...transfers]
    .sort((a, c) => Number(a.type !== 'low_energy') - Number(c.type !== 'low_energy'))
    .map((t) => {
      const selectable = isTransferCompatible(t, engine)
      const direct = t.type === 'direct'
      return {
        id: t.id,
        type: t.type,
        title: direct ? 'DIRECT TRANSFER' : 'LOW-ENERGY TRANSFER',
        sub: !selectable
          ? 'needs a chemical engine (Factory)'
          : direct
            ? `${transferDays(t)} days · one big braking burn`
            : 'months of coasting · small burn',
        selectable,
        selected: design.transfer === t.id,
      }
    })

  // Tank: what the journey takes of the delta-v on board
  const turns = lunarIceMapperBrief.missionDurationTurns
  const capture = fin(b.deltaVCapture)
  const climb = fin(b.deltaVTransfer)
  const hold = fin(b.deltaVStationKeeping) * turns
  const margin = fin(b.deltaVMargin)
  const layers: TankLayer[] = []
  if (!blocked) {
    if (climb > 0) layers.push({ key: 'climb', label: 'CLIMB OUT', value: climb, colour: LAYER_COLOUR.climb })
    layers.push({ key: 'capture', label: 'CAPTURE', value: capture, colour })
    layers.push({ key: 'hold', label: `HOLD ORBIT, ${turns} MONTHS`, value: hold, colour: LAYER_COLOUR.hold })
    if (margin >= 0) layers.push({ key: 'spare', label: 'SPARE', value: margin, colour: LAYER_COLOUR.spare })
  }
  const available = fin(b.deltaVAvailable)

  // Timeline
  const transferTurns = blocked ? null : b.transferTurns
  const arrivalTurn = blocked ? null : b.arrivalTurn
  const timeline = {
    turns: Math.max(28, (arrivalTurn ?? b.rideTurn) + 13),
    readyTurn: b.readyTurn,
    rideTurn: b.rideTurn,
    transferTurns,
    arrivalTurn,
    late: b.readyTurn > b.rideTurn,
    direct: transferTurns === 0,
    showMapping: reach === 'ok',
    flyPast: reach === 'flyPast',
  }

  // Bars and reasons
  const bars: BarView[] = BAR_ORDER.map((resource) => {
    const c = checks.find((x) => x.resource === resource)
    return { resource, status: c?.status ?? 'green', reason: c?.reason ?? '' }
  })
  const reasons = [...bars.filter((x) => x.status === 'red'), ...bars.filter((x) => x.status === 'yellow')].slice(0, 3)
  const status = bars.some((x) => x.status === 'red') ? 'nogo' : bars.some((x) => x.status === 'yellow') ? 'caution' : 'go'

  const blockedLabel =
    reach === 'noWay'
      ? 'NO WAY THROUGH'
      : reach === 'noPower'
        ? 'ENGINE HAS NO POWER'
        : reach === 'flyPast'
          ? 'CANNOT BRAKE · FLIES PAST THE MOON'
          : null

  return {
    reach,
    status,
    statusLabel: status === 'nogo' ? 'NO GO' : status === 'caution' ? 'CAUTION' : 'GO FOR LAUNCH',
    rows,
    signs,
    rideName: ride ? ride.name.toUpperCase() : '',
    path: {
      drop,
      dropLabel: DROP_LABEL[drop],
      transferType,
      spiral: drop === 'gto',
      spiralLabel: `ION SPIRAL OUT · +${climb.toLocaleString('en-US')} m/s`,
      dots: blocked ? 0 : Math.min(transferTurns ?? 0, MAX_DOTS),
      captureLabel: `${capture.toFixed(0)} m/s → ${shortName}`,
      blockedLabel,
    },
    orbit: { colour, shortName },
    tank: {
      available,
      propellantKg: b.propellantMass,
      layers,
      shortBy: blocked ? 0 : Math.max(0, -margin),
      greyLabel: reach === 'noWay' ? 'CANNOT GET THERE' : reach === 'noPower' ? 'ENGINE HAS NO POWER' : null,
      scaleMax: Math.max(available, fin(b.deltaVTotal), 1),
    },
    timeline,
    bars,
    reasons,
    payload: { mass: b.totalMass, limit: b.massLimit, over: b.totalMass > b.massLimit },
    costLine: `PLAN COST $${b.totalCost.toFixed(1)}M OF $${b.budgetCap}M`,
  }
}

/* ---------------- timeline ---------------- */

export interface TimelineBlock {
  key: 'design' | 'transit' | 'mapping'
  label: string
  from: number // share of the strip, 0..1
  to: number
}

export interface TimelineFlag {
  key: 'ready' | 'launch' | 'arrive'
  label: string
  at: number // share of the strip, 0..1
  tone: 'good' | 'bad' | 'plain' | 'orbit'
  side: 'above' | 'below'
}

/** Transits shorter than this put the arrival in the launch flag's label, so the two never overlap */
const JOIN_TURNS = 4

/**
 * Where the timeline's blocks and flags go. Turns are points on the strip
 * (turn t at t / turns), the same way the game counts the time margin
 * (ride turn minus ready turn).
 */
export function timelineLayout(t: RideView['timeline']): { blocks: TimelineBlock[]; flags: TimelineFlag[] } {
  const x = (turn: number) => Math.max(0, Math.min(1, turn / t.turns))
  const blocks: TimelineBlock[] = [{ key: 'design', label: 'DESIGN · BUILD · TEST', from: 0, to: x(t.readyTurn) }]
  const arrival = t.arrivalTurn
  if (arrival !== null && t.transferTurns !== null && t.transferTurns > 0) {
    const n = t.transferTurns
    blocks.push({ key: 'transit', label: `${n} MONTH${n === 1 ? '' : 'S'} IN TRANSIT`, from: x(t.rideTurn), to: x(arrival) })
  }
  if (t.showMapping && arrival !== null) blocks.push({ key: 'mapping', label: '12 MONTHS OF MAPPING', from: x(arrival), to: x(arrival + 12) })

  const flags: TimelineFlag[] = [
    { key: 'ready', label: `READY · MONTH ${t.readyTurn}`, at: x(t.readyTurn), tone: t.late ? 'bad' : 'good', side: 'below' },
  ]
  let launch = `LAUNCH · MONTH ${t.rideTurn}`
  const joined = arrival !== null && !t.direct && arrival - t.rideTurn < JOIN_TURNS
  if (t.direct && t.showMapping) launch += ' · AT THE MOON 5 DAYS LATER'
  else if (t.direct && t.flyPast) launch += ' · FLIES PAST THE MOON 5 DAYS LATER'
  else if (joined) launch += ` → ${t.flyPast ? 'FLIES PAST' : 'ARRIVE'} · MONTH ${arrival}`
  flags.push({ key: 'launch', label: launch, at: x(t.rideTurn), tone: 'plain', side: 'above' })
  if (arrival !== null && !t.direct)
    flags.push({
      key: 'arrive',
      label: joined ? '' : t.flyPast ? `FLIES PAST · MONTH ${arrival}` : `ARRIVE · MONTH ${arrival}`,
      at: x(arrival),
      tone: t.flyPast ? 'bad' : 'orbit',
      side: 'above',
    })
  return { blocks, flags }
}
