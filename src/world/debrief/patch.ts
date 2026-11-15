import type { Design, Report } from '../../sim/types'

/**
 * The procedural mission patch (vision §3.5): drawn from the player's own parts, orbit
 * and astronaut name. No AI art. Pure data here; `ui/report/MissionPatch.tsx` draws it.
 *
 * The same design and name always give the same patch, so a shared design code
 * reproduces the patch on another team's screen.
 */

export type OrbitShape = 'halo' | 'elliptical' | 'circular'
export type PlumeKind = 'ion' | 'chemical' | 'cold-gas' | 'none'
export type InstrumentGlyph = 'laser' | 'neutron' | 'ir' | 'camera'

export interface PatchStar {
  x: number
  y: number
  r: number
}

export interface PatchSpec {
  /** Ring text, top */
  title: string
  /** Ring text, bottom: the astronaut's name */
  name: string
  /** Short mission number from the design, e.g. "IH-0427" */
  number: string
  outcome: Report['outcome'] | 'planned'
  orbit: { shape: OrbitShape; rx: number; ry: number; tilt: number; cx: number; cy: number }
  /** Where the CubeSat sits on its orbit (0..1 around the ellipse) */
  craftAt: number
  wings: 0 | 1 | 2
  /** Bigger battery: more cells drawn on the body */
  cells: 1 | 2 | 3
  plume: PlumeKind
  instruments: InstrumentGlyph[]
  /** Radio band letter on the antenna */
  band: string
  stars: PatchStar[]
}

/** FNV-1a: a stable 32-bit hash of a string */
export function hash32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: small seeded random numbers in [0, 1) */
function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ORBITS: Record<string, { shape: OrbitShape; rx: number; ry: number; tilt: number }> = {
  // The halo loop is a big lazy ring well away from the Moon
  'orbit-halo': { shape: 'halo', rx: 62, ry: 26, tilt: -24 },
  // Elliptical polar: a long ellipse that dips low over the south pole
  'orbit-elliptical': { shape: 'elliptical', rx: 58, ry: 22, tilt: 62 },
  // 100 km circular: hugs the Moon
  'orbit-100km': { shape: 'circular', rx: 40, ry: 40, tilt: 0 },
}

const WINGS: Record<string, 0 | 1 | 2> = { 'solar-body': 0, 'solar-1wing': 1, 'solar-2wing': 2 }
const CELLS: Record<string, 1 | 2 | 3> = { 'battery-small': 1, 'battery-medium': 2, 'battery-large': 3 }
const BANDS: Record<string, string> = { 'radio-uhf': 'UHF', 'radio-sband': 'S', 'radio-xband': 'X' }
const GLYPHS: Record<string, InstrumentGlyph> = {
  'inst-laser': 'laser',
  'inst-neutron': 'neutron',
  'inst-ir-spec': 'ir',
  'inst-camera': 'camera',
}

export function plumeFor(propulsion: string): PlumeKind {
  if (propulsion.startsWith('prop-ion')) return 'ion'
  if (propulsion.startsWith('prop-chemical')) return 'chemical'
  if (propulsion === 'prop-coldgas') return 'cold-gas'
  return 'none'
}

/** Ring text never overflows the ring: about 18 letters fit on the lower arc */
export function patchName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ').toUpperCase()
  if (clean.length === 0) return 'ROOKIE'
  return clean.length > 18 ? `${clean.slice(0, 17)}…` : clean
}

export function patchSpec(design: Design, astronautName: string, outcome: PatchSpec['outcome'] = 'planned'): PatchSpec {
  // Only what shapes the craft feeds the seed: the same craft and name, the same patch
  const seed = hash32(`${patchName(astronautName)}|${design.orbit}|${design.propulsion}|${design.solar}|${design.battery}|${design.radio}|${[...design.instruments].sort().join(',')}`)
  const next = rand(seed)
  const orbit = ORBITS[design.orbit] ?? ORBITS['orbit-100km']
  const stars: PatchStar[] = []
  // Stars in the upper sky, kept off the Moon (lower right) and inside the inner disc
  for (let tries = 0; stars.length < 14 && tries < 200; tries++) {
    const x = 40 + next() * 120
    const y = 40 + next() * 70
    const r = 0.5 + next() * 1.1
    const inside = (x - 100) ** 2 + (y - 100) ** 2 < 58 ** 2
    const offMoon = (x - 112) ** 2 + (y - 118) ** 2 > 36 ** 2
    if (inside && offMoon) stars.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(r * 10) / 10 })
  }
  return {
    title: 'LUNAR ICE MAPPER',
    name: patchName(astronautName),
    number: `IH-${String(seed % 10000).padStart(4, '0')}`,
    outcome,
    orbit: { ...orbit, cx: 112, cy: 118 },
    craftAt: 0.12 + next() * 0.2,
    wings: WINGS[design.solar] ?? 1,
    cells: CELLS[design.battery] ?? 1,
    plume: plumeFor(design.propulsion),
    instruments: design.instruments.map((id) => GLYPHS[id]).filter((g): g is InstrumentGlyph => g !== undefined),
    band: BANDS[design.radio] ?? '',
    stars,
  }
}

/** A point on the tilted orbit ellipse, at fraction t (0..1) of the way round */
export function orbitPoint(o: PatchSpec['orbit'], t: number): { x: number; y: number; angle: number } {
  const a = t * Math.PI * 2
  const tilt = (o.tilt * Math.PI) / 180
  const ex = o.rx * Math.cos(a)
  const ey = o.ry * Math.sin(a)
  const x = o.cx + ex * Math.cos(tilt) - ey * Math.sin(tilt)
  const y = o.cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)
  // Direction of travel, for the craft's heading
  const dx = -o.rx * Math.sin(a) * Math.cos(tilt) - o.ry * Math.cos(a) * Math.sin(tilt)
  const dy = -o.rx * Math.sin(a) * Math.sin(tilt) + o.ry * Math.cos(a) * Math.cos(tilt)
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, angle: Math.round(((Math.atan2(dy, dx) * 180) / Math.PI) * 10) / 10 }
}
