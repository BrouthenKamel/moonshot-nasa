import { getPartById, type RadioPart, type PropulsionPart } from '../../data/parts'
import type { Budgets, Design } from '../../sim/types'
import type { Insight } from '../contract'

/**
 * Pack the 6U + Wire the Bus: the pure rules. No React, no three.
 *
 * Volume: `parts.ts` already gives every part a volume in U (battery 0.1-0.3, radio 0.2-1.2,
 * computer 0.2-0.3, attitude 0.3-0.5, propulsion 0.6-2.9, instruments 0.3-2.0). Solar is 0 U
 * (cells and wings sit on the outside of the box) so it has its own rail, not a place in the frame.
 *
 * The frame is a 2 x 3 grid of 1 U cells (10 x 20 x 30 cm). A part needs k = ceil(volume) cells
 * and takes a slab of volume/k of each cell's height, like a PC/104 board stack. Footprints are
 * rectangles: 1 cell; a pair across or along the frame; a whole column of three. A part sits on top of
 * whatever is already in the cells it covers, so a part that covers two cells wastes the air under it
 * where the neighbours differ: that is the packing puzzle.
 */

export const COLS = 2
export const ROWS = 3
export const CELLS = COLS * ROWS
const EPS = 1e-6

export const FAMILIES = ['battery', 'radio', 'computer', 'attitude', 'propulsion'] as const
export type Family = (typeof FAMILIES)[number]
export const OPTIONS: Record<Family | 'solar', string[]> = {
  solar: ['solar-body', 'solar-1wing', 'solar-2wing'],
  battery: ['battery-small', 'battery-medium', 'battery-large'],
  radio: ['radio-uhf', 'radio-sband', 'radio-xband'],
  computer: ['computer-basic', 'computer-redundant'],
  attitude: ['attitude-basic', 'attitude-precision'],
  propulsion: ['prop-coldgas', 'prop-chemical', 'prop-chemical-large', 'prop-ion', 'prop-ion-large'],
}

/** The six design fields this mini game owns */
export type Choice = Pick<Design, 'solar' | 'battery' | 'radio' | 'computer' | 'attitude' | 'propulsion'>
export const CHOICE_KEYS: Array<keyof Choice> = ['solar', 'battery', 'radio', 'computer', 'attitude', 'propulsion']

export function choiceOf(design: Design): Choice {
  return { solar: design.solar, battery: design.battery, radio: design.radio, computer: design.computer, attitude: design.attitude, propulsion: design.propulsion }
}

/** What a placement is: a catalogue part in a rectangle of cells */
export interface Placement {
  /** Part id */
  id: string
  family: Family | 'instrument'
  /** Bottom-left cell (row 0 is the bottom of the frame) */
  col: number
  row: number
  /** Cells wide and tall */
  w: number
  h: number
  /** Slab thickness in U (fraction of a cell's depth) */
  share: number
  /** Where the slab's floor sits above the cell floor, in U */
  off: number
  /** Instruments were chosen in the Science Lab: they are in the frame to stay */
  locked: boolean
}

export function volumeOf(id: string): number {
  return getPartById(id)?.volume ?? 0
}

export const cellsNeeded = (volume: number) => Math.max(1, Math.ceil(volume - EPS))

/** Rectangles of k cells that fit a 2 x 3 frame (w across, h along) */
export function shapesFor(k: number): Array<{ w: number; h: number }> {
  if (k === 1) return [{ w: 1, h: 1 }]
  if (k === 2) return [{ w: 2, h: 1 }, { w: 1, h: 2 }]
  if (k === 3) return [{ w: 1, h: 3 }]
  return []
}

const covers = (p: Pick<Placement, 'col' | 'row' | 'w' | 'h'>, col: number, row: number) =>
  col >= p.col && col < p.col + p.w && row >= p.row && row < p.row + p.h

/** Depth used so far in each cell (0..1), row-major */
export function cellTops(placements: Placement[]): number[] {
  const tops = new Array<number>(CELLS).fill(0)
  for (const p of placements)
    for (let r = p.row; r < p.row + p.h; r++)
      for (let c = p.col; c < p.col + p.w; c++) tops[r * COLS + c] = Math.max(tops[r * COLS + c], p.off + p.share)
  return tops
}

/** Total U taken by the parts in the frame */
export const usedU = (placements: Placement[]) => placements.reduce((s, p) => s + volumeOf(p.id), 0)

export interface PartSpec {
  id: string
  family: Placement['family']
  locked?: boolean
}

export type PlaceResult = { ok: true; placements: Placement[] } | { ok: false; reason: string }

/**
 * Put a part in the frame. With `target` the footprint must cover that cell (the cell the player
 * dropped on); without it the lowest free slot anywhere wins. A part of the same family already in
 * the frame is taken out first (a swap), and stays if the new one does not fit.
 */
