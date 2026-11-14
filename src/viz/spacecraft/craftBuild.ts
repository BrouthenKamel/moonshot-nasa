import { ENVELOPE, KIT_PARTS, REFERENCE_BUILD, type KitPartId, type RefInstance, type Vec3 } from '../../data/craftKit'
import { getPartById } from '../../data/parts'
import { createDefaultDesign } from '../../sim/budgets'
import type { Design } from '../../sim/types'

/**
 * Which kit parts make up the player's spacecraft, and where each sits. Pure: the design in,
 * a list of part instances out, positioned from the kit's reference build. The scene only draws
 * this list, and the tests check every combination of choices for parts that leave the box or
 * collide.
 *
 * Units are metres, Y up, +Z the instrument end (the kit's frame).
 */

export type CraftSlot =
  | 'structure'
  | 'solar'
  | 'battery'
  | 'computer'
  | 'attitude'
  | 'propulsion'
  | 'instrument'
  | 'radio'
  | 'bus'

export interface CraftInstance {
  /** Stable while the same part stays in the same place: a new key means a part was swapped in */
  key: string
  part: KitPartId
  slot: CraftSlot
  /** The choice (game part id) that put it here */
  from: string
  position: Vec3
  /** Euler XYZ, radians */
  rotation: Vec3
  scale: number
  explode: { dir: Vec3; dist: number }
  /** Node names in the part to hide (a wing's extra panels, a face panel) */
  hidden: string[]
  /** Shown only with the panels on (the closed-up craft) */
  panel?: boolean
  /** Wings that never open: body-mounted panels stay folded */
  foldedAlways?: boolean
}

const ref = (id: string): RefInstance => {
  const r = REFERENCE_BUILD.find((i) => i.id === id)
  if (!r) throw new Error(`reference build has no ${id}`)
  return r
}

function inst(
  key: string,
  slot: CraftSlot,
  from: string,
  base: RefInstance,
  extra: Partial<CraftInstance> = {}
): CraftInstance {
  return {
    key,
    part: base.part,
    slot,
    from,
    position: [...base.position],
    rotation: [...base.rotation],
    scale: 1,
    explode: { dir: [...base.explode.dir], dist: base.explode.dist },
    hidden: [...(base.hidden ?? [])],
    ...extra,
  }
}

/** A part the reference build does not have, pushed outward from the middle when exploded */
function placed(
  key: string,
  slot: CraftSlot,
  from: string,
  part: KitPartId,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  extra: Partial<CraftInstance> = {}
): CraftInstance {
  const len = Math.hypot(...position) || 1
  const dir = position.map((v) => Math.round((v / len) * 1000) / 1000) as Vec3
  return { key, part, slot, from, position, rotation, scale: 1, explode: { dir, dist: 0.12 }, hidden: [], ...extra }
}

/** Where the two instrument bays are: left of centre (the camera's) and right of centre (the spectrometer's) */
const BAY = { left: ref('camera').position, right: ref('ir_spectrometer').position }
/** The front end frame is at +0.183; an instrument's aperture sits just short of it */
const FRONT = 0.1805

/** Position of an instrument so its front face meets the end frame, in the left or right bay */
function instrumentPlacement(id: string, side: 'left' | 'right'): { part: KitPartId; position: Vec3; scale: number } {
  const x = BAY[side][0]
  switch (id) {
    // the optical axis is the origin and the aperture is 115 mm (camera) or 108 mm (spectrometer) out
    case 'inst-camera':
      return { part: 'narrow_angle_camera', position: [x, 0, FRONT - 0.115], scale: 1 }
    case 'inst-ir-spec':
      return { part: 'ir_spectrometer', position: [x, 0, FRONT - 0.108], scale: 1 }
    case 'inst-laser':
      // its rear plate is the origin and the aperture is 66.5 mm out; a touch smaller so it clears the side panels
      return { part: 'laser_reflectometer', position: [x, 0, FRONT - 0.0665 * 0.93], scale: 0.93 }
    default:
      // neutron spectrometer: origin is the bottom of its electronics box; it sits low and runs to the front
      return { part: 'neutron_spectrometer', position: [x, -0.034, FRONT - 0.048], scale: 1 }
  }
}

/** Who gets the left bay: the camera by preference, the spectrometer takes the right, the rest fill what is left */
function assignBays(ids: string[]): Array<{ id: string; side: 'left' | 'right' }> {
  const out: Array<{ id: string; side: 'left' | 'right' }> = []
  const taken = new Set<'left' | 'right'>()
  const want = (id: string): 'left' | 'right' => (id === 'inst-ir-spec' ? 'right' : 'left')
  // the camera is the longest instrument at the rear, so it always claims the left bay (the right one holds the wheels)
  const ordered = [...ids].sort((a, b) => Number(b === 'inst-camera') - Number(a === 'inst-camera'))
  for (const id of ordered) {
    let side = want(id)
    if (taken.has(side)) side = side === 'left' ? 'right' : 'left'
    if (taken.has(side)) continue
    taken.add(side)
    out.push({ id, side })
  }
  return out
}

