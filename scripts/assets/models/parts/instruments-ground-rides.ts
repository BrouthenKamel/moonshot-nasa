/**
 * Catalogue models: science instruments, ground stations and launch vehicles.
 *
 * Instruments are CubeSat payloads sized from src/data/parts.ts (1U = 10 cm cube) and look
 * out along +Z. Ground stations and launch vehicles are in real metres and carry a 1.8 m
 * `scale-figure` (ground stations) so the player feels the size jump from 4 m to 34 m.
 *
 * Pivots (exported deployed, `userData.stowed` = folded pose):
 * - ground-*: `pivot_elevation` (deployed: dish tracking toward +Z at 30, 35 and 45 degrees elevation,
 *   stowed: dish parked at zenith, as real antennas stow).
 * - ride-commercial: `pivot_door-a`, `pivot_door-b` (CubeSat dispenser doors, stowed closed),
 *   `pivot_dish` (high-gain antenna, stowed folded flat).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mat, mesh, box, rbox, group, cyl, sphere, lathe, instances, solarPanel, dishGeometry, type V3 } from '../kit.ts'

/* ------------------------------------------------------------------ local materials */

const std = (name: string, color: string, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ name, color, metalness, roughness, ...extra })

/** Surfaces the kit does not have, named for this group only */
const loc = {
  /** Crinkled gold blanket: rougher than the kit's flat gold so random facets still read gold in any light */
  foil: std('mli_gold_crinkled', '#e0ad3a', 0.7, 0.42),
  /** Aluminised tape over MLI seams: satin, so it reads silver rather than mirror-black */
  tape: std('mli_tape', '#cfd3d9', 0.6, 0.45),
  baffle: std('baffle_black', '#07080a', 0.15, 0.9, { side: THREE.DoubleSide }),
  crystal: std('elpasolite_crystal', '#8fe0dc', 0.2, 0.04, { transparent: true, opacity: 0.72 }),
  pmtGlass: std('pmt_glass', '#9a7a3a', 0.6, 0.12),
  fibre: std('fibre_jacket', '#f2a23a', 0.05, 0.55),
  dishAlt: std('dish_white_alt', '#dde1e6', 0.2, 0.42, { side: THREE.DoubleSide }),
  steel: std('steel_grey', '#9ea5ae', 0.55, 0.5),
  grating: std('grating_dark', '#5d636c', 0.6, 0.6),
  roof: std('roof_membrane', '#565c66', 0, 0.92),
  seam: std('panel_seam', '#b4bac3', 0.4, 0.5),
  brick: std('brick', '#9a5640', 0, 0.85),
  grass: std('grass', '#5f7d46', 0, 0.95),
  soil: std('soil', '#5a4535', 0, 0.95),
  sand: std('desert_sand', '#c8b28a', 0, 0.95),
  asphalt: std('asphalt', '#3b3e44', 0, 0.9),
  railing: std('safety_yellow', '#e8b923', 0.15, 0.5),
  window: std('window_dark', '#1c2738', 0.7, 0.12),
  foam: std('foam_orange', '#d36a28', 0, 0.82),
  foamDark: std('foam_orange_dark', '#a9531f', 0, 0.86),
  soot: std('engine_soot', '#1a1b1e', 0.55, 0.6, { side: THREE.DoubleSide }),
  bell: std('nozzle_niobium', '#5b5f66', 0.85, 0.38, { side: THREE.DoubleSide }),
  white: std('rocket_white', '#f4f4f1', 0.08, 0.45),
}

/* ------------------------------------------------------------------ helpers */

const UP = new THREE.Vector3(0, 1, 0)

/** Geometry of a strut between two points (round or square section) */
function strutGeo(a: V3, b: V3, r: number, seg = 6, square = false) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const len = va.distanceTo(vb)
  const g = square ? new THREE.BoxGeometry(r * 2, len, r * 2) : new THREE.CylinderGeometry(r, r, len, seg)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, vb.clone().sub(va).normalize()))
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  return g
}

function strut(a: V3, b: V3, r: number, m: THREE.Material, name: string, seg = 8, square = false) {
  return mesh(strutGeo(a, b, r, seg, square), m, name)
}

/** Geometry helpers that move a fresh geometry into place */
function xf(g: THREE.BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) {
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)))
  g.translate(...pos)
  return g
}

function merge(geos: THREE.BufferGeometry[]) {
  const flat = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k)
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2))
    return n
  })
  return mergeGeometries(flat)
}

/** Collects geometry per material and emits one merged mesh per material (cheap to draw) */
class Batch {
  private byMat = new Map<THREE.Material, THREE.BufferGeometry[]>()
  add(g: THREE.BufferGeometry, m: THREE.Material) {
    const list = this.byMat.get(m) ?? []
    list.push(g)
    this.byMat.set(m, list)
    return this
  }
  build(name: string) {
    const g = group(name)
    for (const [m, geos] of this.byMat) g.add(mesh(merge(geos), m, `${name}-${(m.name || 'mat').replace(/[^A-Za-z0-9_-]/g, '')}`))
    return g
  }
}

/** Crinkled foil: jitter every vertex by a hash of its position (shared edges stay closed), flat shaded */
function crumple(geo: THREE.BufferGeometry, amp: number, seed = 1) {
  const p = geo.attributes.position as THREE.BufferAttribute
  const hash = (a: number, b: number, c: number, k: number) => {
    const h = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + k * 11.13 + seed * 3.7) * 43758.5453
    return h - Math.floor(h) - 0.5
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const q = [Math.round(x * 1e4), Math.round(y * 1e4), Math.round(z * 1e4)] as const
    p.setXYZ(i, x + hash(...q, 1) * amp, y + hash(...q, 2) * amp, z + hash(...q, 3) * amp)
  }
  const n = geo.index ? geo.toNonIndexed() : geo
  n.computeVertexNormals()
  return n
}

/** Open or closed tube following a smooth path through points */
function cable(points: V3[], r: number, m: THREE.Material, name: string, seg = 24, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  return mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), m, name)
}

/** Lathe along +Z instead of +Y */
function latheZ(points: [number, number][], m: THREE.Material, name: string, pos: V3 = [0, 0, 0], seg = 32) {
  const g = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), seg)
  g.rotateX(Math.PI / 2)
  return mesh(g, m, name, pos)
}

/** Screw heads on a face whose normal is +Z */
function screwsZ(pts: [number, number][], z: number, name: string, r = 0.0022) {
  const g = new THREE.CylinderGeometry(r, r, 0.0016, 8)
  g.rotateX(Math.PI / 2)
  return instances(g, pts.map(([x, y]) => [x, y, z] as V3), mat.solder, name)
}

/** Raised label plate facing +Z: anodized plate with embossed "text" bars and rivets */
function labelPlate(name: string, w: number, h: number, pos: V3, rotY = 0) {
  const g = group(name)
  const t = Math.max(0.0008, h * 0.06)
  g.add(rbox(w, h, t, Math.min(w, h) * 0.12, mat.anodized, `${name}-plate`))
  const lines = 3
  const bars: V3[] = []
  const widths = [0.78, 0.55, 0.66]
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < lines; i++) {
    const bw = w * widths[i] * 0.8
    geos.push(xf(new THREE.BoxGeometry(bw, h * 0.11, t * 0.6), [-w * 0.36 + bw / 2, h * (0.22 - i * 0.22), t * 0.6]))
  }
  g.add(mesh(merge(geos), mat.panel, `${name}-text`))
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bars.push([sx * (w / 2 - h * 0.13), sy * (h / 2 - h * 0.15), t * 0.5])
  const rg = new THREE.CylinderGeometry(h * 0.05, h * 0.05, t, 6)
  rg.rotateX(Math.PI / 2)
  g.add(instances(rg, bars, mat.solder, `${name}-rivets`))
  g.position.set(...pos)
  g.rotation.y = rotY
  return g
}

/** D-sub style connector facing +Z */
function connector(name: string, w: number, pos: V3, rotY = 0) {
  const g = group(name)
  const h = w * 0.42
  g.add(box(w * 1.45, h * 1.5, w * 0.08, mat.aluminium, `${name}-flange`, [0, 0, w * 0.04]))
  g.add(rbox(w, h, w * 0.3, h * 0.3, mat.aluminiumDark, `${name}-shell`, [0, 0, w * 0.2]))
  g.add(box(w * 0.82, h * 0.6, w * 0.02, mat.anodized, `${name}-insert`, [0, 0, w * 0.36]))
  g.add(cyl(w * 0.07, w * 0.07, w * 0.16, mat.solder, `${name}-jack-l`, 'z', [-w * 0.6, 0, w * 0.12], 8))
  g.add(cyl(w * 0.07, w * 0.07, w * 0.16, mat.solder, `${name}-jack-r`, 'z', [w * 0.6, 0, w * 0.12], 8))
  g.position.set(...pos)
  g.rotation.y = rotY
  return g
}

/** Wraps a model: lowest point on y = 0, origin at the centre of `footprint` (or the whole model) */
function finish(id: string, body: THREE.Object3D, footprint?: THREE.Object3D) {
  body.updateMatrixWorld(true)
  const all = new THREE.Box3().setFromObject(body)
  const fp = footprint ? new THREE.Box3().setFromObject(footprint) : all
  const c = fp.getCenter(new THREE.Vector3())
  const root = group(id)
  body.name = `${id}-body`
  body.position.sub(new THREE.Vector3(c.x, all.min.y, c.z))
  root.add(body)
  return root
}

/** A 1.8 m person in a navy suit, hi-vis vest and white hard hat, for scale */
function scaleFigure(pos: V3, yaw = 0) {
  const g = group('scale-figure')
  const cap = (r: number, len: number, m: THREE.Material, name: string, p: V3, rot: V3 = [0, 0, 0]) =>
    mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m, name, p, rot)
  g.add(cap(0.075, 0.74, mat.paintNavy, 'figure-leg-l', [-0.1, 0.445, 0]))
  g.add(cap(0.075, 0.74, mat.paintNavy, 'figure-leg-r', [0.1, 0.445, 0]))
  const torso = cap(0.17, 0.36, mat.paintOrange, 'figure-torso', [0, 1.2, 0])
  torso.scale.set(1.15, 1, 0.72)
  g.add(torso)
  g.add(box(0.36, 0.05, 0.25, mat.silverFoil, 'figure-vest-stripe', [0, 1.14, 0]))
  g.add(cap(0.055, 0.5, mat.paintNavy, 'figure-arm-l', [-0.26, 1.15, 0.02], [0, 0, -0.12]))
  g.add(cap(0.055, 0.5, mat.paintNavy, 'figure-arm-r', [0.26, 1.15, 0.02], [0, 0, 0.12]))
  g.add(sphere(0.1, mat.ceramic, 'figure-head', [0, 1.66, 0], 14))
  g.add(lathe([[0, 0.12], [0.07, 0.115], [0.11, 0.07], [0.125, 0.0], [0.15, -0.005], [0.15, -0.015], [0, -0.015]], mat.panel, 'figure-hardhat', [0, 1.69, 0], 16))
  g.position.set(...pos)
  g.rotation.y = yaw
  return g
}

/* ================================================================== instruments */

