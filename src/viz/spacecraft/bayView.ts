import {
  getPartById,
  type Part,
  type PartCategory,
  type SolarPart,
  type BatteryPart,
  type ComputerPart,
  type AttitudePart,
  type PropulsionPart,
  type RadioPart,
} from '../../data/parts'
import type { Budgets, CheckResult, Design } from '../../sim/types'

/**
 * Everything the assembly bay draws, worked out from the design, the budgets
 * and the Go / No-Go checks. The scene and the plain fallback only read this,
 * so the picture cannot disagree with the numbers.
 */

export type Tone = 'green' | 'yellow' | 'red'

/** Frame height in scene units: 6 U stacked at 2 U per unit of height. */
export const FRAME_HEIGHT = 3
/** Blocks thinner than this volume get a call-out tag instead of a front label. */
export const CALLOUT_BELOW_U = 0.5

export interface StackBlock {
  key: string
  category: PartCategory
  partId: string
  name: string
  sub: string
  volume: number // U
  base: number // scene units from the floor of the box
  height: number // scene units (volume / 2)
  readOnly: boolean
  building?: string // where a read-only part is chosen
  overLimit: boolean // any of it sits above the 6 U line
  callout: boolean
  detail: number // battery cells (1, 2, 4) or computer boards (1, 2); 0 otherwise
}

export type RowKey = 'mass' | 'volume' | 'power' | 'money' | 'deltav' | 'time'

export interface BoardRow {
  key: RowKey
  title: string
  text: string
  value: number // drawn against limit on the bar
  limit: number
  tone: Tone
  reason: string
}

export interface BayOutside {
  solar: 'body' | 'wings' | 'array' | 'none'
  starTracker: boolean
  radio: 'whip' | 'patch' | 'dish' | 'none'
  engine: 'cold' | 'chemical' | 'ion' | 'none'
  propellantKg: number
  powerShort: boolean // the array cannot feed the instruments at all
  engineStarved: boolean // an ion engine gets less than it needs to run
}

export interface BayView {
  title: string
  stack: StackBlock[]
  usedU: number
  limitU: number
  rows: BoardRow[]
  partsCost: number
  status: { tone: Tone; title: string; lines: string }
  massText: string
  massTone: Tone
  outside: BayOutside
  worst: Tone
}

export const BAY_TITLE = 'FACTORY · LUNAR ICE MAPPER · SPACECRAFT'

const ROWS: Array<{ key: RowKey; title: string; check: string }> = [
  { key: 'mass', title: 'MASS, FUELLED', check: 'Mass' },
  { key: 'volume', title: 'VOLUME IN THE BOX', check: 'Volume' },
  { key: 'power', title: 'POWER IN SUNLIGHT', check: 'Power' },
  { key: 'money', title: 'MONEY', check: 'Budget' },
  { key: 'deltav', title: 'TO THE MOON', check: 'Delta-v' },
  { key: 'time', title: 'BUILD TIME', check: 'Time' },
]

const fin = (x: number) => (Number.isFinite(x) ? x : 0)
const fixed = (x: number, d = 1) => fin(x).toFixed(d)

function sub(part: Part, budgets: Budgets): string {
  switch (part.category) {
    case 'propulsion':
      return `${(part as PropulsionPart).propellantMass} kg propellant`
    case 'battery':
      return `${(part as BatteryPart).capacity} Wh`
    case 'computer':
      return `${(part as ComputerPart).storage} MB`
    case 'attitude':
      return `pointing ${(part as AttitudePart).pointingAccuracy}°`
    default:
      return budgets ? '' : ''
  }
}

function buildStack(design: Design, budgets: Budgets, limitU: number): StackBlock[] {
  const entries: Array<{ category: PartCategory; id: string; key: string; building?: string }> = [
    { category: 'propulsion', id: design.propulsion, key: 'propulsion' },
    ...design.instruments.map((id, i) => ({ category: 'instrument' as const, id, key: `instrument-${i}`, building: 'Research Lab' })),
    { category: 'radio', id: design.radio, key: 'radio', building: 'Communications Center' },
    { category: 'attitude', id: design.attitude, key: 'attitude' },
    { category: 'computer', id: design.computer, key: 'computer' },
    { category: 'battery', id: design.battery, key: 'battery' },
  ]
  const stack: StackBlock[] = []
  let base = 0
  for (const e of entries) {
    const part = getPartById(e.id)
    if (!part || part.category !== e.category || !(part.volume > 0)) continue
    const height = part.volume / 2
    const readOnly = e.building !== undefined
    let detail = 0
    if (part.category === 'battery') detail = Math.max(1, Math.round((part as BatteryPart).capacity / 20))
    if (part.category === 'computer') detail = (part as ComputerPart).redundant ? 2 : 1
    stack.push({
      key: e.key,
      category: e.category,
      partId: part.id,
      name: part.name,
      sub: readOnly ? `chosen at the ${e.building}` : sub(part, budgets),
      volume: part.volume,
      base,
      height,
      readOnly,
      building: e.building,
      overLimit: base + height > (limitU / 2) + 1e-9,
      callout: part.volume < CALLOUT_BELOW_U,
      detail,
    })
    base += height
  }
  return stack
}