const SOLAR_HIDDEN: Record<string, string[]> = {
  'solar-body': [],
  'solar-1wing': ['hinge_2'], // two panels a side
  'solar-2wing': [], // three panels a side
}

/** Moves a module that fires out of the rear so its nozzle meets the rear end frame (z = -0.183) */
const REAR = -0.183

export function buildCraft(design: Design): CraftInstance[] {
  const out: CraftInstance[] = []
  const add = (i: CraftInstance) => out.push(i)

  // The bus: structure, avionics stack, harness, thermal and the access hardware. Always there.
  add(inst('frame', 'structure', 'structure', ref('frame')))
  add(inst('panels', 'structure', 'structure', ref('panels'), { panel: true }))
  for (const id of ['switch_a', 'switch_b', 'spring_a', 'spring_b', 'access_port'])
    add(inst(id, 'structure', 'structure', ref(id)))
  add(inst('harness', 'bus', 'structure', ref('harness')))
  add(inst('radiator', 'bus', 'structure', ref('radiator')))
  add(inst('backplane', 'bus', 'structure', ref('backplane')))
  add(inst('eps', 'bus', 'structure', ref('eps')))
  add(inst('transceiver', 'bus', 'structure', ref('transceiver')))

  // Solar: wings both sides; body-mounted ones never leave the box
  add(inst('wing_py', 'solar', design.solar, ref('wing_py'), { hidden: SOLAR_HIDDEN[design.solar] ?? [], foldedAlways: design.solar === 'solar-body' }))
  add(inst('wing_ny', 'solar', design.solar, ref('wing_ny'), { hidden: SOLAR_HIDDEN[design.solar] ?? [], foldedAlways: design.solar === 'solar-body' }))

  // Battery: the kit has one 4-cell pack; the smaller packs are the same pack drawn smaller
  const batteryScale = design.battery === 'battery-small' ? 0.74 : design.battery === 'battery-medium' ? 0.87 : 1
  add(inst('battery', 'battery', design.battery, ref('battery'), { scale: batteryScale }))

  // Flight computer: one board, or two for the redundant one
  add(inst('obc', 'computer', design.computer, ref('obc')))
  if (design.computer === 'computer-redundant')
    add(placed('obc_b', 'computer', design.computer, 'obc_board', [-0.0515, 0.0239, 0.012]))

  // Attitude: wheels and magnetorquers; precision adds the cluster, a star tracker and the IMU
  add(inst('magnetorquers', 'attitude', design.attitude, ref('magnetorquers')))
  add(inst('imu', 'attitude', design.attitude, ref('imu'), { position: [-0.0515, 0.0235, -0.088] }))
  if (design.attitude === 'attitude-precision') {
    add(inst('rw_cluster', 'attitude', design.attitude, ref('rw_cluster')))
    add(inst('star_tracker', 'attitude', design.attitude, ref('star_tracker')))
    add(inst('sun_sensor', 'attitude', design.attitude, ref('sun_sensor')))
  } else {
    const wheel = ref('rw_cluster')
    add(placed('wheel', 'attitude', design.attitude, 'reaction_wheel', [...wheel.position] as Vec3))
    add(inst('sun_sensor', 'attitude', design.attitude, ref('sun_sensor')))
    add(placed('sun_sensor_b', 'attitude', design.attitude, 'sun_sensor', [0.1061, -0.02, -0.12], [0, 0, -1.5708]))
  }
  // The IMU belongs to the precision set only
  if (design.attitude !== 'attitude-precision') out.splice(out.findIndex((i) => i.key === 'imu'), 1)

  // Propulsion in the right-hand rear bay
  const bay: Vec3 = ref('ion_engine').position
  if (design.propulsion.startsWith('prop-ion')) {
    const s = design.propulsion === 'prop-ion' ? 0.92 : 1
    add(inst('engine', 'propulsion', design.propulsion, ref('ion_engine'), { scale: s }))
  } else if (design.propulsion === 'prop-coldgas') {
    add(placed('engine', 'propulsion', design.propulsion, 'cold_gas_module', [bay[0], -0.04, REAR + 0.0583 + 0.002]))
  } else {
    // green monopropellant: the module is longer than the bay, so it is drawn a little smaller
    const s = design.propulsion === 'prop-chemical-large' ? 0.77 : 0.68
    add(placed('engine', 'propulsion', design.propulsion, 'green_monoprop_module', [bay[0], -0.04, REAR + 0.099 * s + 0.002], [0, 0, 0], { scale: s }))
  }

  // Instruments (chosen at the Research Lab) at the front
  for (const { id, side } of assignBays(design.instruments)) {
    const p = instrumentPlacement(id, side)
    add(placed(`instrument:${id}`, 'instrument', id, p.part, p.position, [0, 0, 0], { scale: p.scale, explode: { dir: [0, 0.1483, 0.9889], dist: 0.16 } }))
  }

  // Radio (chosen at the Communications Center)
  if (design.radio === 'radio-uhf') {
    add(inst('uhf', 'radio', design.radio, ref('uhf')))
  } else {
    add(inst('transponder', 'radio', design.radio, ref('transponder')))
    if (design.radio === 'radio-xband') add(placed('dish', 'radio', design.radio, 'dish_antenna', [-0.02, 0.05, 0.03]))
    else add(inst('patch', 'radio', design.radio, ref('patch')))
  }

  return out
}