/** IR spectrometer, BIRCHES-type: 1.5U. Gold-foiled optics box with a black baffle, finned cryocooler behind. */
function buildIrSpec() {
  const g = group('inst-ir-spec-asm')
  const L = 0.15
  const W = 0.1
  const base = rbox(W, 0.005, L, 0.004, mat.aluminium, 'base-plate', [0, 0.0025, 0])
  g.add(base)
  // Mounting tabs with fasteners
  const tabs: V3[] = []
  for (const sx of [-1, 1]) for (const z of [-0.055, 0.055]) tabs.push([sx * 0.056, 0.0018, z])
  g.add(instances(new THREE.BoxGeometry(0.014, 0.0036, 0.016), tabs, mat.aluminium, 'mount-tabs'))
  g.add(instances(new THREE.CylinderGeometry(0.0032, 0.0032, 0.002, 8), tabs.map(([x, , z]) => [x + Math.sign(x) * 0.002, 0.0044, z] as V3), mat.solder, 'mount-screws'))

  // Optics box wrapped in gold MLI, with tape seams and crinkles
  const ob = group('optics')
  const oy = 0.005 + 0.036
  const oz = 0.075 - 0.043
  ob.add(mesh(crumple(new THREE.BoxGeometry(0.09, 0.072, 0.0835, 6, 5, 6), 0.0011, 3), loc.foil, 'optics-mli', [0, oy, oz]))
  // Silver tape seams holding the blanket closed, Velcro tabs at the corners
  ob.add(box(0.093, 0.0748, 0.009, loc.tape, 'mli-tape-ring', [0, oy, oz - 0.014]))
  ob.add(box(0.008, 0.0012, 0.086, loc.tape, 'mli-tape-top', [0.022, oy + 0.0372, oz]))
  ob.add(instances(new THREE.BoxGeometry(0.01, 0.0015, 0.01), [[-0.036, oy + 0.0372, oz + 0.034], [-0.036, oy + 0.0372, oz - 0.034]], mat.ceramic, 'mli-velcro'))
  // Field-stop actuator on the side
  ob.add(cyl(0.009, 0.009, 0.012, mat.aluminium, 'stop-motor', 'x', [0.051, oy + 0.012, oz + 0.016], 20))
  ob.add(cyl(0.011, 0.011, 0.003, mat.aluminiumDark, 'stop-motor-flange', 'x', [0.0465, oy + 0.012, oz + 0.016], 20))
  ob.add(cable([[0.051, oy + 0.004, oz + 0.016], [0.052, oy - 0.012, oz], [0.049, oy - 0.02, -0.02]], 0.0015, mat.rubber, 'stop-motor-wire', 12, 5))
  // Front bulkhead and baffle (knife-edge vanes inside, objective lens at the bottom)
  const fz = 0.075
  ob.add(rbox(0.066, 0.066, 0.004, 0.006, mat.anodized, 'front-flange', [0, oy, fz + 0.002]))
  ob.add(screwsZ([[-0.027, oy - 0.027], [0.027, oy - 0.027], [-0.027, oy + 0.027], [0.027, oy + 0.027]], fz + 0.0045, 'front-screws'))
  const prof: [number, number][] = [[0.0275, 0], [0.0275, 0.005], [0.0225, 0.007], [0.0225, 0.05], [0.0245, 0.051], [0.0245, 0.056], [0.0195, 0.056]]
  for (let k = 0; k < 5; k++) {
    const h = 0.05 - k * 0.0085
    prof.push([0.0195, h], [0.0145, h - 0.0008], [0.0195, h - 0.0016])
  }
  prof.push([0.0195, 0.008], [0.0, 0.008])
  ob.add(latheZ(prof, loc.baffle, 'baffle', [0, oy, fz + 0.004], 36))
  ob.add(cyl(0.0148, 0.0148, 0.002, mat.lens, 'objective-lens', 'z', [0, oy, fz + 0.0125], 28))
  ob.add(mesh(new THREE.TorusGeometry(0.0242, 0.0012, 6, 36), mat.aluminium, 'baffle-lip', [0, oy, fz + 0.06]))
  // Detector dewar on the back of the optics box
  ob.add(cyl(0.013, 0.013, 0.012, mat.anodizedGold, 'dewar', 'z', [0, 0.06, -0.017], 24))
  ob.add(cyl(0.015, 0.015, 0.003, mat.aluminium, 'dewar-flange', 'z', [0, 0.06, -0.0115], 24))
  g.add(ob)

  // Electronics box at the back
  const eb = group('electronics')
  eb.add(rbox(0.09, 0.044, 0.062, 0.004, mat.anodized, 'electronics-box', [0, 0.005 + 0.022, -0.044]))
  const ribs: V3[] = []
  for (let i = 0; i < 5; i++) ribs.push([0, 0.008 + i * 0.0085, -0.044])
  eb.add(instances(new THREE.BoxGeometry(0.0915, 0.0015, 0.056), ribs, mat.anodized, 'electronics-ribs'))
  eb.add(connector('conn-power', 0.016, [-0.022, 0.026, -0.075], Math.PI))
  eb.add(connector('conn-data', 0.022, [0.018, 0.026, -0.075], Math.PI))
  eb.add(labelPlate('label', 0.04, 0.018, [0.0455, 0.03, -0.044], Math.PI / 2))
  g.add(eb)

  // Cryocooler: finned compressor across the top, cold finger into the dewar
  const cc = group('cryocooler')
  const cy = 0.074
  const cz = -0.046
  cc.add(cyl(0.0155, 0.0155, 0.084, mat.titanium, 'compressor', 'x', [0, cy, cz], 28))
  for (const sx of [-1, 1]) cc.add(lathe([[0, 0.006], [0.008, 0.005], [0.0135, 0.002], [0.0155, 0]], mat.titanium, `compressor-dome-${sx > 0 ? 'r' : 'l'}`, [sx * 0.042, cy, cz], 24))
  cc.children.slice(-2).forEach((d, i) => (d.rotation.z = i === 0 ? Math.PI / 2 : -Math.PI / 2))
  const fins: V3[] = []
  for (let i = 0; i < 15; i++) fins.push([-0.028 + i * 0.004, cy, cz])
  const fin = new THREE.CylinderGeometry(0.0255, 0.0255, 0.0011, 32)
  fin.rotateZ(Math.PI / 2)
  cc.add(instances(fin, fins, mat.aluminium, 'radiator-fins'))
  for (const x of [-0.034, 0.034]) {
    cc.add(box(0.008, 0.026, 0.04, mat.aluminiumDark, 'saddle', [x, 0.058, cz]))
    cc.add(mesh(new THREE.TorusGeometry(0.0165, 0.0018, 6, 24), mat.aluminiumDark, 'saddle-strap', [x, cy, cz], [0, Math.PI / 2, 0]))
  }
  cc.add(cyl(0.0045, 0.0045, 0.03, mat.titanium, 'cold-finger', 'z', [0, 0.064, -0.024], 16))
  cc.add(cable([[-0.046, cy, cz], [-0.054, cy - 0.01, cz - 0.01], [-0.05, 0.04, -0.07], [-0.022, 0.03, -0.079]], 0.0025, mat.rubber, 'drive-cable'))
  cc.add(cable([[0.008, 0.06, -0.012], [0.03, 0.068, -0.006], [0.046, 0.056, 0.0], [0.047, 0.03, -0.012]], 0.0018, mat.copper, 'thermal-strap', 20, 4))
  g.add(cc)
  return finish('inst-ir-spec', g, base)
}

/** Laser reflectometer, Lunar Flashlight-type: 2U. Four laser barrels round a big receiver telescope. */
function buildLaser() {
  const g = group('inst-laser-asm')
  const base = rbox(0.1, 0.005, 0.2, 0.004, mat.aluminium, 'base-plate', [0, 0.0025, 0])
  g.add(base)
  const by = 0.005 + 0.0425
  // Main housing: brushed aluminium with a black finned radiator on top
  g.add(rbox(0.096, 0.085, 0.14, 0.006, mat.aluminium, 'housing', [0, by, -0.03]))
  const fins: V3[] = []
  for (let i = 0; i < 11; i++) fins.push([-0.04 + i * 0.008, 0.0955, -0.035])
  g.add(instances(new THREE.BoxGeometry(0.0022, 0.012, 0.11), fins, mat.anodized, 'radiator-fins'))
  g.add(box(0.088, 0.003, 0.114, mat.anodized, 'radiator-base', [0, 0.0905, -0.035]))
  // Front bulkhead
  const fz = 0.04
  g.add(rbox(0.1, 0.09, 0.006, 0.006, mat.anodized, 'bulkhead', [0, 0.05, fz + 0.003]))
  g.add(screwsZ([[-0.045, 0.009], [0.045, 0.009], [-0.045, 0.091], [0.045, 0.091], [0, 0.009], [0, 0.091]], fz + 0.0065, 'bulkhead-screws'))
  // Receiver telescope: wide tube, black vanes, primary mirror, detector on a 3-vane spider
  const cy = 0.05
  g.add(latheZ([[0.0365, 0], [0.0365, 0.05], [0.0385, 0.051], [0.0385, 0.058], [0.0335, 0.058], [0.0335, 0.004], [0.0, 0.004]], mat.aluminium, 'receiver-tube', [0, cy, fz + 0.006], 40))
  const vane: [number, number][] = [[0.0334, 0.054]]
  for (let k = 0; k < 4; k++) vane.push([0.0334, 0.05 - k * 0.011], [0.029, 0.049 - k * 0.011], [0.0334, 0.048 - k * 0.011])
  vane.push([0.0334, 0.006])
  g.add(latheZ(vane, loc.baffle, 'receiver-vanes', [0, cy, fz + 0.006], 40))
  const mirror = mesh(dishGeometry(0.03, 0.006, 40), mat.silverFoil, 'primary-mirror', [0, cy, fz + 0.012])
  mirror.geometry.rotateX(Math.PI / 2)
  g.add(mirror)
  const spider: THREE.BufferGeometry[] = []
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2
    spider.push(strutGeo([Math.cos(a) * 0.006, cy + Math.sin(a) * 0.006, fz + 0.04], [Math.cos(a) * 0.034, cy + Math.sin(a) * 0.034, fz + 0.04], 0.0009, 4, true))
  }
  g.add(mesh(merge(spider), mat.anodized, 'spider'))
  g.add(cyl(0.0075, 0.009, 0.01, mat.anodizedGold, 'detector-housing', 'z', [0, cy, fz + 0.038], 20))
  g.add(cyl(0.004, 0.004, 0.0012, mat.lens, 'detector-window', 'z', [0, cy, fz + 0.0326], 16))
  // Four laser barrels at the corners, red emitters at the tips
  const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  corners.forEach(([sx, sy], i) => {
    const x = sx * 0.037
    const y = cy + sy * 0.0335
    const n = `laser-${i + 1}`
    g.add(cyl(0.0115, 0.0115, 0.006, mat.aluminiumDark, `${n}-nut`, 'z', [x, y, fz + 0.009], 6))
    g.add(latheZ([[0.0085, 0], [0.0085, 0.036], [0.0098, 0.037], [0.0098, 0.046], [0.0072, 0.047], [0.0, 0.047]], mat.aluminium, `${n}-barrel`, [x, y, fz + 0.012], 24))
    const rings: V3[] = []
    for (let k = 0; k < 5; k++) rings.push([x, y, fz + 0.016 + k * 0.0055])
    const ring = new THREE.CylinderGeometry(0.0108, 0.0108, 0.0016, 20)
    ring.rotateX(Math.PI / 2)
    g.add(instances(ring, rings, mat.anodized, `${n}-cooling-rings`))
    g.add(cyl(0.0052, 0.0052, 0.0016, mat.laser, `${n}-emitter`, 'z', [x, y, fz + 0.0586], 20))
    // Fibre from the laser module on the side wall round to the barrel
    g.add(cable([[sx * 0.051, 0.03 + (sy > 0 ? 0.03 : 0), -0.02], [sx * 0.055, y, 0.0], [sx * 0.052, y + sy * 0.004, fz + 0.002], [x + sx * 0.006, y, fz + 0.012]], 0.0017, loc.fibre, `${n}-fibre`, 20, 6))
  })
  // Laser driver modules on the side walls
  for (const sx of [-1, 1])
    for (const sy of [0, 1]) {
      g.add(rbox(0.006, 0.026, 0.05, 0.002, mat.anodizedGold, `driver-${sx > 0 ? 'r' : 'l'}-${sy}`, [sx * 0.051, 0.03 + sy * 0.03, -0.045]))
      g.add(instances(new THREE.BoxGeometry(0.002, 0.003, 0.04), [0, 1, 2].map((k) => [sx * 0.0545, 0.022 + sy * 0.03 + k * 0.008, -0.045] as V3), mat.anodized, `driver-ribs-${sx > 0 ? 'r' : 'l'}-${sy}`))
    }
  // Optical alignment cube on top front
  g.add(box(0.012, 0.012, 0.012, mat.glass, 'alignment-cube', [0.03, 0.098, 0.03]))
  g.add(box(0.016, 0.003, 0.016, mat.aluminiumDark, 'alignment-mount', [0.03, 0.091, 0.03]))
  // Back: connectors and label
  g.add(connector('conn-power', 0.018, [-0.024, 0.04, -0.1], Math.PI))
  g.add(connector('conn-data', 0.024, [0.02, 0.04, -0.1], Math.PI))
  g.add(connector('conn-test', 0.014, [0.0, 0.07, -0.1], Math.PI))
  g.add(labelPlate('label', 0.05, 0.02, [0.0, 0.072, -0.0995], Math.PI))
  g.children.at(-1)!.position.set(-0.02, 0.07, -0.1)
  return finish('inst-laser', g, base)
}

