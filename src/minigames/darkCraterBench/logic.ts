import { instruments, type InstrumentPart } from '../../data/parts'
import type { Insight } from '../contract'

/**
 * Dark Crater Bench: the pure model. A tabletop crater, a lamp for the Sun, hidden ice, and four
 * instruments that each see (or do not see) it in their own way. Mass, power, data rate and cost
 * come from src/data/parts.ts; only the bench-scale footprints and dwell times live here.
 */

/** Cells per side of the bench; vertices are (GRID + 1)^2 */
export const GRID = 48
/** The bench's side, in scene units (x and z run -SIZE/2 .. SIZE/2) */
export const SIZE = 2
export const VERTS = (GRID + 1) * (GRID + 1)
/** The lamp's fixed elevation: low, like the polar Sun */
export const LAMP_ELEVATION_DEG = 12
const TAN_ELEV = Math.tan((LAMP_ELEVATION_DEG * Math.PI) / 180)
/** The classic Instruments screen holds at most two (stageModel.ts MAX_INSTRUMENTS, not exported) */
export const MAX_INSTRUMENTS_ABOARD = 2

interface Crater {
  x: number
  z: number
  R: number
  d: number
}
const CRATERS: Crater[] = [
  { x: 0, z: 0.05, R: 0.6, d: 0.26 },
  { x: -0.62, z: -0.55, R: 0.28, d: 0.14 },
  { x: 0.65, z: 0.55, R: 0.24, d: 0.12 },
]

/** Ground height at a bench point */
export function heightAt(x: number, z: number): number {
  let h = 0.012 * Math.sin(x * 5.3) * Math.cos(z * 4.1)
  for (const c of CRATERS) {
    const r = Math.hypot(x - c.x, z - c.z) / c.R
    if (r < 1) h -= c.d * (1 - r * r)
    h += 0.2 * c.d * Math.exp(-(((r - 1.05) / 0.25) ** 2))
  }
  return h
}

interface Patch {
  x: number
  z: number
  r: number
}
/** Hidden ice: three on crater floors (never lit), two out on open ground */
const PATCHES: Patch[] = [
  { x: 0.02, z: 0.08, r: 0.17 },
  { x: 0.2, z: -0.05, r: 0.09 },
  { x: -0.62, z: -0.55, r: 0.1 },
  { x: 0.7, z: -0.5, r: 0.14 },
  { x: -0.72, z: 0.6, r: 0.12 },
]
/** How far the neutron spectrometer's hydrogen signal bleeds out of a patch */
const BLUR = 0.16

export interface Bench {
  px: Float32Array
  pz: Float32Array
  py: Float32Array
  nx: Float32Array
  ny: Float32Array
  nz: Float32Array
  /** 1 where there is ice under the ground */
  ice: Uint8Array
  /** 1 where the ground is in shadow from every lamp position */
  psr: Uint8Array
  /** Hydrogen signal 0..1: the ice blurred out */
  hydrogen: Float32Array
  iceCount: number
  psrIceCount: number
}

const vIndex = (i: number, j: number) => j * (GRID + 1) + i

function lampDir(az: number): [number, number] {
  return [Math.cos(az), Math.sin(az)]
}

/** Shadow test for one ground point against one lamp azimuth: march toward the lamp and see if the ground rises above the ray */
export function inShadow(x: number, z: number, az: number): boolean {
  const [dx, dz] = lampDir(az)
  const h0 = heightAt(x, z)
  for (let t = 0.03; t < 2.4; t += 0.03) {
    if (heightAt(x + dx * t, z + dz * t) > h0 + t * TAN_ELEV + 0.002) return true
  }
  return false
}

export function buildBench(): Bench {
  const px = new Float32Array(VERTS)
  const pz = new Float32Array(VERTS)
  const py = new Float32Array(VERTS)
  const nx = new Float32Array(VERTS)
  const ny = new Float32Array(VERTS)
  const nz = new Float32Array(VERTS)
  const ice = new Uint8Array(VERTS)
  const psr = new Uint8Array(VERTS)
  const hydrogen = new Float32Array(VERTS)
  const e = 0.01
  let iceCount = 0
  let psrIceCount = 0
  const AZ = Array.from({ length: 12 }, (_, k) => (k / 12) * Math.PI * 2)
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      const v = vIndex(i, j)
      const x = (i / GRID - 0.5) * SIZE
      const z = (j / GRID - 0.5) * SIZE
      px[v] = x
      pz[v] = z
      py[v] = heightAt(x, z)
      const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e)
      const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e)
      const len = Math.hypot(gx, 1, gz)
      nx[v] = -gx / len
      ny[v] = 1 / len
      nz[v] = -gz / len
      let s = 0
      let hy = 0
      for (const p of PATCHES) {
        const d = Math.hypot(x - p.x, z - p.z)
        if (d <= p.r) s = 1
        hy = Math.max(hy, Math.exp(-(Math.max(0, d - p.r) ** 2) / (2 * BLUR * BLUR)))
      }
      ice[v] = s
      hydrogen[v] = hy
      psr[v] = AZ.every((a) => inShadow(x, z, a)) ? 1 : 0
      if (s) {
        iceCount++
        if (psr[v]) psrIceCount++
      }
    }
  }
  return { px, pz, py, nx, ny, nz, ice, psr, hydrogen, iceCount, psrIceCount }
}