export function tryPlace(placements: Placement[], part: PartSpec, target?: { col: number; row: number }): PlaceResult {
  const vol = volumeOf(part.id)
  const rest = placements.filter((p) => !(part.family !== 'instrument' && p.family === part.family))
  if (!(vol > 0)) return { ok: true, placements: rest }
  const free = CELLS - usedU(rest)
  if (vol > free + EPS) return { ok: false, reason: `Does not fit: ${(vol - free).toFixed(1)} U short` }
  const k = cellsNeeded(vol)
  const share = vol / k
  const tops = cellTops(rest)
  let best: Placement | null = null
  let bestScore = Infinity
  for (const { w, h } of shapesFor(k)) {
    for (let row = 0; row + h <= ROWS; row++) {
      for (let col = 0; col + w <= COLS; col++) {
        if (target && !covers({ col, row, w, h }, target.col, target.row)) continue
        let off = 0
        for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) off = Math.max(off, tops[r * COLS + c])
        if (off + share > 1 + EPS) continue
        // the lowest stack first; near the drop cell as the tie-break
        const score = off * 10 + (target ? Math.abs(col - target.col) + Math.abs(row - target.row) : row * 0.01 + col * 0.001)
        if (score < bestScore) {
          bestScore = score
          best = { id: part.id, family: part.family, col, row, w, h, share, off, locked: !!part.locked }
        }
      }
    }
  }
  if (!best) return { ok: false, reason: target ? 'No gap that shape there: try another cell' : 'No gap that shape' }
  return { ok: true, placements: [...rest, best] }
}

/** Pack a whole design: the biggest part first (instruments are fixed, they were chosen in the lab) */
export function autoPack(design: Design, choice: Choice): { placements: Placement[]; unplaced: string[] } {
  let placements: Placement[] = []
  const unplaced: string[] = []
  const specs: PartSpec[] = [
    ...design.instruments.map((id): PartSpec => ({ id, family: 'instrument', locked: true })),
    ...FAMILIES.map((f): PartSpec => ({ id: choice[f], family: f })),
  ].sort((a, b) => volumeOf(b.id) - volumeOf(a.id))
  for (const s of specs) {
    const r = tryPlace(placements, s)
    if (r.ok) placements = r.placements
    else unplaced.push(s.id)
  }
  return { placements, unplaced }
}

/** Every family choice that takes volume is in the frame (solar is on its rail, so it is always in) */
export function allPacked(placements: Placement[], choice: Choice): boolean {
  const ids = new Set(placements.map((p) => p.id))
  return FAMILIES.every((f) => !(volumeOf(choice[f]) > 0) || ids.has(choice[f]))
}

/**
 * The slab's centre and size in U. The frame lies as a tray seen from above: x across (cols), z along
 * (rows, row 0 at the back), y is the stack height. Centred on the origin in x and z, floor at y = 0.
 */
export function slabBox(p: Placement): { centre: [number, number, number]; size: [number, number, number] } {
  return {
    centre: [p.col + p.w / 2 - COLS / 2, p.off + p.share / 2, p.row + p.h / 2 - ROWS / 2],
    size: [p.w, p.share, p.h],
  }
}

/** Centre of one cell, same frame as `slabBox` */
export const cellCentre = (col: number, row: number): [number, number, number] => [col + 0.5 - COLS / 2, 0.5, row + 0.5 - ROWS / 2]

/* ---------------- delta-v ruler ---------------- */

export interface DeltaVGauge {
  /** m/s the orbit and transfer need (capture plus station keeping over the mission) */
  need: number
  /** m/s this tank gives */
  have: number
  status: 'ok' | 'tight' | 'short' | 'noroute'
}

export function deltaVGauge(b: Budgets): DeltaVGauge {
  if (b.captureDeltaV === null) return { need: 0, have: b.deltaVAvailable, status: 'noroute' }
  const need = b.deltaVTotal
  const have = b.deltaVAvailable
  const status = have < need ? 'short' : have < need * 1.15 ? 'tight' : 'ok'
  return { need, have, status }
}

/* ---------------- wiring ---------------- */

export interface Load {
  /** Node id: 'bus', 'radio', 'computer', 'attitude', 'propulsion' or an instrument part id */
  id: string
  label: string
  /** Watts drawn on the bus (the figures `computeBudgets` adds up) */
  draw: number
  /** Plain-English line for the inspect view */
  note: string
}