/** Narrow-angle camera: 0.3U. Electronics box, focus-ringed lens barrel and a scarfed sunshade. */
function buildCamera() {
  const g = group('inst-camera-asm')
  const cy = 0.031
  // Bracket feet
  const foot = box(0.07, 0.004, 0.05, mat.aluminium, 'bracket', [0, 0.002, -0.022])
  g.add(foot)
  g.add(instances(new THREE.CylinderGeometry(0.0025, 0.0025, 0.0016, 8), [[-0.03, 0.0046, -0.04], [0.03, 0.0046, -0.04], [-0.03, 0.0046, -0.004], [0.03, 0.0046, -0.004]], mat.solder, 'bracket-screws'))
  // Electronics box
  g.add(rbox(0.058, 0.052, 0.046, 0.005, mat.aluminium, 'electronics', [0, 0.004 + 0.026, -0.024]))
  for (const sx of [-1, 1]) {
    g.add(rbox(0.0025, 0.04, 0.036, 0.001, mat.anodizedBlue, `side-panel-${sx > 0 ? 'r' : 'l'}`, [sx * 0.0295, 0.03, -0.024]))
    const sc: V3[] = []
    for (const y of [0.0135, 0.0465]) for (const z of [-0.0385, -0.0095]) sc.push([sx * 0.031, y, z])
    const sg = new THREE.CylinderGeometry(0.0016, 0.0016, 0.0014, 8)
    sg.rotateZ(Math.PI / 2)
    g.add(instances(sg, sc, mat.solder, `side-screws-${sx > 0 ? 'r' : 'l'}`))
  }
  const ribs: V3[] = []
  for (let i = 0; i < 5; i++) ribs.push([-0.02 + i * 0.01, 0.057, -0.024])
  g.add(instances(new THREE.BoxGeometry(0.0022, 0.004, 0.036), ribs, mat.anodized, 'cooling-ribs'))
  g.add(box(0.004, 0.003, 0.004, mat.ledGreen, 'status-led', [0.022, 0.044, -0.0478]))
  g.add(box(0.05, 0.004, 0.003, mat.pcbBlue, 'board-edge', [0, 0.012, 0.0])) // sensor board peeking out
  g.add(connector('conn', 0.016, [0, 0.024, -0.047], Math.PI))
  g.add(cable([[0, 0.024, -0.054], [0, 0.02, -0.062], [0.012, 0.006, -0.066], [0.03, 0.005, -0.062]], 0.0028, mat.rubber, 'harness', 16, 6))
  g.add(labelPlate('label', 0.028, 0.012, [-0.0315, 0.03, -0.024], -Math.PI / 2))
  // Lens mount flange and barrel
  g.add(cyl(0.025, 0.025, 0.004, mat.aluminium, 'lens-flange', 'z', [0, cy, 0.001], 32))
  g.add(screwsZ([[-0.019, cy - 0.011], [0.019, cy - 0.011], [-0.019, cy + 0.011], [0.019, cy + 0.011]], 0.0035, 'flange-screws', 0.0016))
  g.add(latheZ([[0.0185, 0], [0.0185, 0.012], [0.0205, 0.013], [0.0205, 0.025], [0.0175, 0.026], [0.0175, 0.034], [0.0, 0.034]], mat.aluminium, 'lens-barrel', [0, cy, 0.003], 36))
  // Knurled focus ring
  const knurl: V3[] = []
  const rots: V3[] = []
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2
    knurl.push([Math.cos(a) * 0.0209, cy + Math.sin(a) * 0.0209, 0.022])
    rots.push([0, 0, a])
  }
  g.add(instances(new THREE.BoxGeometry(0.0014, 0.0014, 0.011), knurl, mat.anodized, 'focus-knurl', rots))
  g.add(mesh(new THREE.TorusGeometry(0.0186, 0.0009, 6, 36), mat.anodizedBlue, 'aperture-ring', [0, cy, 0.016]))
  // Scarfed sunshade: longer on the top so the Sun is kept off the lens
  const hoodLen = 0.026
  const scarf = (geo: THREE.BufferGeometry, rTop: number) => {
    geo.rotateX(Math.PI / 2)
    const p = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      const t = (z + hoodLen / 2) / hoodLen
      p.setZ(i, z + t * (p.getY(i) / rTop) * 0.008)
    }
    geo.computeVertexNormals()
    return geo
  }
  g.add(mesh(scarf(new THREE.CylinderGeometry(0.0225, 0.0195, hoodLen, 36, 3, true), 0.0225), mat.anodized, 'sunshade', [0, cy, 0.052]))
  g.add(mesh(scarf(new THREE.CylinderGeometry(0.0215, 0.0187, hoodLen, 36, 3, true), 0.0215), loc.baffle, 'sunshade-inner', [0, cy, 0.052]))
  const lip = scarf(new THREE.CylinderGeometry(0.0232, 0.0232, 0.0016, 36, 1, true), 0.0232)
  lip.translate(0, 0, hoodLen / 2)
  g.add(mesh(lip, mat.aluminium, 'sunshade-lip', [0, cy, 0.052]))
  const vanes: V3[] = [[0, cy, 0.044], [0, cy, 0.052]]
  g.add(instances(new THREE.TorusGeometry(0.0195, 0.0011, 4, 32), vanes, loc.baffle, 'sunshade-vanes'))
  g.add(cyl(0.0175, 0.0175, 0.002, mat.lens, 'lens-glass', 'z', [0, cy, 0.0372], 32))
  g.add(mesh(new THREE.TorusGeometry(0.0128, 0.0012, 6, 32), mat.glass, 'lens-coating', [0, cy, 0.0382]))
  return finish('inst-camera', g, foot)
}

/** Neutron spectrometer, Mini-NS-type: 1.8U. Eight elpasolite tiles in a frame, photomultipliers behind. */
function buildNeutron() {
  const g = group('inst-neutron-asm')
  const base = rbox(0.2, 0.005, 0.1, 0.004, mat.aluminium, 'base-plate', [0, 0.0025, 0])
  g.add(base)
  const cols = [-0.072, -0.024, 0.024, 0.072]
  const rows = [0.028, 0.07]
  const front = 0.049
  // Detector tiles: aluminium can with a clear crystal face and a reflector edge
  const cans: V3[] = []
  const faces: V3[] = []
  for (const x of cols)
    for (const y of rows) {
      cans.push([x, y, front - 0.009])
      faces.push([x, y, front + 0.0004])
    }
  g.add(instances(new THREE.BoxGeometry(0.043, 0.037, 0.018), cans, mat.aluminium, 'tile-cans'))
  g.add(instances(new THREE.BoxGeometry(0.038, 0.032, 0.002), faces.map(([x, y, z]) => [x, y, z - 0.0006] as V3), loc.tape, 'tile-reflectors'))
  // Crystal: a chamfered prism, so its edges catch the light
  const cr = new THREE.CylinderGeometry(0.0205, 0.0235, 0.006, 4, 1)
  cr.rotateY(Math.PI / 4)
  cr.rotateX(Math.PI / 2)
  cr.scale(1, 0.84, 1)
  const crystal = cr.toNonIndexed()
  crystal.computeVertexNormals()
  g.add(instances(crystal, faces.map(([x, y, z]) => [x, y, z + 0.0026] as V3), loc.crystal, 'tile-crystals'))
  // Front bezel: grid over the tile edges
  const bez = new Batch()
  for (const y of [0.007, 0.049, 0.091]) bez.add(xf(new THREE.BoxGeometry(0.2, 0.004, 0.005), [0, y, front + 0.002]), mat.anodized)
  for (const x of [-0.098, -0.048, 0, 0.048, 0.098]) bez.add(xf(new THREE.BoxGeometry(0.004, 0.088, 0.005), [x, 0.049, front + 0.002]), mat.anodized)
  const bolts: V3[] = []
  for (const x of [-0.098, -0.048, 0, 0.048, 0.098]) for (const y of [0.007, 0.049, 0.091]) bolts.push([x, y, front + 0.0052])
  const bolt = new THREE.CylinderGeometry(0.0019, 0.0019, 0.0016, 8)
  bolt.rotateX(Math.PI / 2)
  bez.add(xf(instances(bolt, bolts, mat.solder, 'tmp').geometry), mat.solder)
  g.add(bez.build('bezel'))
  // Open cage: corner posts and rails so the photomultipliers show
  const cage = new Batch()
  for (const x of [-0.098, 0.098]) for (const z of [-0.02, 0.031]) cage.add(xf(new THREE.BoxGeometry(0.006, 0.086, 0.006), [x, 0.048, z]), mat.aluminium)
  for (const y of [0.088]) for (const x of [-0.048, 0, 0.048]) cage.add(xf(new THREE.BoxGeometry(0.004, 0.004, 0.054), [x, y, 0.006]), mat.aluminium)
  for (const z of [-0.02, 0.031]) cage.add(xf(new THREE.BoxGeometry(0.2, 0.005, 0.006), [0, 0.088, z]), mat.aluminium)
  for (const x of [-0.098, 0.098]) cage.add(strutGeo([x, 0.01, -0.02], [x, 0.085, 0.031], 0.0018, 4, true), mat.aluminium)
  g.add(cage.build('cage'))
  // Photomultiplier tubes: mu-metal shield, glass neck, socket and pins
  const pmts = new Batch()
  for (const x of cols)
    for (const y of rows) {
      pmts.add(xf(new THREE.CylinderGeometry(0.0135, 0.0135, 0.032, 24), [x, y, 0.016], [Math.PI / 2, 0, 0]), mat.aluminiumDark)
      pmts.add(xf(new THREE.CylinderGeometry(0.0145, 0.0145, 0.003, 24), [x, y, 0.0285], [Math.PI / 2, 0, 0]), mat.aluminium)
      pmts.add(xf(new THREE.CylinderGeometry(0.011, 0.0125, 0.008, 20), [x, y, -0.004], [Math.PI / 2, 0, 0]), loc.pmtGlass)
      pmts.add(xf(new THREE.CylinderGeometry(0.0115, 0.0115, 0.008, 20), [x, y, -0.012], [Math.PI / 2, 0, 0]), mat.anodized)
    }
  g.add(pmts.build('pmts'))
  // Signal wires from each socket into the electronics box
  cols.forEach((x, i) =>
    rows.forEach((y, j) => g.add(cable([[x, y - 0.006, -0.016], [x + 0.004, y - 0.012, -0.019], [x + 0.008, y - 0.01, -0.023]], 0.0012, j ? mat.copper : mat.rubber, `pmt-wire-${i}-${j}`, 8, 4))),
  )
  // Electronics box at the back
  g.add(rbox(0.2, 0.084, 0.026, 0.004, mat.anodized, 'electronics', [0, 0.005 + 0.042, -0.037]))
  const ribs: V3[] = []
  for (let i = 0; i < 9; i++) ribs.push([-0.08 + i * 0.02, 0.047, -0.0505])
  g.add(instances(new THREE.BoxGeometry(0.0025, 0.07, 0.003), ribs, mat.anodized, 'electronics-ribs'))
  g.add(connector('conn-power', 0.018, [-0.05, 0.05, -0.051], Math.PI))
  g.add(connector('conn-data', 0.024, [0.05, 0.05, -0.051], Math.PI))
  g.add(labelPlate('label', 0.06, 0.02, [0, 0.0895, -0.037], 0))
  g.children.at(-1)!.rotation.set(-Math.PI / 2, 0, 0)
  return finish('inst-neutron', g, base)
}

/* ================================================================== ground stations */

interface DishOpts {
  name: string
  R: number
  depth: number
  bands: number
  ribs: number
  ribDepth: number
  truss: boolean
  feed: 'prime' | 'cassegrain'
  hubR: number
  seg?: number
}