/** 1 where the lamp reaches the ground at this azimuth */
export function litMap(b: Bench, az: number): Uint8Array {
  const out = new Uint8Array(VERTS)
  for (let v = 0; v < VERTS; v++) out[v] = b.psr[v] ? 0 : inShadow(b.px[v], b.pz[v], az) ? 0 : 1
  return out
}

/** Baked brightness 0..1 of the ground: slant of the light where lit, almost black in shadow */
export function brightness(b: Bench, lit: Uint8Array, v: number, az: number): number {
  if (!lit[v]) return 0.04
  const [dx, dz] = lampDir(az)
  const c = Math.cos((LAMP_ELEVATION_DEG * Math.PI) / 180)
  const s = Math.sin((LAMP_ELEVATION_DEG * Math.PI) / 180)
  const nd = b.nx[v] * dx * c + b.ny[v] * s + b.nz[v] * dz * c
  return 0.22 + 0.55 * Math.max(0, Math.min(1, nd * 1.6))
}

/* ---------------------------------------------------------------- instruments */

export interface Scanner {
  id: string
  /** Footprint radius on the bench, scene units */
  radius: number
  /** Seconds a cell must stay in the footprint before the instrument can tell */
  needS: number
  /** Fastest sweep, scene units per second, before the reading smears out */
  speedMax: number
  /** Needs the lamp's light on the ground (reflected sunlight) */
  needsLight: boolean
  /** 'surface': sees ice on the ground; 'hydrogen': sees hydrogen through rock, as a blur */
  sees: 'surface' | 'hydrogen'
}

/**
 * Bench behaviour per instrument, set against src/data/parts.ts: the camera and IR spectrometer have
 * seesShadow false (need light); the laser and neutron spectrometer have seesShadow true.
 */
export const SCANNERS: Record<string, Scanner> = {
  'inst-camera': { id: 'inst-camera', radius: 0.2, needS: 0.15, speedMax: 4, needsLight: true, sees: 'surface' },
  'inst-ir-spec': { id: 'inst-ir-spec', radius: 0.11, needS: 0.3, speedMax: 1.4, needsLight: true, sees: 'surface' },
  'inst-laser': { id: 'inst-laser', radius: 0.08, needS: 0.4, speedMax: 0.32, needsLight: false, sees: 'surface' },
  'inst-neutron': { id: 'inst-neutron', radius: 0.3, needS: 0.5, speedMax: 2, needsLight: false, sees: 'hydrogen' },
}

export const INSTRUMENT_IDS = ['inst-camera', 'inst-ir-spec', 'inst-laser', 'inst-neutron'] as const

/** Hydrogen level above which the neutron spectrometer calls a spot ice */
const HYDROGEN_CALL = 0.3

export function getInstrument(id: string): InstrumentPart {
  const p = instruments.find((i) => i.id === id)
  if (!p) throw new Error(`unknown instrument ${id}`)
  return p
}

export interface ScanState {
  dwell: Float32Array
  /** 1 where the instrument has looked long enough to tell */
  looked: Uint8Array
  /** 1 where it reports ice */
  found: Uint8Array
  /** Seconds spent actively scanning */
  seconds: number
}

export function newScan(): ScanState {
  return { dwell: new Float32Array(VERTS), looked: new Uint8Array(VERTS), found: new Uint8Array(VERTS), seconds: 0 }
}

export interface StepResult {
  /** The footprint is on the bench */
  active: boolean
  tooFast: boolean
}

/** One frame of scanning at bench point (x, z). Mutates `state`. */
export function scanStep(b: Bench, lit: Uint8Array, spec: Scanner, state: ScanState, x: number, z: number, dt: number, speed: number): StepResult {
  const half = SIZE / 2
  if (Math.abs(x) > half + spec.radius || Math.abs(z) > half + spec.radius) return { active: false, tooFast: false }
  if (speed > spec.speedMax) return { active: true, tooFast: true }
  state.seconds += dt
  const r = spec.radius
  const i0 = Math.max(0, Math.floor(((x - r) / SIZE + 0.5) * GRID))
  const i1 = Math.min(GRID, Math.ceil(((x + r) / SIZE + 0.5) * GRID))
  const j0 = Math.max(0, Math.floor(((z - r) / SIZE + 0.5) * GRID))
  const j1 = Math.min(GRID, Math.ceil(((z + r) / SIZE + 0.5) * GRID))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const v = vIndex(i, j)
      if (Math.hypot(b.px[v] - x, b.pz[v] - z) > r) continue
      state.dwell[v] += dt
      if (state.dwell[v] < spec.needS) continue
      // a light-hungry instrument re-checks each frame: it only counts once light reaches the cell
      if (spec.needsLight && lit[v] !== 1) continue
      state.looked[v] = 1
      if (spec.sees === 'surface' ? b.ice[v] === 1 : b.hydrogen[v] >= HYDROGEN_CALL) state.found[v] = 1
    }
  }
  return { active: true, tooFast: false }
}