/** Name for a tag: the game part's name where the choice is a game part */
export function craftLabel(from: string): string {
  return getPartById(from)?.name ?? from
}

/* ---------------- fit checks (used by the tests) ---------------- */

export interface Box {
  min: Vec3
  max: Vec3
}

/** Rotation matrix rows for three.js's Euler 'XYZ' order */
function rotationRows(r: Vec3): [Vec3, Vec3, Vec3] {
  const [x, y, z] = r
  const a = Math.cos(x)
  const b = Math.sin(x)
  const c = Math.cos(y)
  const d = Math.sin(y)
  const e = Math.cos(z)
  const f = Math.sin(z)
  const ae = a * e
  const af = a * f
  const be = b * e
  const bf = b * f
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ]
}

/** The box around a part instance in the craft's frame */
export function instanceBox(i: CraftInstance): Box {
  const { min, max } = KIT_PARTS[i.part]
  const rows = rotationRows(i.rotation)
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const cx of [min[0], max[0]])
    for (const cy of [min[1], max[1]])
      for (const cz of [min[2], max[2]]) {
        for (let k = 0; k < 3; k++) {
          const v = (rows[k][0] * cx + rows[k][1] * cy + rows[k][2] * cz) * i.scale + i.position[k]
          lo[k] = Math.min(lo[k], v)
          hi[k] = Math.max(hi[k], v)
        }
      }
  return { min: lo, max: hi }
}

/** How far two boxes overlap on their smallest overlapping axis (0 if they do not touch) */
export function overlapDepth(a: Box, b: Box): number {
  let depth = Infinity
  for (let k = 0; k < 3; k++) {
    const o = Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])
    if (o <= 0) return 0
    depth = Math.min(depth, o)
  }
  return depth
}

/** Parts whose boxes would be checked against the envelope and each other: the modules inside the craft */
export const INTERNAL_PARTS: ReadonlySet<KitPartId> = new Set<KitPartId>([
  'backplane',
  'eps_board',
  'obc_board',
  'transceiver_board',
  'battery_pack',
  'magnetorquer_set',
  'imu_box',
  'narrow_angle_camera',
  'ir_spectrometer',
  'laser_reflectometer',
  'neutron_spectrometer',
  'transponder',
  'rw_cluster',
  'reaction_wheel',
  'ion_engine',
  'cold_gas_module',
  'green_monoprop_module',
])

export function envelopeBreach(i: CraftInstance): number {
  const b = instanceBox(i)
  let worst = 0
  for (let k = 0; k < 3; k++) worst = Math.max(worst, ENVELOPE.min[k] - b.min[k], b.max[k] - ENVELOPE.max[k])
  return worst
}

/**
 * Every kit part some choice can put on the craft, for preloading the models. Each choice is tried on
 * its own against the default design, which reaches every part without trying all combinations.
 */
export function allCraftParts(): KitPartId[] {
  const base = createDefaultDesign()
  const tries: Array<Partial<Design>> = [
    {},
    ...['solar-body', 'solar-1wing', 'solar-2wing'].map((solar) => ({ solar })),
    ...['battery-small', 'battery-large'].map((battery) => ({ battery })),
    { computer: 'computer-redundant' },
    { attitude: 'attitude-basic' },
    { attitude: 'attitude-precision' },
    ...['prop-coldgas', 'prop-chemical', 'prop-ion'].map((propulsion) => ({ propulsion })),
    ...['radio-uhf', 'radio-sband', 'radio-xband'].map((radio) => ({ radio })),
    ...['inst-ir-spec', 'inst-laser', 'inst-camera', 'inst-neutron'].map((i) => ({ instruments: [i] })),
  ]
  const parts = new Set<KitPartId>()
  for (const t of tries) for (const i of buildCraft({ ...base, ...t })) parts.add(i.part)
  return [...parts]
}