/** Parabolic reflector facing +Y, vertex at the origin, with its back structure and feed */
function dishAssembly(o: DishOpts) {
  const g = group(`${o.name}-reflector`)
  const { R, depth } = o
  const seg = o.seg ?? 48
  const h = (r: number) => (r * r) / (R * R) * depth
  const f = (R * R) / (4 * depth)

  // Surface panels in alternating rings, seams and a rolled rim
  const surf = new Batch()
  for (let i = 0; i < o.bands; i++) {
    const r0 = Math.max(o.hubR * 0.6, (R * i) / o.bands)
    const r1 = (R * (i + 1)) / o.bands
    const pts: THREE.Vector2[] = []
    for (let k = 0; k <= 4; k++) {
      const r = r0 + ((r1 - r0) * k) / 4
      pts.push(new THREE.Vector2(r, h(r)))
    }
    surf.add(new THREE.LatheGeometry(pts, seg), i % 2 ? loc.dishAlt : mat.dish)
  }
  g.add(surf.build(`${o.name}-surface`))
  const seams = new Batch()
  for (let i = 1; i < o.bands; i++) {
    const r = (R * i) / o.bands
    seams.add(xf(new THREE.TorusGeometry(r, R * 0.0025, 4, seg), [0, h(r) + R * 0.002, 0], [Math.PI / 2, 0, 0]), loc.seam)
  }
  for (let k = 0; k < o.ribs; k += o.ribs > 16 ? 2 : 1) {
    const a = (k / o.ribs) * Math.PI * 2
    const pts: V3[] = []
    for (let s = 0; s <= 6; s++) {
      const r = o.hubR * 0.6 + ((R - o.hubR * 0.6) * s) / 6
      pts.push([Math.cos(a) * r, h(r) + R * 0.002, Math.sin(a) * r])
    }
    for (let s = 0; s < 6; s++) seams.add(strutGeo(pts[s], pts[s + 1], R * 0.0016, 3, true), loc.seam)
  }
  seams.add(xf(new THREE.TorusGeometry(R, R * 0.012, 6, seg), [0, depth, 0], [Math.PI / 2, 0, 0]), mat.aluminium)
  g.add(seams.build(`${o.name}-seams`))

  // Back structure: radial ribs (plates or trusses) and hoops
  const back = new Batch()
  const bottom = (r: number) => -o.ribDepth + ((r - o.hubR) / (R - o.hubR)) * (h(R) - R * 0.03 + o.ribDepth)
  const ribM = o.truss ? mat.panel : loc.steel
  for (let k = 0; k < o.ribs; k++) {
    const a = (k / o.ribs) * Math.PI * 2
    const P = (r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r]
    if (!o.truss) {
      const s = new THREE.Shape()
      s.moveTo(o.hubR, bottom(o.hubR))
      for (let i = 0; i <= 8; i++) {
        const r = o.hubR + ((R - o.hubR) * i) / 8
        s.lineTo(r, h(r) - R * 0.004)
      }
      s.lineTo(R, bottom(R))
      s.lineTo(o.hubR, bottom(o.hubR))
      const t = R * 0.012
      const eg = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false })
      eg.translate(0, 0, -t / 2)
      eg.rotateY(-a)
      back.add(eg, ribM)
    } else {
      const n = 7
      const tr = R * 0.006
      for (let i = 0; i < n; i++) {
        const r0 = o.hubR + ((R - o.hubR) * i) / n
        const r1 = o.hubR + ((R - o.hubR) * (i + 1)) / n
        const t0 = P(r0, h(r0) - tr * 1.5)
        const t1 = P(r1, h(r1) - tr * 1.5)
        const b0 = P(r0, bottom(r0))
        const b1 = P(r1, bottom(r1))
        back.add(strutGeo(t0, t1, tr, 4, true), ribM)
        back.add(strutGeo(b0, b1, tr, 4, true), ribM)
        back.add(strutGeo(b0, t0, tr * 0.7, 4, true), ribM)
        back.add(strutGeo(i % 2 ? b0 : t0, i % 2 ? t1 : b1, tr * 0.6, 4, true), ribM)
      }
    }
  }
  // Hoops tying the ribs together, polygonal like the real steelwork
  const hoopRs = [0.35, 0.62, 0.9].map((t) => o.hubR + (R - o.hubR) * t)
  for (const r of hoopRs) {
    for (let k = 0; k < o.ribs; k++) {
      const a0 = (k / o.ribs) * Math.PI * 2
      const a1 = ((k + 1) / o.ribs) * Math.PI * 2
      const y = bottom(r) + (o.truss ? 0 : R * 0.01)
      back.add(strutGeo([Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], R * 0.006, 4, true), loc.steel)
    }
  }
  // Central hub
  back.add(xf(new THREE.CylinderGeometry(o.hubR, o.hubR * 0.9, o.ribDepth * 1.05, 24), [0, -o.ribDepth * 0.5, 0]), mat.panel)
  back.add(xf(new THREE.CylinderGeometry(o.hubR * 1.08, o.hubR * 1.08, R * 0.01, 24), [0, -o.ribDepth * 1.05, 0]), loc.steel)
  g.add(back.build(`${o.name}-backstructure`))

  // Feed
  const feed = new Batch()
  if (o.feed === 'prime') {
    const fy = f
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      const r = R * 0.92
      feed.add(strutGeo([Math.cos(a) * r, h(r), Math.sin(a) * r], [Math.cos(a) * R * 0.05, fy + R * 0.06, Math.sin(a) * R * 0.05], R * 0.012, 6), loc.steel)
    }
    feed.add(xf(new THREE.CylinderGeometry(R * 0.065, R * 0.065, R * 0.12, 16), [0, fy + R * 0.08, 0]), mat.panel)
    feed.add(new THREE.LatheGeometry([[R * 0.03, 0], [R * 0.055, -R * 0.06], [R * 0.06, -R * 0.065]].map(([r, y]) => new THREE.Vector2(r, y)), 20).translate(0, fy + R * 0.02, 0), mat.aluminium)
    feed.add(xf(new THREE.BoxGeometry(R * 0.05, R * 0.06, R * 0.07), [R * 0.07, fy + R * 0.09, 0]), mat.aluminiumDark)
  } else {
    // Cassegrain: feed cone at the centre, convex subreflector on a quadripod
    const sy = f * 0.9
    const subR = R * 0.09
    feed.add(new THREE.LatheGeometry([[o.hubR * 0.8, 0], [o.hubR * 0.6, depth * 0.55], [o.hubR * 0.35, depth * 0.62], [o.hubR * 0.25, depth * 0.62]].map(([r, y]) => new THREE.Vector2(r, y)), 24), mat.panel)
    const sub = dishGeometry(subR, subR * 0.22, 32)
    sub.rotateX(Math.PI)
    sub.translate(0, sy, 0)
    feed.add(sub, mat.aluminium)
    feed.add(xf(new THREE.CylinderGeometry(subR * 1.02, subR * 0.6, subR * 0.35, 24), [0, sy + subR * 0.2, 0]), mat.panel)
    feed.add(xf(new THREE.BoxGeometry(subR * 0.6, subR * 0.5, subR * 0.6), [0, sy + subR * 0.6, 0]), mat.aluminiumDark)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4
      const r = R * 0.58
      const top: V3 = [Math.cos(a) * subR * 0.9, sy + subR * 0.25, Math.sin(a) * subR * 0.9]
      feed.add(strutGeo([Math.cos(a) * r, h(r), Math.sin(a) * r], top, R * 0.012, 4, true), mat.panel)
      // Bracing between legs near the apex
      const b = (k + 1) / 4 * Math.PI * 2 + Math.PI / 4
      const t = 0.75
      const p0: V3 = [Math.cos(a) * (r + (subR * 0.9 - r) * t), h(r) + (top[1] - h(r)) * t, Math.sin(a) * (r + (subR * 0.9 - r) * t)]
      const p1: V3 = [Math.cos(b) * (r + (subR * 0.9 - r) * t), p0[1], Math.sin(b) * (r + (subR * 0.9 - r) * t)]
      feed.add(strutGeo(p0, p1, R * 0.005, 4, true), loc.steel)
    }
  }
  g.add(feed.build(`${o.name}-feed`))
  return g
}

/** A stair flight rising along +Z from the origin; railings on both sides */
function stairFlight(name: string, rise: number, run: number, width: number, pos: V3, yaw = 0) {
  const b = new Batch()
  const n = Math.max(3, Math.round(rise / 0.2))
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    b.add(xf(new THREE.BoxGeometry(width, 0.04, (run / n) * 1.15), [0, t * rise, t * run]), loc.grating)
  }
  for (const sx of [-1, 1]) {
    const x = (sx * width) / 2
    b.add(strutGeo([x, -0.1, 0], [x, rise - 0.05, run], 0.06, 4, true), loc.steel)
    b.add(strutGeo([x, 1.0, 0], [x, rise + 1.0, run], 0.025, 6), loc.railing)
    b.add(strutGeo([x, 0.5, 0], [x, rise + 0.5, run], 0.015, 6), loc.railing)
    for (let i = 0; i <= 3; i++) {
      const t = i / 3
      b.add(strutGeo([x, t * rise, t * run], [x, t * rise + 1.0, t * run], 0.025, 6), loc.railing)
    }
  }
  const g = b.build(name)
  g.position.set(...pos)
  g.rotation.y = yaw
  return g
}

/** Circular railing round a platform edge */
function ringRailing(name: string, r: number, y: number, posts = 24, gapFrom = -1, gapTo = -1) {
  const b = new Batch()
  for (let k = 0; k < posts; k++) {
    const a0 = (k / posts) * Math.PI * 2
    const a1 = ((k + 1) / posts) * Math.PI * 2
    if (k >= gapFrom && k < gapTo) continue
    const p = (a: number, yy: number): V3 => [Math.cos(a) * r, yy, Math.sin(a) * r]
    b.add(strutGeo(p(a0, y), p(a0, y + 1.05), 0.025, 6), loc.railing)
    b.add(strutGeo(p(a0, y + 1.05), p(a1, y + 1.05), 0.025, 6), loc.railing)
    b.add(strutGeo(p(a0, y + 0.55), p(a1, y + 0.55), 0.015, 6), loc.railing)
    if (k + 1 === gapFrom || k + 1 === posts) b.add(strutGeo(p(a1, y), p(a1, y + 1.05), 0.025, 6), loc.railing)
  }
  return b.build(name)
}

/** Simple equipment shelter: corrugated walls, door, AC unit, status lamp; door faces +Z */
function shelter(name: string, w: number, h: number, d: number, pos: V3, yaw = 0) {
  const g = group(name)
  g.add(rbox(w, h, d, 0.06, mat.panel, `${name}-walls`, [0, h / 2, 0]))
  const ribs: V3[] = []
  for (let x = -w / 2 + 0.15; x < w / 2 - 0.1; x += 0.18) ribs.push([x, h / 2, -d / 2 - 0.01])
  for (let z = -d / 2 + 0.15; z < d / 2 - 0.1; z += 0.18) ribs.push([w / 2 + 0.01, h / 2, z], [-w / 2 - 0.01, h / 2, z])
  const rib = new THREE.BoxGeometry(0.05, h * 0.92, 0.05)
  g.add(instances(rib, ribs, mat.panel, `${name}-corrugation`))
  g.add(box(w + 0.3, 0.08, d + 0.3, mat.aluminiumDark, `${name}-roof`, [0, h + 0.04, 0], [0.04, 0, 0]))
  g.add(box(0.9, 2.0, 0.06, mat.aluminiumDark, `${name}-door`, [-w * 0.18, 1.02, d / 2 + 0.02]))
  g.add(box(0.04, 0.2, 0.06, mat.aluminium, `${name}-door-handle`, [-w * 0.18 + 0.33, 1.0, d / 2 + 0.07]))
  g.add(box(0.12, 0.06, 0.06, mat.ledGreen, `${name}-lamp`, [-w * 0.18, 2.18, d / 2 + 0.04]))
  // Louvred vent
  const louv: V3[] = []
  for (let i = 0; i < 5; i++) louv.push([w * 0.22, 1.5 + i * 0.09, d / 2 + 0.03])
  g.add(box(0.6, 0.5, 0.03, mat.aluminiumDark, `${name}-vent`, [w * 0.22, 1.68, d / 2 + 0.015]))
  g.add(instances(new THREE.BoxGeometry(0.56, 0.03, 0.05), louv, mat.aluminium, `${name}-louvres`, louv.map(() => [0.5, 0, 0] as V3)))
  // AC unit on the side wall with a fan grille
  g.add(rbox(0.35, 0.6, 0.75, 0.04, mat.ceramic, `${name}-ac`, [w / 2 + 0.2, 1.2, 0]))
  g.add(mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 24), mat.aluminiumDark, `${name}-ac-grille`, [w / 2 + 0.38, 1.2, 0], [0, Math.PI / 2, 0]))
  g.add(cyl(0.2, 0.2, 0.02, mat.anodized, `${name}-ac-fan`, 'x', [w / 2 + 0.37, 1.2, 0], 20))
  g.position.set(...pos)
  g.rotation.y = yaw
  return g
}

/** Pivot angle for a dish pointing toward +Z at `elev` degrees above the horizon (0 = parked at zenith) */
const tilt = (elev: number) => ((90 - elev) * Math.PI) / 180