export interface FoundStats {
  /** % of all the ice reported */
  icePct: number
  /** % of the permanently shadowed ice reported */
  shadowPct: number
}

export function foundStats(b: Bench, state: ScanState): FoundStats {
  let all = 0
  let dark = 0
  for (let v = 0; v < VERTS; v++) {
    if (!b.ice[v] || !state.found[v]) continue
    all++
    if (b.psr[v]) dark++
  }
  return { icePct: Math.round((all / b.iceCount) * 100), shadowPct: Math.round((dark / b.psrIceCount) * 100) }
}

/* ---------------------------------------------------------------- readouts */

/** The reel runs at the instrument's data rate: a full reel is 12 s of the busiest instrument (the camera) */
export function reelFill(inst: InstrumentPart, scanSeconds: number): number {
  const busiest = Math.max(...instruments.map((i) => i.dataPerTurn))
  return Math.min(1, (inst.dataPerTurn / busiest) * (scanSeconds / 12))
}

/** The power needle: draw in watts against the hungriest instrument (the laser) */
export function powerNeedle(inst: InstrumentPart): number {
  const hungriest = Math.max(...instruments.map((i) => -i.power))
  return -inst.power / hungriest
}

/* ---------------------------------------------------------------- the payload tray */

export interface TrayCheck {
  ok: boolean
  /** Why the tray is over a limit; empty when fine */
  reason: string
  mass: number
  cost: number
  volume: number
}

/** The classic Instruments screen holds at most two; the box holds the brief's volume and mass. */
export function trayCheck(ids: string[], maxVolume = 6, maxMass = 14): TrayCheck {
  const parts = ids.map(getInstrument)
  const mass = parts.reduce((s, p) => s + p.mass, 0)
  const cost = parts.reduce((s, p) => s + p.cost, 0)
  const volume = parts.reduce((s, p) => s + p.volume, 0)
  let reason = ''
  if (ids.length > MAX_INSTRUMENTS_ABOARD) reason = `The tray holds ${MAX_INSTRUMENTS_ABOARD} instruments at most.`
  else if (volume > maxVolume) reason = `These need ${volume.toFixed(1)} U but the box holds ${maxVolume} U.`
  else if (mass > maxMass) reason = `These weigh ${mass.toFixed(1)} kg; the craft limit is ${maxMass} kg.`
  return { ok: reason === '', reason, mass, cost, volume }
}

/** Put an instrument in the tray; a full tray refuses (returns the same list) */
export function addToTray(ids: string[], id: string): string[] {
  if (ids.includes(id) || ids.length >= MAX_INSTRUMENTS_ABOARD) return ids
  return [...ids, id]
}

/* ---------------------------------------------------------------- result */

const SHORT: Record<string, string> = {
  'inst-camera': 'camera',
  'inst-ir-spec': 'IR spectrometer',
  'inst-laser': 'laser reflectometer',
  'inst-neutron': 'neutron spectrometer',
}
export const shortName = (id: string) => SHORT[id] ?? id

/** One insight per instrument that was actually used (at least 1.5 s of scanning) */
export function buildInsights(b: Bench, scans: Record<string, ScanState>): Insight[] {
  const out: Insight[] = []
  for (const id of INSTRUMENT_IDS) {
    const state = scans[id]
    if (!state || state.seconds < 1.5) continue
    const inst = getInstrument(id)
    const { shadowPct, icePct } = foundStats(b, state)
    const w = -inst.power
    let text: string
    if (inst.seesShadow && shadowPct > 0) text = `The ${shortName(id)} found ${shadowPct}% of the ice in the permanent shadow while drawing ${w} W.`
    else if (inst.seesShadow) text = `The ${shortName(id)} had not reached the dark craters yet: it found none of the shadowed ice.`
    else if (icePct > 0) text = `The ${shortName(id)} found ice only where the lamp reached, and none in the permanent shadow.`
    else text = `The ${shortName(id)} found no ice in the dark: it needs light to see.`
    out.push({ id: `bench-${id}`, room: 'science-lab', text, metric: { label: 'ice found in shadow', value: shadowPct, unit: '%' } })
  }
  return out
}

export function buildResult(b: Bench, tray: string[], scans: Record<string, ScanState>, durationS: number) {
  return { patch: { instruments: [...tray] }, insights: buildInsights(b, scans), durationS }
}