/** Everything the battery can feed. `bus` is the frame's survival heater: it is always on. */
export function loadsOf(design: Design, choice: Choice): Load[] {
  const out: Load[] = []
  const structure = getPartById(design.structure)
  out.push({ id: 'bus', label: 'Heater', draw: structure ? Math.max(0, -structure.power) : 0, note: 'Keeps the batteries warm when the Sun is gone.' })
  const radio = getPartById(choice.radio) as RadioPart | undefined
  out.push({ id: 'radio', label: 'Radio', draw: radio?.listenPower ?? 0, note: 'Listens for the ground all day; talking costs more.' })
  const comp = getPartById(choice.computer)
  out.push({ id: 'computer', label: 'Computer', draw: Math.max(0, -(comp?.power ?? 0)), note: 'The brain: it never sleeps.' })
  const att = getPartById(choice.attitude)
  out.push({ id: 'attitude', label: 'Pointing', draw: Math.max(0, -(att?.power ?? 0)), note: 'Wheels and a star tracker keep the instruments aimed.' })
  const prop = getPartById(choice.propulsion) as PropulsionPart | undefined
  out.push({
    id: 'propulsion',
    label: 'Engine',
    draw: 0,
    note: prop && !prop.impulsive ? 'An ion engine only draws power while it burns.' : 'Valves only: it draws almost nothing.',
  })
  for (const id of design.instruments) {
    const inst = getPartById(id)
    out.push({ id, label: inst?.name.split(' (')[0] ?? id, draw: Math.abs(inst?.power ?? 0), note: 'Your science, and the hungriest thing on the bus.' })
  }
  return out
}

export interface Wire {
  from: string
  to: string
}

/** Cables only run solar -> battery and battery -> load */
export function wireValid(from: string, to: string, loadIds: string[]): boolean {
  if (from === 'solar') return to === 'battery'
  if (from === 'battery') return loadIds.includes(to)
  return false
}

export function addWire(wires: Wire[], from: string, to: string, loadIds: string[]): Wire[] {
  if (!wireValid(from, to, loadIds)) return wires
  if (wires.some((w) => w.from === from && w.to === to)) return wires
  return [...wires, { from, to }]
}

export const removeWire = (wires: Wire[], from: string, to: string): Wire[] => wires.filter((w) => !(w.from === from && w.to === to))

export interface WiringState {
  solarLinked: boolean
  /** Loads that are fed: the array feeds the battery and the battery has a cable to them */
  powered: string[]
  unpowered: string[]
  /** Watts generated, drawn by the fed loads, and the shortfall (>= 0) */
  generated: number
  load: number
  shortfall: number
  /** Everything is wired, so the whole bus is judged */
  complete: boolean
}

export function wiringState(wires: Wire[], loads: Load[], generated: number): WiringState {
  const loadIds = loads.map((l) => l.id)
  const solarLinked = wires.some((w) => w.from === 'solar' && w.to === 'battery')
  const fed = wires.filter((w) => w.from === 'battery' && loadIds.includes(w.to)).map((w) => w.to)
  const powered = solarLinked ? loadIds.filter((id) => fed.includes(id)) : []
  const load = loads.filter((l) => powered.includes(l.id)).reduce((s, l) => s + l.draw, 0)
  const gen = solarLinked ? generated : 0
  return {
    solarLinked,
    powered,
    unpowered: loadIds.filter((id) => !powered.includes(id)),
    generated: gen,
    load,
    shortfall: Math.max(0, load - gen),
    complete: solarLinked && powered.length === loadIds.length,
  }
}

/** The whole bus wired: used for tests */
export function fullWiring(loads: Load[]): Wire[] {
  return [{ from: 'solar', to: 'battery' }, ...loads.map((l) => ({ from: 'battery', to: l.id }))]
}

/* ---------------- result ---------------- */

export function buildInsights(b: Budgets): Insight[] {
  const gauge = deltaVGauge(b)
  return [
    {
      id: 'power-margin',
      room: 'clean-room',
      text:
        b.powerMargin >= 0
          ? `Wired and running: the array made ${b.powerGenerated.toFixed(0)} W against ${b.powerConsumed.toFixed(0)} W of load, ${b.powerMargin.toFixed(0)} W to spare.`
          : `Wired, but the bus browned out: ${b.powerConsumed.toFixed(0)} W of load on ${b.powerGenerated.toFixed(0)} W of sunlight.`,
      metric: { label: 'Power margin', value: Math.round(b.powerMargin * 10) / 10, unit: 'W' },
    },
    {
      id: 'mass-margin',
      room: 'clean-room',
      text: `The packed craft weighs ${b.totalMass.toFixed(1)} kg with its fuel; the ride takes ${b.massLimit} kg.`,
      metric: { label: 'Mass margin', value: Math.round(b.massMargin * 10) / 10, unit: 'kg' },
    },
    {
      id: 'delta-v-margin',
      room: 'clean-room',
      text:
        gauge.status === 'noroute'
          ? 'This engine cannot get into the chosen orbit at all.'
          : `The tank holds ${gauge.have.toFixed(0)} m/s of Δv; the trip from Earth into orbit needs ${gauge.need.toFixed(0)}.`,
      metric: { label: 'Δv margin', value: Math.round(gauge.have - gauge.need), unit: 'm/s' },
    },
  ]
}

export function buildPatch(choice: Choice): Partial<Design> {
  return { ...choice }
}