/** Team's own 4 m dish on a university rooftop, on a ballasted non-penetrating mount */
function buildGroundSmall() {
  const ELEV = 30
  const g = group('ground-small-asm')
  const roofTop = 0.32
  const slab = box(10, 0.3, 8, mat.concrete, 'roof-slab', [0, 0.15, 0])
  g.add(slab)
  g.add(box(9.5, 0.02, 7.5, loc.roof, 'roof-membrane', [0, 0.31, 0]))
  // Top storey of the university building below, so it reads as a rooftop
  const st = 2.2
  const bld = new Batch()
  bld.add(xf(new THREE.BoxGeometry(9.8, st, 7.8), [0, -st / 2, 0]), loc.brick)
  bld.add(xf(new THREE.BoxGeometry(10.1, 0.25, 8.1), [0, -0.12, 0]), mat.concrete)
  bld.add(xf(new THREE.BoxGeometry(10.1, 0.2, 8.1), [0, -st + 0.1, 0]), mat.concrete)
  for (let x = -4.0; x <= 4.01; x += 1.6) {
    bld.add(xf(new THREE.BoxGeometry(1.0, 0.95, 0.08), [x, -st / 2 + 0.05, 3.92]), loc.window)
    bld.add(xf(new THREE.BoxGeometry(1.2, 0.1, 0.2), [x, -st / 2 - 0.47, 3.95]), mat.concrete)
  }
  for (let z = -2.8; z <= 2.81; z += 1.4) {
    bld.add(xf(new THREE.BoxGeometry(0.08, 0.95, 0.9), [4.92, -st / 2 + 0.05, z]), loc.window)
    bld.add(xf(new THREE.BoxGeometry(0.2, 0.1, 1.1), [4.95, -st / 2 - 0.47, z]), mat.concrete)
    bld.add(xf(new THREE.BoxGeometry(0.08, 0.95, 0.9), [-4.92, -st / 2 + 0.05, z]), loc.window)
  }
  g.add(bld.build('building'))
  // Parapet with metal coping
  const par = new Batch()
  for (const [w, d, x, z] of [
    [10, 0.25, 0, -3.875],
    [10, 0.25, 0, 3.875],
    [0.25, 8, -4.875, 0],
    [0.25, 8, 4.875, 0],
  ] as const) {
    par.add(xf(new THREE.BoxGeometry(w, 0.6, d), [x, roofTop + 0.3, z]), mat.concrete)
    par.add(xf(new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.08), [x, roofTop + 0.625, z]), mat.aluminium)
  }
  g.add(par.build('parapet'))
  // Roof hatch and a vent stack, rooftop flavour
  g.add(rbox(1.0, 0.45, 1.0, 0.05, mat.aluminiumDark, 'roof-hatch', [-3.6, roofTop + 0.22, 2.6]))
  g.add(cyl(0.15, 0.15, 0.9, mat.aluminium, 'vent-stack', 'y', [3.9, roofTop + 0.45, -3.0], 16))
  g.add(cyl(0.24, 0.24, 0.12, mat.aluminium, 'vent-cap', 'y', [3.9, roofTop + 0.95, -3.0], 16))

  // Equipment shed
  g.add(shelter('shed', 2.6, 2.3, 2.0, [-2.8, roofTop, -2.2], 0))
  g.add(cyl(0.02, 0.02, 1.4, mat.aluminium, 'lightning-rod', 'y', [-4.0, roofTop + 3.0, -3.1], 6))

  // Ballasted mount
  const mx = 1.6
  const mz = -0.6
  const mount = new Batch()
  for (const s of [-1, 1]) {
    mount.add(xf(new THREE.BoxGeometry(2.8, 0.15, 0.15), [mx, roofTop + 0.075, mz + s * 1.3]), loc.steel)
    mount.add(xf(new THREE.BoxGeometry(0.15, 0.15, 2.8), [mx + s * 1.3, roofTop + 0.075, mz]), loc.steel)
    mount.add(xf(new THREE.BoxGeometry(3.6, 0.12, 0.12), [mx, roofTop + 0.08, mz]), loc.steel)
  }
  mount.add(xf(new THREE.BoxGeometry(0.12, 0.12, 3.6), [mx, roofTop + 0.08, mz]), loc.steel)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mount.add(xf(new THREE.BoxGeometry(0.6, 0.32, 0.6), [mx + sx * 1.3, roofTop + 0.31, mz + sz * 1.3]), mat.concrete)
  g.add(mount.build('ballast-mount'))
  // Pedestal with gussets
  const ped = new Batch()
  const py0 = roofTop + 0.15
  ped.add(xf(new THREE.BoxGeometry(0.8, 0.04, 0.8), [mx, py0 + 0.02, mz]), loc.steel)
  ped.add(xf(new THREE.CylinderGeometry(0.2, 0.24, 1.6, 24), [mx, py0 + 0.8, mz]), mat.panel)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(0.28, 0)
    s.lineTo(0, 0.45)
    s.lineTo(0, 0)
    const eg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false })
    eg.translate(0.2, 0.04, -0.015)
    eg.rotateY(a)
    eg.translate(mx, py0, mz)
    ped.add(eg, mat.panel)
  }
  g.add(ped.build('pedestal'))
  // Azimuth head and yoke
  const axleY = py0 + 2.85
  g.add(rbox(0.7, 0.5, 0.7, 0.08, mat.panel, 'az-head', [mx, py0 + 1.85, mz]))
  g.add(rbox(0.3, 0.3, 0.4, 0.05, mat.aluminiumDark, 'az-motor', [mx + 0.45, py0 + 1.8, mz - 0.1]))
  for (const sx of [-1, 1]) {
    g.add(box(0.1, 0.8, 0.36, mat.panel, `yoke-${sx > 0 ? 'r' : 'l'}`, [mx + sx * 0.45, axleY - 0.32, mz]))
    g.add(cyl(0.13, 0.13, 0.14, mat.aluminiumDark, `el-bearing-${sx > 0 ? 'r' : 'l'}`, 'x', [mx + sx * 0.45, axleY, mz], 20))
  }
  g.add(box(1.0, 0.1, 0.36, mat.panel, 'yoke-base', [mx, py0 + 2.1, mz]))
  // Elevation pivot with the reflector
  const pivot = group('pivot_elevation')
  pivot.position.set(mx, axleY, mz)
  pivot.add(cyl(0.07, 0.07, 1.04, mat.aluminium, 'el-axle', 'x', [0, 0, 0], 16))
  pivot.add(box(0.7, 0.36, 0.3, mat.panel, 'dish-mount', [0, 0.16, 0]))
  pivot.add(rbox(0.22, 0.26, 0.28, 0.04, mat.aluminiumDark, 'el-motor', [0.2, -0.05, -0.25]))
  const dish = dishAssembly({ name: 'dish', R: 2.0, depth: 0.62, bands: 4, ribs: 12, ribDepth: 0.22, truss: false, feed: 'prime', hubR: 0.26, seg: 48 })
  dish.position.y = 0.42
  pivot.add(dish)
  pivot.rotation.x = tilt(ELEV)
  pivot.userData.stowed = [0, 0, 0]
  g.add(pivot)
  // Cable tray from the shed to the pedestal, with a coax run
  const tray = new Batch()
  const trayPts: V3[] = [[-1.5, roofTop + 0.35, -2.2], [0.6, roofTop + 0.35, -2.2], [0.6, roofTop + 0.35, -0.6]]
  for (let i = 0; i < trayPts.length - 1; i++) tray.add(strutGeo(trayPts[i], trayPts[i + 1], 0.08, 4, true), mat.aluminium)
  for (const p of [[-1.0, -2.2], [0.0, -2.2], [0.6, -1.4]]) tray.add(xf(new THREE.BoxGeometry(0.06, 0.32, 0.06), [p[0], roofTop + 0.16, p[1]]), loc.steel)
  g.add(tray.build('cable-tray'))
  g.add(cable([[0.6, roofTop + 0.45, -0.6], [1.0, roofTop + 0.6, -0.6], [mx - 0.25, py0 + 0.6, mz]], 0.04, mat.rubber, 'coax', 12, 6))
  g.add(scaleFigure([-0.9, roofTop, 1.6], -0.5))
  return finish('ground-small', g, slab)
}

/** Partner 21 m dish: steel pedestal, yoke, counterweight, Cassegrain optics, access stairs */
function buildGroundMedium() {
  const ELEV = 35
  const g = group('ground-medium-asm')
  const padTop = 0.3
  const pad = box(26, 0.3, 26, loc.grass, 'site-pad', [0, 0.15, 0])
  g.add(pad)
  g.add(box(26, 1.2, 26, loc.soil, 'site-soil', [0, -0.6, 0]))
  g.add(box(1.6, 0.04, 6.0, mat.concrete, 'path-stairs', [-3.0, 0.32, -9.6]))
  g.add(box(6.0, 0.04, 1.6, mat.concrete, 'path-shelter', [3.0, 0.32, -7.5]))
  g.add(box(4.6, 0.04, 6.0, mat.concrete, 'shelter-slab', [8.0, 0.32, -7.5]))
  g.add(cyl(6.8, 7.0, 0.6, mat.concrete, 'foundation', 'y', [0, padTop + 0.3, 0], 48))
  const pedTop = 8.4
  g.add(lathe([[2.9, padTop + 0.6], [2.8, padTop + 1.2], [2.35, pedTop - 0.4], [2.35, pedTop]], mat.panel, 'pedestal', [0, 0, 0], 40))
  const seams = new Batch()
  for (const y of [3.0, 5.6]) {
    const r = 2.8 - ((y - 1.2) / (pedTop - 1.6)) * 0.45
    seams.add(xf(new THREE.TorusGeometry(r + 0.01, 0.04, 4, 40), [0, y, 0], [Math.PI / 2, 0, 0]), mat.aluminiumDark)
  }
  g.add(seams.build('pedestal-seams'))
  g.add(rbox(1.0, 2.1, 0.2, 0.05, mat.aluminiumDark, 'pedestal-door', [0, padTop + 0.6 + 1.05, -2.8]))
  // Azimuth bearing with gear teeth, platform and railing
  g.add(cyl(2.6, 2.6, 0.5, mat.aluminiumDark, 'az-bearing', 'y', [0, pedTop + 0.25, 0], 48))
  const teeth: V3[] = []
  const trot: V3[] = []
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2
    teeth.push([Math.cos(a) * 2.63, pedTop + 0.25, Math.sin(a) * 2.63])
    trot.push([0, -a, 0])
  }
  g.add(instances(new THREE.BoxGeometry(0.12, 0.4, 0.1), teeth, mat.aluminium, 'az-gear', trot))
  const platY = pedTop + 0.5
  g.add(cyl(3.7, 3.7, 0.12, loc.grating, 'platform', 'y', [0, platY - 0.06, 0], 48))
  g.add(ringRailing('platform-railing', 3.6, platY, 28, 18, 20))
  // Alidade: base and two yoke towers
  const axleY = 14.6
  g.add(rbox(5.8, 1.3, 3.4, 0.15, mat.panel, 'alidade-base', [0, platY + 0.65, 0]))
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape()
    s.moveTo(-1.7, 0)
    s.lineTo(1.7, 0)
    s.lineTo(0.9, axleY - platY - 1.3)
    s.quadraticCurveTo(0, axleY - platY - 0.4, -0.9, axleY - platY - 1.3)
    s.lineTo(-1.7, 0)
    const eg = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 })
    eg.translate(0, 0, -0.25)
    eg.rotateY(Math.PI / 2)
    g.add(mesh(eg, mat.panel, `yoke-tower-${sx > 0 ? 'r' : 'l'}`, [sx * 2.65, platY + 1.3, 0]))
    g.add(cyl(0.75, 0.75, 0.9, mat.aluminiumDark, `el-bearing-${sx > 0 ? 'r' : 'l'}`, 'x', [sx * 2.65, axleY, 0], 24))
    g.add(rbox(0.5, 1.0, 0.9, 0.08, mat.aluminiumDark, `el-drive-${sx > 0 ? 'r' : 'l'}`, [sx * 3.15, axleY - 2.0, -0.6]))
  }
  // Elevation pivot: reflector, hub housing, counterweight
  const pivot = group('pivot_elevation')
  pivot.position.set(0, axleY, 0)
  pivot.add(cyl(0.45, 0.45, 5.8, mat.panel, 'torque-tube', 'x', [0, 0, 0], 24))
  pivot.add(rbox(2.4, 3.6, 2.4, 0.2, mat.panel, 'hub-housing', [0, 1.6, 0]))
  pivot.add(box(3.0, 2.2, 1.8, loc.steel, 'counterweight', [0, 0.4, -5.0]))
  pivot.add(box(3.1, 0.2, 1.9, mat.aluminiumDark, 'counterweight-cap', [0, 1.55, -5.0]))
  for (const sx of [-1, 1]) {
    pivot.add(strut([sx * 1.2, 0, 0], [sx * 1.2, 0.4, -4.1], 0.18, mat.panel, `cw-arm-${sx > 0 ? 'r' : 'l'}`, 4, true))
    pivot.add(strut([sx * 1.2, 2.4, 0.4], [sx * 1.2, 1.0, -4.1], 0.12, mat.panel, `cw-brace-${sx > 0 ? 'r' : 'l'}`, 4, true))
  }
  const dish = dishAssembly({ name: 'dish', R: 10.5, depth: 3.28, bands: 6, ribs: 24, ribDepth: 2.0, truss: true, feed: 'cassegrain', hubR: 1.3, seg: 64 })
  dish.position.y = 3.5
  pivot.add(dish)
  pivot.rotation.x = tilt(ELEV)
  pivot.userData.stowed = [0, 0, 0]
  g.add(pivot)
  // Access stairs at the back: two flights and a landing
  const sx = -3.0
  g.add(stairFlight('stairs-lower', 4.15, 4.2, 1.0, [sx, padTop, -11.4], 0))
  const landY = padTop + 4.15
  g.add(box(1.2, 0.12, 1.4, loc.grating, 'landing', [sx, landY - 0.06, -6.5]))
  const land = new Batch()
  for (const dx of [-0.55, 0.55]) for (const dz of [-7.1, -5.9]) land.add(strutGeo([sx + dx, padTop, dz], [sx + dx, landY, dz], 0.06, 4, true), loc.steel)
  g.add(land.build('landing-posts'))
  g.add(stairFlight('stairs-upper', platY - landY, 4.0, 1.0, [sx, landY, -5.8], 0))
  // Equipment shelter and a waveguide trench cover
  g.add(shelter('shelter', 4.2, 2.8, 3.0, [8.0, padTop, -7.5], -Math.PI / 2))
  g.add(box(5.0, 0.08, 0.5, mat.aluminiumDark, 'trench-cover', [4.5, padTop + 0.04, -4.0], [0, -0.5, 0]))
  g.add(scaleFigure([-1.4, padTop, -11.6], 0.4))
  return finish('ground-medium', g, pad)
}