function rowText(key: RowKey, b: Budgets, check: CheckResult | undefined): { text: string; value: number; limit: number } {
  switch (key) {
    case 'mass':
      return { text: `${fixed(b.totalMass)} / ${fin(b.massLimit)} kg`, value: fin(b.totalMass), limit: fin(b.massLimit) }
    case 'volume':
      return { text: `${fixed(b.totalVolume)} / ${fin(b.volumeLimit)} U`, value: fin(b.totalVolume), limit: fin(b.volumeLimit) }
    case 'power':
      return {
        text: `uses ${Math.round(fin(b.powerConsumed))} of ${Math.round(fin(b.powerGenerated))} W`,
        value: fin(b.powerConsumed),
        limit: fin(b.powerGenerated),
      }
    case 'money':
      return { text: `$${fixed(b.totalCost)}M of $${fin(b.budgetCap)}M`, value: fin(b.totalCost), limit: fin(b.budgetCap) }
    case 'deltav': {
      const need = fin(check?.value ?? 0)
      if (b.captureDeltaV === null || b.deltaVAvailable <= 0)
        return { text: 'cannot get there', value: Math.max(1, need), limit: 0 }
      return { text: `needs ${Math.round(need)}, has ${Math.round(fin(b.deltaVAvailable))} m/s`, value: need, limit: fin(b.deltaVAvailable) }
    }
    case 'time':
      return {
        text: `${fin(b.buildTurns)} months · ready month ${fin(b.readyTurn)}, ride month ${fin(b.rideTurn)}`,
        value: fin(b.readyTurn),
        limit: fin(b.rideTurn),
      }
  }
}

function outside(design: Design, b: Budgets): BayOutside {
  const solar = getPartById(design.solar) as SolarPart | undefined
  const radio = getPartById(design.radio) as RadioPart | undefined
  const attitude = getPartById(design.attitude) as AttitudePart | undefined
  const prop = getPartById(design.propulsion) as PropulsionPart | undefined
  const okSolar = solar?.category === 'solar'
  const okRadio = radio?.category === 'radio'
  const okProp = prop?.category === 'propulsion'
  return {
    solar: !okSolar ? 'none' : !solar.deployable ? 'body' : solar.powerGeneration >= 100 ? 'array' : 'wings',
    starTracker: attitude?.category === 'attitude' && attitude.hasStarTracker,
    radio: !okRadio ? 'none' : !radio.reachesMoon ? 'whip' : radio.deployable ? 'dish' : 'patch',
    engine: !okProp ? 'none' : prop.type === 'electric' ? 'ion' : prop.type === 'chemical' ? 'chemical' : 'cold',
    propellantKg: okProp ? prop.propellantMass : 0,
    powerShort: fin(b.scienceDuty) <= 0,
    engineStarved: okProp && prop.type === 'electric' && fin(b.thrustLevel) === 0,
  }
}

export function buildBayView(design: Design, budgets: Budgets, checks: CheckResult[]): BayView {
  const limitU = fin(budgets.volumeLimit) || 6
  const stack = buildStack(design, budgets, limitU)
  const rows: BoardRow[] = ROWS.map((r) => {
    const check = checks.find((c) => c.resource === r.check)
    return { key: r.key, title: r.title, tone: (check?.status ?? 'green') as Tone, reason: check?.reason ?? '', ...rowText(r.key, budgets, check) }
  })
  const firstRed = rows.find((r) => r.tone === 'red')
  const firstYellow = rows.find((r) => r.tone === 'yellow')
  const pick = firstRed ?? firstYellow
  const status = pick
    ? { tone: pick.tone, title: pick.title, lines: `${pick.title}: ${pick.reason}` }
    : { tone: 'green' as Tone, title: 'FITS', lines: 'FITS. READY FOR THE NEXT BUILDING.' }
  const mass = rows[0]
  return {
    title: BAY_TITLE,
    stack,
    usedU: fin(budgets.totalVolume),
    limitU,
    rows,
    partsCost: fin(budgets.partsCost),
    status,
    massText: `${fixed(budgets.totalMass)} kg`,
    massTone: mass.tone,
    outside: outside(design, budgets),
    worst: firstRed ? 'red' : firstYellow ? 'yellow' : 'green',
  }
}