/** Deep space 34 m beam-waveguide dish: building base, wheel-and-track alidade, huge back truss */
function buildGroundDsn() {
  const ELEV = 45
  const g = group('ground-dsn-asm')
  const site = box(34, 0.3, 34, loc.sand, 'site', [0, 0.15, 0])
  g.add(site)
  g.add(box(34, 1.6, 34, loc.soil, 'site-soil', [0, -0.8, 0]))
  g.add(box(6, 0.04, 5.2, loc.asphalt, 'road', [-6, 0.32, 14.4]))
  g.add(box(26, 0.04, 2.0, mat.concrete, 'apron', [0, 0.32, 10.9]))
  const gy = 0.3
  // Building base (pedestal room and equipment floors)
  const bh = 5.2
  g.add(rbox(22, bh, 19.6, 0.3, mat.panel, 'building', [0, gy + bh / 2, 0]))
  g.add(box(22.4, 0.4, 20.0, mat.aluminiumDark, 'building-coping', [0, gy + bh + 0.1, 0]))
  const win = new Batch()
  for (const z of [-9.82, 9.82]) win.add(xf(new THREE.BoxGeometry(19, 1.1, 0.06), [0, gy + 3.3, z]), loc.window)
  for (const x of [-11.02, 11.02]) win.add(xf(new THREE.BoxGeometry(0.06, 1.1, 16), [x, gy + 3.3, 0]), loc.window)
  for (let x = -9; x <= 9; x += 2.25) win.add(xf(new THREE.BoxGeometry(0.15, 1.2, 0.12), [x, gy + 3.3, 9.85]), mat.aluminium)
  win.add(xf(new THREE.BoxGeometry(3.2, 2.4, 0.1), [-6, gy + 1.2, 9.83]), mat.aluminiumDark)
  win.add(xf(new THREE.BoxGeometry(3.6, 0.15, 1.6), [-6, gy + 2.55, 10.6]), mat.aluminium)
  win.add(xf(new THREE.BoxGeometry(0.3, 0.12, 0.08), [-6, gy + 2.75, 9.87]), mat.ledAmber)
  g.add(win.build('facade'))
  // Roof plant
  g.add(rbox(2.0, 1.2, 1.4, 0.1, mat.ceramic, 'hvac-1', [-9.6, gy + bh + 0.9, -8.2]))
  g.add(rbox(2.0, 1.2, 1.4, 0.1, mat.ceramic, 'hvac-2', [-9.6, gy + bh + 0.9, 8.2]))
  g.add(scaleFigure([-3.0, gy, 11.6], 0.3))
  // Azimuth track on a raised concrete ring
  const roofY = gy + bh + 0.3
  g.add(cyl(9.5, 9.5, 1.0, mat.concrete, 'track-ring', 'y', [0, roofY + 0.5, 0], 64))
  g.add(mesh(new THREE.TorusGeometry(8.6, 0.22, 6, 72), mat.aluminiumDark, 'az-track', [0, roofY + 1.1, 0], [Math.PI / 2, 0, 0]))
  g.add(cyl(2.0, 2.0, 1.0, mat.concrete, 'bwg-pedestal', 'y', [0, roofY + 0.5, 0], 32))
  const trackY = roofY + 1.3
  // Alidade: four trucks on the track, a base frame and two big A-frames
  const ali = new Batch()
  const corners: [number, number][] = []
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const x = Math.cos(a) * 8.6
    const z = Math.sin(a) * 8.6
    corners.push([x, z])
    ali.add(xf(new THREE.BoxGeometry(2.6, 1.4, 1.6), [x, trackY + 0.7, z], [0, -a + Math.PI / 2, 0]), mat.panel)
    for (const s of [-0.8, 0.8]) ali.add(xf(new THREE.CylinderGeometry(0.45, 0.45, 1.8, 16), [x + Math.cos(a + Math.PI / 2) * s, trackY + 0.2, z + Math.sin(a + Math.PI / 2) * s], [0, -a, Math.PI / 2]), mat.aluminiumDark)
  }
  const fy = trackY + 1.4
  const [c0, c1, c2, c3] = corners
  for (const [a, b] of [[c0, c1], [c1, c2], [c2, c3], [c3, c0], [c0, c2], [c1, c3]] as [number, number][][])
    ali.add(strutGeo([a[0], fy + 0.4, a[1]], [b[0], fy + 0.4, b[1]], 0.45, 4, true), mat.panel)
  const axleY = 24.5
  const ax = 6.1
  for (const sx of [-1, 1]) {
    const legs: V3[] = [[sx * 6.1, fy, -6.1], [sx * 6.1, fy, 6.1]]
    const apex: V3 = [sx * ax, axleY - 1.0, 0]
    for (const l of legs) ali.add(strutGeo(l, apex, 0.55, 4, true), mat.panel)
    // Horizontal ties and diagonals in the A-frame
    for (const t of [0.33, 0.66]) {
      const yy = fy + (apex[1] - fy) * t
      const zz = 6.1 * (1 - t)
      ali.add(strutGeo([sx * 6.1, yy, -zz], [sx * 6.1, yy, zz], 0.3, 4, true), mat.panel)
    }
    ali.add(strutGeo([sx * 6.1, fy, -6.1], [sx * 6.1, fy + (apex[1] - fy) * 0.33, 6.1 * 0.67], 0.22, 4, true), mat.panel)
    ali.add(strutGeo([sx * 6.1, fy, 6.1], [sx * 6.1, fy + (apex[1] - fy) * 0.33, -6.1 * 0.67], 0.22, 4, true), mat.panel)
    ali.add(strutGeo([sx * 6.1, fy + (apex[1] - fy) * 0.33, -6.1 * 0.67], [sx * 6.1, fy + (apex[1] - fy) * 0.66, 6.1 * 0.34], 0.2, 4, true), mat.panel)
    ali.add(xf(new THREE.BoxGeometry(1.6, 2.4, 2.4), [sx * ax, axleY - 0.6, 0]), mat.panel)
    ali.add(xf(new THREE.CylinderGeometry(1.0, 1.0, 1.0, 24), [sx * (ax + 1.0), axleY, 0], [0, 0, Math.PI / 2]), mat.aluminiumDark)
    // Elevation drive pinion on its tower
    ali.add(xf(new THREE.BoxGeometry(1.2, axleY - 7.0 - fy, 1.6), [sx * 3.4, fy + (axleY - 7.0 - fy) / 2, 0]), mat.panel)
    ali.add(xf(new THREE.BoxGeometry(1.6, 1.2, 2.2), [sx * 3.4, axleY - 7.1, 0]), mat.aluminiumDark)
  }
  // Beam-waveguide shroud up the azimuth axis into the elevation room
  ali.add(xf(new THREE.CylinderGeometry(1.3, 1.3, axleY - 3.0 - fy, 24), [0, fy + (axleY - 3.0 - fy) / 2, 0]), mat.panel)
  ali.add(xf(new THREE.BoxGeometry(4.2, 3.2, 4.2), [0, axleY - 3.2, 0]), mat.panel)
  // Walkway deck and railing on the alidade
  ali.add(xf(new THREE.BoxGeometry(13.2, 0.15, 3.0), [0, fy + 0.9, 0]), loc.grating)
  for (const sz of [-1.5, 1.5]) ali.add(strutGeo([-6.6, fy + 2.0, sz], [6.6, fy + 2.0, sz], 0.04, 6), loc.railing)
  g.add(ali.build('alidade'))
  // Stairs from the roof up to the alidade deck
  g.add(stairFlight('stairs-roof', fy + 0.9 - roofY, 3.2, 1.0, [10.2, roofY, 3.5], Math.PI))
  g.add(stairFlight('stairs-ground', roofY - gy, 6.0, 1.2, [11.8, gy, 9.0], Math.PI))

  // Elevation pivot: reflector, bull-gear sectors and counterweights
  const pivot = group('pivot_elevation')
  pivot.position.set(0, axleY, 0)
  pivot.add(cyl(1.1, 1.1, ax * 2 - 1.6, mat.panel, 'el-tube', 'x', [0, 0, 0], 24))
  pivot.add(rbox(5.0, 6.8, 5.0, 0.3, mat.panel, 'el-housing', [0, 3.4, 0]))
  for (const sx of [-1, 1]) {
    const arc = new THREE.TorusGeometry(7.0, 0.35, 4, 24, Math.PI / 2)
    arc.rotateZ(-Math.PI / 2)
    arc.rotateY(Math.PI / 2)
    pivot.add(mesh(arc, loc.steel, `bull-gear-${sx > 0 ? 'r' : 'l'}`, [sx * 3.4, 0, 0]))
    pivot.add(strut([sx * 3.4, 0, 0], [sx * 3.4, -7.0, 0], 0.3, mat.panel, `gear-spoke-a-${sx > 0 ? 'r' : 'l'}`, 4, true))
    pivot.add(strut([sx * 3.4, 0, 0], [sx * 3.4, 0, 7.0], 0.3, mat.panel, `gear-spoke-b-${sx > 0 ? 'r' : 'l'}`, 4, true))
    pivot.add(strut([sx * 3.4, 0, 0], [sx * 3.4, -4.95, 4.95], 0.3, mat.panel, `gear-spoke-c-${sx > 0 ? 'r' : 'l'}`, 4, true))
    pivot.add(strut([sx * 3.4, 4.0, 2.0], [sx * 3.4, 0, 7.0], 0.25, mat.panel, `gear-brace-${sx > 0 ? 'r' : 'l'}`, 4, true))
    pivot.add(rbox(2.2, 3.2, 3.4, 0.2, loc.steel, `counterweight-${sx > 0 ? 'r' : 'l'}`, [sx * 4.4, 1.0, -9.0]))
    pivot.add(strut([sx * 2.4, 0.5, -1.0], [sx * 4.4, 1.0, -7.4], 0.35, mat.panel, `cw-arm-${sx > 0 ? 'r' : 'l'}`, 4, true))
    pivot.add(strut([sx * 2.4, 5.5, -1.5], [sx * 4.4, 2.4, -7.4], 0.25, mat.panel, `cw-brace-${sx > 0 ? 'r' : 'l'}`, 4, true))
  }
  const dish = dishAssembly({ name: 'dish', R: 17, depth: 6.2, bands: 8, ribs: 32, ribDepth: 5.0, truss: true, feed: 'cassegrain', hubR: 2.6, seg: 80 })
  dish.position.y = 7.0
  pivot.add(dish)
  pivot.rotation.x = tilt(ELEV)
  pivot.userData.stowed = [0, 0, 0]
  g.add(pivot)
  return finish('ground-dsn', g, site)
}

/* ================================================================== launch vehicles */

/** Rocket engine bell with powerhead, exit at y = 0 */
function engine(name: string, rExit: number, len: number, pos: V3) {
  const b = new Batch()
  // Bell contour from the exit (y = 0) up to the throat (y = len)
  const outer: THREE.Vector2[] = []
  const inner: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    const r = rExit * (0.3 + 0.7 * Math.sqrt(1 - t) ** 1.3)
    outer.push(new THREE.Vector2(r, len * t))
    inner.push(new THREE.Vector2(r * 0.965, len * t))
  }
  b.add(new THREE.LatheGeometry(outer, 28), loc.bell)
  b.add(new THREE.LatheGeometry(inner, 28), loc.soot)
  b.add(xf(new THREE.TorusGeometry(rExit, rExit * 0.03, 4, 24), [0, 0, 0], [Math.PI / 2, 0, 0]), mat.titanium)
  b.add(xf(new THREE.CylinderGeometry(rExit * 0.28, rExit * 0.34, len * 0.22, 16), [0, len + len * 0.1, 0]), mat.titanium)
  b.add(xf(new THREE.BoxGeometry(rExit * 0.36, len * 0.18, rExit * 0.36), [rExit * 0.3, len + len * 0.12, 0]), mat.copper)
  b.add(xf(new THREE.CylinderGeometry(rExit * 0.1, rExit * 0.1, len * 0.3, 8), [-rExit * 0.3, len + len * 0.05, 0], [0, 0, 0.3]), mat.aluminium)
  const g = b.build(name)
  g.position.set(...pos)
  return g
}

/** Ogive nose profile from radius r at y0 up to a tip at y0 + len */
function ogive(r: number, y0: number, len: number, steps = 10, tipR = 0): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    out.push([tipR + (r - tipR) * Math.sqrt(1 - t * t) ** 1.1, y0 + len * t])
  }
  return out
}

/** Medium two-stage rideshare rocket with an oversized payload fairing (about 66 m) */
function buildRideGto() {
  const g = group('ride-gto-asm')
  const R = 1.85
  const engY = 1.3
  // Nine engines: one centre, eight round it
  const engs = group('engines')
  engs.add(engine('engine-0', 0.42, engY, [0, 0, 0]))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    engs.add(engine(`engine-${k + 1}`, 0.42, engY, [Math.cos(a) * 1.18, 0, Math.sin(a) * 1.18]))
  }
  g.add(engs)
  const s1y = engY + 0.5
  g.add(cyl(R, R * 0.97, 0.5, loc.soot, 'heat-shield', 'y', [0, engY + 0.25, 0], 48))
  // First stage
  const s1len = 39
  g.add(cyl(R, R, s1len, loc.white, 'stage-1', 'y', [0, s1y + s1len / 2, 0], 48))
  const bands = new Batch()
  for (const y of [s1y + 0.4, s1y + 14, s1y + 26]) bands.add(xf(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.18, 48, 1, true), [0, y, 0]), mat.aluminiumDark)
  bands.add(xf(new THREE.CylinderGeometry(R + 0.015, R + 0.015, 2.2, 48, 1, true), [0, s1y + s1len - 4, 0]), mat.paintNavy)
  g.add(bands.build('stage-1-bands'))
  // Folded landing legs and a cable raceway
  const legs = new Batch()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    const p = (r: number, y: number): V3 => [n.x * r, y, n.z * r]
    legs.add(strutGeo(p(R + 0.14, s1y + 0.2), p(R + 0.14, s1y + 9.5), 0.2, 4, true), mat.carbon)
    legs.add(strutGeo(p(R + 0.14, s1y + 9.5), p(R + 0.06, s1y + 10.3), 0.15, 4, true), mat.carbon)
    legs.add(xf(new THREE.BoxGeometry(0.9, 0.35, 0.5), p(R + 0.25, s1y + 0.1), [0, -a, 0]), mat.aluminiumDark)
    legs.add(strutGeo(p(R + 0.36, s1y + 1.5), p(R + 0.36, s1y + 7.0), 0.06, 8), mat.aluminium)
  }
  legs.add(strutGeo([-R - 0.1, s1y + 1, 0], [-R - 0.1, s1y + s1len - 0.5, 0], 0.13, 4, true), loc.white)
  g.add(legs.build('landing-legs'))
  // Interstage with folded grid fins
  const isy = s1y + s1len
  g.add(cyl(R + 0.01, R + 0.01, 4.5, mat.carbon, 'interstage', 'y', [0, isy + 2.25, 0], 48))
  const fins = new Batch()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const fx = Math.cos(a) * (R + 0.35)
    const fz = Math.sin(a) * (R + 0.35)
    const rot: V3 = [0, -a + Math.PI / 2, 0]
    const fy = isy + 3.3
    const local = (gx: number, gy: number): V3 => [fx + Math.cos(a + Math.PI / 2) * gx, fy + gy, fz + Math.sin(a + Math.PI / 2) * gx]
    for (const gx of [-0.6, -0.3, 0, 0.3, 0.6]) fins.add(xf(new THREE.BoxGeometry(0.05, 1.5, 0.35), local(gx, 0), rot), mat.titanium)
    for (const gy of [-0.75, -0.375, 0, 0.375, 0.75]) fins.add(xf(new THREE.BoxGeometry(1.25, 0.05, 0.35), local(0, gy), rot), mat.titanium)
    fins.add(xf(new THREE.BoxGeometry(0.5, 0.6, 0.3), [Math.cos(a) * (R + 0.08), fy - 0.95, Math.sin(a) * (R + 0.08)], rot), mat.aluminiumDark)
  }
  g.add(fins.build('grid-fins'))
  // Second stage
  const s2y = isy + 4.5
  const s2len = 8
  g.add(cyl(R, R, s2len, loc.white, 'stage-2', 'y', [0, s2y + s2len / 2, 0], 48))
  g.add(cyl(R + 0.02, R + 0.02, 0.2, mat.aluminiumDark, 'stage-2-ring', 'y', [0, s2y + s2len - 0.2, 0], 48))
  // Oversized fairing: boattail, barrel, ogive
  const fy0 = s2y + s2len
  const FR = 2.6
  const prof: [number, number][] = [[0, fy0], [R, fy0], [FR, fy0 + 2.0], [FR, fy0 + 9.0], ...ogive(FR, fy0 + 9.0, 7.5, 12, 0.25).slice(1), [0, fy0 + 16.6]]
  g.add(lathe(prof, loc.white, 'fairing', [0, 0, 0], 48))
  const fd = new Batch()
  for (const sx of [-1, 1]) {
    const pts: V3[] = prof.slice(1, -1).map(([r, y]) => [sx * (r + 0.015), y, 0])
    for (let i = 0; i < pts.length - 1; i++) fd.add(strutGeo(pts[i], pts[i + 1], 0.05, 4, true), mat.aluminiumDark)
  }
  fd.add(xf(new THREE.CylinderGeometry(FR + 0.015, FR + 0.015, 0.12, 48, 1, true), [0, fy0 + 2.6, 0]), mat.aluminiumDark)
  for (const y of [fy0 + 4.5, fy0 + 6.5]) fd.add(xf(new THREE.BoxGeometry(0.5, 0.35, 0.1), [0.0, y, FR + 0.02]), mat.aluminiumDark)
  g.add(fd.build('fairing-seams'))
  return finish('ride-gto', g)
}

/** Super-heavy Moon rocket: orange core stage, two white boosters, capsule under an abort tower (about 98 m) */
function buildRideLunar() {
  const g = group('ride-lunar-asm')
  const R = 4.2
  // Core stage engines and engine section
  const engY = 3.6
  const engs = group('core-engines')
  ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => engs.add(engine(`core-engine-${i + 1}`, 1.15, engY, [sx * 1.5, 0, sz * 1.5])))
  g.add(engs)
  g.add(cyl(R * 0.98, R * 0.9, 0.5, loc.soot, 'heat-shield', 'y', [0, engY + 0.25, 0], 48))
  const coreY = engY + 0.5
  const coreLen = 64.5
  g.add(cyl(R, R, 6.5, loc.foam, 'engine-section', 'y', [0, coreY + 3.25, 0], 64))
  g.add(cyl(R + 0.03, R + 0.03, 1.2, loc.white, 'engine-skirt', 'y', [0, coreY + 0.6, 0], 64))
  g.add(cyl(R, R, coreLen - 6.5, loc.foam, 'core-tank', 'y', [0, coreY + 6.5 + (coreLen - 6.5) / 2, 0], 64))
  // Tank domes show as faint rings; the intertank is ribbed and darker
  const rings = new Batch()
  for (const y of [coreY + 8, coreY + 18, coreY + 28, coreY + 38, coreY + 55, coreY + 61])
    rings.add(xf(new THREE.CylinderGeometry(R + 0.025, R + 0.025, 0.35, 64, 1, true), [0, y, 0]), loc.foamDark)
  const itY = coreY + 44.5
  rings.add(xf(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 6.5, 64, 1, true), [0, itY, 0]), loc.foamDark)
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2
    rings.add(xf(new THREE.BoxGeometry(0.12, 6.5, 0.1), [Math.cos(a) * (R + 0.06), itY, Math.sin(a) * (R + 0.06)], [0, -a, 0]), loc.foam)
  }
  // Feedline and cable raceway down the side
  rings.add(strutGeo([0, coreY + 6.0, -R - 0.45], [0, itY - 3.2, -R - 0.45], 0.42, 12), loc.foam)
  rings.add(xf(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 12), [0, itY - 3.0, -R - 0.4]), loc.foamDark)
  for (const y of [coreY + 12, coreY + 22, coreY + 32]) rings.add(xf(new THREE.BoxGeometry(0.4, 0.4, 0.9), [0, y, -R - 0.25]), loc.foamDark)
  rings.add(strutGeo([R * 0.7, coreY + 6.5, -R * 0.72], [R * 0.7, coreY + coreLen - 1, -R * 0.72], 0.16, 4, true), loc.foamDark)
  g.add(rings.build('core-details'))
  // Upper stage adapter, upper stage, crew capsule and abort tower
  const topY = coreY + coreLen
  g.add(lathe([[0, topY], [R, topY], [R, topY + 1.2], [2.7, topY + 8.5], [0, topY + 8.5]], loc.white, 'stage-adapter', [0, 0, 0], 64))
  g.add(cyl(R + 0.03, R + 0.03, 0.3, mat.aluminiumDark, 'adapter-ring', 'y', [0, topY + 1.2, 0], 64))
  const usY = topY + 8.5
  g.add(cyl(2.7, 2.7, 2.6, mat.aluminium, 'spacecraft-adapter', 'y', [0, usY + 1.3, 0], 48))
  g.add(cyl(2.72, 2.72, 3.6, loc.white, 'service-module-fairing', 'y', [0, usY + 2.6 + 1.8, 0], 48))
  const sm = new Batch()
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    sm.add(xf(new THREE.BoxGeometry(0.08, 3.6, 0.08), [Math.cos(a) * 2.74, usY + 4.4, Math.sin(a) * 2.74]), mat.aluminiumDark)
  }
  g.add(sm.build('fairing-seams'))
  const lasY = usY + 6.2
  g.add(lathe([[0, lasY], [2.65, lasY], [2.6, lasY + 0.4], [1.0, lasY + 4.6], [0.62, lasY + 5.0], [0, lasY + 5.0]], loc.white, 'abort-fairing', [0, 0, 0], 48))
  const towerY = lasY + 5.0
  g.add(lathe([[0, towerY], [0.62, towerY], [0.62, towerY + 2.4], [0.5, towerY + 2.8], [0.5, towerY + 5.8], ...ogive(0.5, towerY + 5.8, 1.6, 6, 0.06).slice(1), [0, towerY + 7.4]], loc.white, 'abort-tower', [0, 0, 0], 32))
  const abort = new Batch()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const bell = new THREE.CylinderGeometry(0.12, 0.3, 0.7, 12, 1, true)
    bell.rotateZ(-0.7)
    bell.rotateY(-a)
    bell.translate(Math.cos(a) * 0.72, towerY + 2.2, Math.sin(a) * 0.72)
    abort.add(bell, loc.soot)
  }
  abort.add(xf(new THREE.CylinderGeometry(0.66, 0.66, 0.5, 32), [0, towerY + 4.6, 0]), mat.aluminiumDark)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    abort.add(xf(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 8), [Math.cos(a) * 0.66, towerY + 4.6, Math.sin(a) * 0.66], [0, 0, Math.PI / 2]).rotateY(0), loc.soot)
  }
  g.add(abort.build('abort-motors'))
  // Side boosters
  for (const sx of [-1, 1]) {
    const bx = sx * (R + 1.85 + 0.5)
    const b = new Batch()
    const by0 = 3.6
    const blen = 46.5
    b.add(new THREE.LatheGeometry([[1.25, 0], [0.75, 2.9], [0.6, 3.4]].map(([r, y]) => new THREE.Vector2(r, y)), 28), loc.bell)
    b.add(new THREE.LatheGeometry([[1.21, 0.02], [0.72, 2.9]].map(([r, y]) => new THREE.Vector2(r, y)), 28), loc.soot)
    b.add(new THREE.LatheGeometry([[2.55, by0 - 0.6], [2.5, by0], [1.85, by0 + 3.6]].map(([r, y]) => new THREE.Vector2(r, y)), 40), loc.white)
    b.add(xf(new THREE.CylinderGeometry(2.55, 2.55, 0.1, 40), [0, by0 - 0.6, 0]), loc.soot)
    b.add(xf(new THREE.CylinderGeometry(1.85, 1.85, blen, 40), [0, by0 + blen / 2, 0]), loc.white)
    for (const t of [0.14, 0.32, 0.5, 0.68, 0.86]) b.add(xf(new THREE.CylinderGeometry(1.88, 1.88, 0.35, 40, 1, true), [0, by0 + blen * t, 0]), mat.carbon)
    const noseY = by0 + blen
    b.add(new THREE.LatheGeometry([[1.85, noseY], [1.85, noseY + 1.5], ...ogive(1.85, noseY + 1.5, 6.0, 10, 0.15).slice(1), [0, noseY + 7.5]].map(([r, y]) => new THREE.Vector2(r, y)), 40), loc.white)
    b.add(xf(new THREE.CylinderGeometry(1.87, 1.87, 0.2, 40, 1, true), [0, noseY + 1.5, 0]), mat.carbon)
    // Separation motors and attach hardware toward the core
    for (const y of [by0 + 1.5, noseY + 2.4])
      for (const dz of [-0.6, 0.6]) b.add(xf(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 10), [sx * -0.3 * 0 + (sx > 0 ? 1 : -1) * 1.75, y, dz]), loc.soot)
    for (const dz of [-0.9, 0, 0.9]) b.add(strutGeo([-sx * 1.7, by0 + 4.5, dz], [-sx * 2.4, by0 + 4.5, dz * 1.6], 0.15, 6), mat.aluminiumDark)
    b.add(xf(new THREE.BoxGeometry(1.0, 0.8, 1.6), [-sx * 2.0, itY - 1.5, 0]), mat.aluminiumDark)
    b.add(strutGeo([0, by0 + 2, sx * 0 + 1.6], [0, noseY - 1, 1.6], 0.14, 4, true), loc.white)
    const boost = b.build(`booster-${sx > 0 ? 'r' : 'l'}`)
    boost.position.x = bx
    g.add(boost)
  }
  return finish('ride-lunar', g)
}

/** Commercial lunar lander: gold-foiled octagonal body, four legs, engine bell, CubeSat dispensers on deck */
function buildRideCommercial() {
  const g = group('ride-commercial-asm')
  const bodyY0 = 1.2
  const bodyH = 1.6
  const Rb = 1.3
  const octa = (r: number, hgt: number, m: THREE.Material, name: string, y: number) => {
    const c = cyl(r, r, hgt, m, name, 'y', [0, y, 0], 8)
    c.rotation.y = Math.PI / 8
    return c
  }
  g.add(octa(Rb, bodyH, mat.gold, 'body-mli', bodyY0 + bodyH / 2))
  // Faces: white radiators on two faces, quilted foil seams on the rest
  const fac = new Batch()
  const apoth = Rb * Math.cos(Math.PI / 8)
  const faceW = 2 * Rb * Math.sin(Math.PI / 8)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    const rot: V3 = [0, -a + Math.PI / 2, 0]
    const at = (d: number, y: number, t = 0): V3 => [n.x * (apoth + d) - n.z * t, y, n.z * (apoth + d) + n.x * t]
    if (k === 2 || k === 6) {
      fac.add(xf(new THREE.BoxGeometry(faceW * 0.86, bodyH * 0.8, 0.03), at(0.015, bodyY0 + bodyH / 2), rot), mat.panel)
      for (let i = 0; i < 6; i++) fac.add(xf(new THREE.BoxGeometry(faceW * 0.8, 0.025, 0.02), at(0.035, bodyY0 + 0.3 + i * 0.2), rot), mat.silverFoil)
    } else {
      // Crinkled blanket over the face, held by silver tape seams
      fac.add(xf(crumple(new THREE.PlaneGeometry(faceW * 0.99, bodyH * 0.97, 5, 7), 0.022, k + 1), at(0.012, bodyY0 + bodyH / 2), rot), loc.foil)
      for (const y of [bodyY0 + 0.55, bodyY0 + 1.1]) fac.add(xf(new THREE.BoxGeometry(faceW * 0.98, 0.03, 0.02), at(0.024, y), rot), loc.tape)
      fac.add(xf(new THREE.BoxGeometry(0.03, bodyH * 0.96, 0.02), at(0.024, bodyY0 + bodyH / 2, faceW * 0.2), rot), loc.tape)
    }
  }
  g.add(fac.build('body-faces'))
  // Decks
  const deckY = bodyY0 + bodyH
  g.add(octa(Rb + 0.06, 0.08, mat.aluminium, 'top-deck', deckY + 0.04))
  g.add(octa(Rb + 0.04, 0.06, mat.aluminiumDark, 'bottom-deck', bodyY0 - 0.03))
  // Tanks peeking out below and the main engine
  const tanks = new Batch()
  for (const [x, z] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]] as const) {
    tanks.add(xf(new THREE.SphereGeometry(0.42, 20, 12), [x, bodyY0 - 0.15, z]), mat.titanium)
    tanks.add(xf(new THREE.TorusGeometry(0.42, 0.025, 4, 24), [x, bodyY0 - 0.15, z], [Math.PI / 2, 0, 0]), mat.aluminiumDark)
  }
  g.add(tanks.build('tanks'))
  const eng = engine('main-engine', 0.36, 0.55, [0, 0.5, 0])
  g.add(eng)
  g.add(cyl(0.22, 0.3, 0.2, mat.aluminiumDark, 'engine-mount', 'y', [0, bodyY0 - 0.08, 0], 16))
  // Legs: shock-absorbing primary strut, two secondaries, footpad
  const legs = new Batch()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const c = Math.cos(a)
    const s = Math.sin(a)
    const tan = [-s, c]
    const foot: V3 = [c * 2.45, 0.2, s * 2.45]
    const top: V3 = [c * (apoth + 0.05), deckY - 0.25, s * (apoth + 0.05)]
    const mid: V3 = [top[0] + (foot[0] - top[0]) * 0.55, top[1] + (foot[1] - top[1]) * 0.55, top[2] + (foot[2] - top[2]) * 0.55]
    legs.add(strutGeo(top, mid, 0.075, 12), mat.aluminium)
    legs.add(strutGeo(mid, foot, 0.05, 12), mat.titanium)
    legs.add(xf(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), mid), mat.aluminiumDark)
    for (const side of [-1, 1]) {
      const base: V3 = [c * (apoth - 0.05) + tan[0] * side * 0.38, bodyY0 + 0.05, s * (apoth - 0.05) + tan[1] * side * 0.38]
      legs.add(strutGeo(base, [foot[0] * 0.92, 0.42, foot[2] * 0.92], 0.035, 8), mat.titanium)
    }
    legs.add(new THREE.LatheGeometry([[0, 0], [0.3, 0.02], [0.34, 0.1], [0.3, 0.16], [0.06, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 20).translate(foot[0], 0, foot[2]), mat.aluminium)
    legs.add(xf(new THREE.BoxGeometry(0.22, 0.16, 0.22), [c * (apoth + 0.06), deckY - 0.25, s * (apoth + 0.06)], [0, -a, 0]), mat.aluminiumDark)
  }
  g.add(legs.build('legs'))
  // RCS thruster quads at four corners of the deck
  const rcs = new Batch()
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    const p: V3 = [Math.cos(a) * (Rb + 0.05), deckY - 0.25, Math.sin(a) * (Rb + 0.05)]
    rcs.add(xf(new THREE.BoxGeometry(0.16, 0.16, 0.16), p, [0, -a, 0]), mat.aluminiumDark)
    for (const d of [[0, 1, 0], [0, -1, 0], [1, 0, 0]] as const) {
      const dir = new THREE.Vector3(d[0] * Math.cos(a), d[1], d[0] * Math.sin(a))
      const cone = new THREE.CylinderGeometry(0.025, 0.05, 0.1, 10, 1, true)
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().negate()))
      cone.translate(p[0] + dir.x * 0.12, p[1] + dir.y * 0.12, p[2] + dir.z * 0.12)
      rcs.add(cone, loc.soot)
    }
  }
  g.add(rcs.build('rcs'))
  // Side solar panel (fixed, on the -X face) and a landing sensor
  const sp = solarPanel('solar-panel', 0.9, 1.3, 4, 6)
  sp.rotation.set(0, 0, Math.PI / 2) // normal +Y turned to -X, on the -X face
  sp.position.set(-apoth - 0.04, bodyY0 + bodyH / 2, 0)
  g.add(sp)
  g.add(cyl(0.12, 0.12, 0.12, mat.anodized, 'landing-lidar', 'y', [0.5, bodyY0 - 0.12, 0.7], 16))
  g.add(cyl(0.07, 0.07, 0.02, mat.lens, 'landing-lidar-lens', 'y', [0.5, bodyY0 - 0.19, 0.7], 16))

  // Top deck payloads: two CubeSat dispensers with doors, two free-flyers, a star tracker, a mast dish
  const topY = deckY + 0.08
  const disp = (name: string, w: number, h: number, d: number, pos: V3, yaw: number, open: boolean, sat: { w: number; h: number; l: number }, hinge: string | null) => {
    const gg = group(name)
    const t = 0.012
    const b = new Batch()
    b.add(xf(new THREE.BoxGeometry(w, t, d), [0, t / 2, 0]), mat.anodized)
    b.add(xf(new THREE.BoxGeometry(w, t, d), [0, h - t / 2, 0]), mat.anodized)
    for (const sx of [-1, 1]) b.add(xf(new THREE.BoxGeometry(t, h, d), [(sx * (w - t)) / 2, h / 2, 0]), mat.anodized)
    b.add(xf(new THREE.BoxGeometry(w, h, t), [0, h / 2, -d / 2 + t / 2]), mat.aluminiumDark)
    // Stiffening ribs and feet
    for (let i = 1; i < 4; i++) b.add(xf(new THREE.BoxGeometry(w + 0.012, 0.02, 0.02), [0, h + 0.004, -d / 2 + (d * i) / 4]), mat.aluminium)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(xf(new THREE.BoxGeometry(0.05, 0.02, 0.05), [sx * (w / 2 + 0.015), 0.01, sz * (d / 2 - 0.04)]), mat.aluminiumDark)
    gg.add(b.build(`${name}-shell`))
    // The CubeSat inside, rails and solar cells
    const cs = group(`${name}-cubesat`)
    cs.add(box(sat.w, sat.h, sat.l, mat.panel, `${name}-cubesat-body`))
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) cs.add(box(0.008, 0.008, sat.l + 0.012, mat.aluminium, `${name}-cubesat-rail`, [(sx * (sat.w - 0.008)) / 2, (sy * (sat.h - 0.008)) / 2, 0]))
    const cells = solarPanel(`${name}-cubesat-cells`, sat.w - 0.02, sat.l - 0.02, 2, 3)
    cells.position.y = sat.h / 2 + 0.002
    cs.add(cells)
    cs.add(box(sat.w * 0.5, sat.h * 0.5, 0.004, mat.lens, `${name}-cubesat-aperture`, [0, 0, sat.l / 2 + 0.002]))
    cs.position.set(0, h / 2, open ? 0.06 : 0)
    gg.add(cs)
    // Door hinged on its bottom edge, spring-opened
    const door = group(hinge ? `pivot_${hinge}` : `${name}-door`)
    door.position.set(0, t, d / 2)
    door.add(box(w, h - t, t, mat.aluminium, `${name}-door-panel`, [0, (h - t) / 2, t / 2]))
    door.add(box(w * 0.6, 0.02, 0.016, mat.aluminiumDark, `${name}-door-rib`, [0, (h - t) * 0.5, t + 0.006]))
    door.add(cyl(0.012, 0.012, w * 0.9, mat.aluminiumDark, `${name}-hinge`, 'x', [0, 0, t / 2], 8))
    door.rotation.x = open ? 1.95 : 0
    if (hinge) door.userData.stowed = [0, 0, 0]
    gg.add(door)
    gg.position.set(...pos)
    gg.rotation.y = yaw
    return gg
  }
  // A row of dispensers on the front edge: two sprung open, one still closed
  g.add(disp('dispenser-a', 0.27, 0.15, 0.42, [0.42, topY, 0.72], 0, true, { w: 0.226, h: 0.1, l: 0.366 }, 'door-a'))
  g.add(disp('dispenser-b', 0.15, 0.15, 0.36, [0.04, topY, 0.75], 0, true, { w: 0.1, h: 0.1, l: 0.3 }, 'door-b'))
  g.add(disp('dispenser-c', 0.27, 0.15, 0.42, [-0.32, topY, 0.72], 0, false, { w: 0.226, h: 0.1, l: 0.366 }, null))
  // A CubeSat already out on the deck, wings spread, as a hint of what rides along
  const fly = group('free-cubesat')
  fly.add(box(0.1, 0.1, 0.2, mat.panel, 'free-cubesat-body', [0, 0.05, 0]))
  for (const sx of [-1, 1]) {
    const w = solarPanel(`free-cubesat-wing-${sx > 0 ? 'r' : 'l'}`, 0.2, 0.18, 3, 3)
    w.position.set(sx * 0.16, 0.1, 0)
    fly.add(w)
  }
  fly.add(cyl(0.02, 0.02, 0.01, mat.lens, 'free-cubesat-lens', 'z', [0, 0.05, 0.105], 12))
  fly.position.set(-0.8, topY + 0.02, 0.05)
  fly.rotation.y = 0.5
  g.add(fly)
  g.add(box(0.12, 0.02, 0.12, mat.aluminiumDark, 'free-cubesat-stand', [-0.8, topY + 0.01, 0.05]))
  // Science and avionics boxes
  g.add(rbox(0.5, 0.3, 0.4, 0.04, loc.foil, 'payload-box', [-0.45, topY + 0.15, -0.55]))
  g.add(rbox(0.35, 0.22, 0.35, 0.03, mat.panel, 'avionics-box', [0.45, topY + 0.11, -0.45]))
  g.add(cyl(0.06, 0.08, 0.12, mat.anodized, 'star-tracker', 'y', [0.65, topY + 0.28, -0.4], 16))
  g.add(cyl(0.05, 0.05, 0.005, mat.lens, 'star-tracker-lens', 'y', [0.65, topY + 0.343, -0.4], 16))
  g.add(cyl(0.025, 0.025, 0.02, mat.ledGreen, 'status-lamp', 'y', [0.2, topY + 0.01, -0.2], 8))
  // Mast with a steerable high-gain dish
  g.add(cyl(0.05, 0.06, 1.0, mat.aluminium, 'mast', 'y', [0, topY + 0.5, -0.85], 12))
  const dp = group('pivot_dish')
  dp.position.set(0, topY + 1.0, -0.85)
  const dg = dishGeometry(0.42, 0.12, 32)
  const dish = mesh(dg, mat.dish, 'hga-dish')
  dish.rotation.x = 0.9
  dish.position.set(0, 0.12, 0.06)
  dp.add(cyl(0.07, 0.07, 0.2, mat.aluminiumDark, 'hga-gimbal', 'x', [0, 0.04, 0], 12))
  dp.add(dish)
  const fd = new THREE.Vector3(0, 0.2, 0).applyEuler(dish.rotation).add(dish.position)
  dp.add(cyl(0.025, 0.04, 0.08, mat.gold, 'hga-feed', 'y', [fd.x, fd.y, fd.z]))
  dp.children.at(-1)!.rotation.x = 0.9
  for (const k of [0, 1, 2]) {
    const a = (k / 3) * Math.PI * 2
    const rim = new THREE.Vector3(Math.cos(a) * 0.38, 0.1, Math.sin(a) * 0.38).applyEuler(dish.rotation).add(dish.position)
    dp.add(strut([rim.x, rim.y, rim.z], [fd.x, fd.y, fd.z], 0.008, mat.aluminium, `hga-strut-${k}`, 6))
  }
  dp.userData.stowed = [-0.9, 0, 0]
  g.add(dp)
  return finish('ride-commercial', g)
}

export const models: Record<string, () => THREE.Object3D> = {
  'inst-ir-spec': buildIrSpec,
  'inst-laser': buildLaser,
  'inst-camera': buildCamera,
  'inst-neutron': buildNeutron,
  'ground-small': buildGroundSmall,
  'ground-medium': buildGroundMedium,
  'ground-dsn': buildGroundDsn,
  'ride-gto': buildRideGto,
  'ride-lunar': buildRideLunar,
  'ride-commercial': buildRideCommercial,
}
