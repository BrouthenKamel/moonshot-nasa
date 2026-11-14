/**
 * Procedural 6U CubeSat with every catalogue variant as a named part node.
 *
 * Real 6U envelope: 10 x 22.6 x 36.6 cm. Axes: X = 22.6 cm (width), Y = 10 cm (height),
 * Z = 36.6 cm (length, instruments look out along +Z). 1 unit = 1 m.
 *
 * Part nodes follow src/data/parts.ts ids (`part_solar-2wing`, `part_inst-ir-spec`, ...).
 * Pivots: `pivot_wing-left`, `pivot_wing-right`, `pivot_wing-single`, `pivot_dish`.
 * Each pivot is exported deployed; `userData.stowed` holds the stowed Euler rotation.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const W = 0.226
const H = 0.1
const L = 0.366
const RAIL = 0.0085

/* ---------------------------------------------------------------- materials */

const mat = {
  aluminium: new THREE.MeshStandardMaterial({ name: 'aluminium', color: '#c9cdd3', metalness: 0.85, roughness: 0.32 }),
  anodized: new THREE.MeshStandardMaterial({ name: 'anodized_black', color: '#22252b', metalness: 0.4, roughness: 0.55 }),
  panel: new THREE.MeshStandardMaterial({ name: 'panel_white', color: '#e9ebee', metalness: 0.1, roughness: 0.6 }),
  substrate: new THREE.MeshStandardMaterial({ name: 'substrate', color: '#d9dde3', metalness: 0.5, roughness: 0.4 }),
  cell: new THREE.MeshStandardMaterial({ name: 'solar_cell', color: '#1b2f7a', metalness: 0.55, roughness: 0.22 }),
  gold: new THREE.MeshStandardMaterial({ name: 'mli_gold', color: '#d9a62e', metalness: 1, roughness: 0.28 }),
  copper: new THREE.MeshStandardMaterial({ name: 'copper', color: '#b8733f', metalness: 0.9, roughness: 0.35 }),
  lens: new THREE.MeshStandardMaterial({ name: 'lens', color: '#0a1024', metalness: 0.2, roughness: 0.05 }),
  laser: new THREE.MeshStandardMaterial({ name: 'laser_emitter', color: '#2a0b0b', emissive: '#ff3b2f', emissiveIntensity: 1.5 }),
  ion: new THREE.MeshStandardMaterial({ name: 'ion_glow', color: '#16294a', emissive: '#5fb4ff', emissiveIntensity: 2.5 }),
  dish: new THREE.MeshStandardMaterial({ name: 'dish_white', color: '#f4f5f7', metalness: 0.15, roughness: 0.45, side: THREE.DoubleSide }),
}

/* ---------------------------------------------------------------- helpers */

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, name: string, pos: [number, number, number] = [0, 0, 0]) {
  const o = new THREE.Mesh(geo, m)
  o.name = name
  o.position.set(...pos)
  return o
}

function box(w: number, h: number, d: number, m: THREE.Material, name: string, pos: [number, number, number] = [0, 0, 0]) {
  return mesh(new THREE.BoxGeometry(w, h, d), m, name, pos)
}

function group(name: string, ...children: THREE.Object3D[]) {
  const g = new THREE.Group()
  g.name = name
  children.forEach((c) => g.add(c))
  return g
}

/** Cylinder along an axis */
function cyl(rTop: number, rBottom: number, len: number, m: THREE.Material, name: string, axis: 'x' | 'y' | 'z', pos: [number, number, number], seg = 24) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, seg)
  if (axis === 'z') geo.rotateX(Math.PI / 2)
  if (axis === 'x') geo.rotateZ(Math.PI / 2)
  return mesh(geo, m, name, pos)
}

/**
 * Flat solar panel lying in the XZ plane (normal +Y): a substrate with a grid of cells,
 * cells merged into one mesh. `w` along X, `d` along Z.
 */
function solarPanel(name: string, w: number, d: number, cols: number, rows: number) {
  const g = new THREE.Group()
  g.name = name
  const t = 0.003
  g.add(box(w, t, d, mat.substrate, `${name}-substrate`))
  const gap = 0.004
  const cw = (w - gap * (cols + 1)) / cols
  const cd = (d - gap * (rows + 1)) / rows
  const cells: THREE.BufferGeometry[] = []
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const c = new THREE.BoxGeometry(cw, 0.001, cd)
      c.translate(-w / 2 + gap + cw / 2 + i * (cw + gap), t / 2 + 0.0005, -d / 2 + gap + cd / 2 + j * (cd + gap))
      cells.push(c)
    }
  }
  g.add(mesh(mergeGeometries(cells), mat.cell, `${name}-cells`))
  return g
}

/* ---------------------------------------------------------------- bus */

function frame() {
  const g = group('frame')
  // Four long rails at the corners (the deployer rails)
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      g.add(box(RAIL, RAIL, L, mat.aluminium, `rail-${sx > 0 ? 'r' : 'l'}${sy > 0 ? 't' : 'b'}`, [sx * (W / 2 - RAIL / 2), sy * (H / 2 - RAIL / 2), 0]))
  // Rings at both ends and the 1U/2U/3U joints
  for (const z of [-L / 2, -L / 6, L / 6, L / 2]) {
    const zz = Math.max(-L / 2 + RAIL / 2, Math.min(L / 2 - RAIL / 2, z))
    g.add(box(W, RAIL * 0.7, RAIL, mat.aluminium, 'ring', [0, H / 2 - RAIL * 0.35, zz]))
    g.add(box(W, RAIL * 0.7, RAIL, mat.aluminium, 'ring', [0, -H / 2 + RAIL * 0.35, zz]))
    g.add(box(RAIL * 0.7, H, RAIL, mat.aluminium, 'ring', [W / 2 - RAIL * 0.35, 0, zz]))
    g.add(box(RAIL * 0.7, H, RAIL, mat.aluminium, 'ring', [-W / 2 + RAIL * 0.35, 0, zz]))
  }
  // Inset body panels
  const inset = 0.004
  g.add(box(W - inset * 2, H - inset * 2, L - inset * 2, mat.panel, 'body'))
  // Gold insulation on the bottom face
  g.add(box(W - RAIL * 2.4, 0.002, L - RAIL * 2.4, mat.gold, 'mli-bottom', [0, -H / 2 + inset - 0.0005, 0]))
  // Front face plate (instrument deck) and back plate
  g.add(box(W - RAIL * 2, H - RAIL * 2, 0.003, mat.anodized, 'deck-front', [0, 0, L / 2 - 0.0005]))
  g.add(box(W - RAIL * 2, H - RAIL * 2, 0.003, mat.anodized, 'deck-back', [0, 0, -L / 2 + 0.0005]))
  return g
}

/* ---------------------------------------------------------------- solar */

function solarBody() {
  const g = group('part_solar-body')
  const top = solarPanel('body-top', W - RAIL * 2.4, L - RAIL * 2.4, 4, 9)
  top.position.y = H / 2 - 0.001
  g.add(top)
  for (const sx of [-1, 1]) {
    const side = solarPanel(`body-side-${sx > 0 ? 'r' : 'l'}`, H - RAIL * 2.4, L - RAIL * 2.4, 2, 9)
    side.rotation.z = (-sx * Math.PI) / 2
    side.position.x = sx * (W / 2 - 0.001)
    g.add(side)
  }
  return g
}

/**
 * Accordion wing hinged on the top edge of a side face, as on real 6U CubeSats.
 * Each panel is narrower than the bus is tall, so stowed, the stack lies flat
 * against the side face. Deployed, the panels unfold into one flat wing.
 *
 * Nested pivots: `pivot_<name>` (bus hinge), `pivot_<name>-2`, `pivot_<name>-3` (panel hinges).
 */
function wing(name: string, side: 1 | -1, panels: number) {
  const pw = 0.088 // panel width, < H so a stowed panel fits on the side face
  const gap = 0.006
  const lift = 0.0035 // hinge offset so folded panels stack instead of intersecting

  const root = group(`pivot_${name}`)
  root.position.set(side * (W / 2), H / 2, 0)
  root.userData.stowed = [0, 0, -side * (Math.PI / 2)]
  // Yoke struts from the bus hinge to the first panel
  for (const z of [-L / 3, L / 3]) root.add(box(gap + 0.004, 0.004, 0.012, mat.aluminium, `${name}-yoke`, [(side * gap) / 2, 0, z]))

  let parent = root
  for (let i = 0; i < panels; i++) {
    const p = solarPanel(`${name}-panel-${i + 1}`, pw, L - 0.02, 2, 8)
    p.position.x = side * (gap + pw / 2)
    parent.add(p)
    if (i === panels - 1) break
    const hinge = group(`pivot_${name}-${i + 2}`)
    hinge.position.set(side * (gap + pw + gap / 2), lift, 0)
    hinge.userData.stowed = [0, 0, (i % 2 === 0 ? 1 : -1) * side * Math.PI]
    hinge.add(cyl(0.0025, 0.0025, L - 0.06, mat.aluminium, `${name}-hinge-${i + 2}`, 'z', [0, -lift, 0], 8))
    // Children of the hinge are laid out from its position
    hinge.position.x -= side * gap
    parent.add(hinge)
    parent = hinge
  }
  return root
}

function solarWings() {
  return group('part_solar-2wing', wing('wing-left', -1, 3), wing('wing-right', 1, 3))
}

function solarSingle() {
  return group('part_solar-1wing', wing('wing-single', 1, 3))
}

/* ---------------------------------------------------------------- radios */

function radioUhf() {
  // Four tape-measure whip antennas folded out from the back face
  const g = group('part_radio-uhf')
  const z = -L / 2 - 0.002
  for (const [x, y, rx, ry] of [
    [-1, 1, -1, 1],
    [1, 1, 1, 1],
    [-1, -1, -1, -1],
    [1, -1, 1, -1],
  ] as const) {
    const a = cyl(0.0015, 0.0015, 0.17, mat.copper, 'uhf-whip', 'y', [0, 0, 0], 6)
    a.position.set(x * (W / 2 - 0.02) + rx * 0.06, y * (H / 2 - 0.02) + ry * 0.06, z)
    a.rotation.z = Math.atan2(-rx, ry)
    g.add(a)
  }
  return g
}

function radioSband() {
  // Two square patch antennas on the top face, near the back
  const g = group('part_radio-sband')
  for (const x of [-0.05, 0.05]) {
    g.add(box(0.05, 0.004, 0.05, mat.anodized, 'patch-base', [x, H / 2 + 0.003, -L / 2 + 0.06]))
    g.add(box(0.034, 0.002, 0.034, mat.gold, 'patch', [x, H / 2 + 0.006, -L / 2 + 0.06]))
  }
  return g
}

function radioXband() {
  // Deployable parabolic dish on a boom above the back of the bus
  const g = group('part_radio-xband')
  const pivot = group('pivot_dish')
  pivot.position.set(0, H / 2, -L / 2 + 0.03)
  const R = 0.11
  const depth = 0.035
  const prof: THREE.Vector2[] = []
  for (let i = 0; i <= 12; i++) {
    const r = (i / 12) * R
    prof.push(new THREE.Vector2(r, (r * r) / (R * R) * depth))
  }
  const dishGeo = new THREE.LatheGeometry(prof, 32)
  // Face the dish backwards and up, like it is pointed at Earth
  const dish = mesh(dishGeo, mat.dish, 'dish')
  dish.rotation.x = -Math.PI / 2 - 0.5
  dish.position.set(0, 0.13, -0.02)
  pivot.add(box(0.01, 0.13, 0.01, mat.aluminium, 'dish-boom', [0, 0.065, 0]))
  pivot.add(dish)
  // Feed horn on three struts
  const feed = cyl(0.008, 0.012, 0.03, mat.gold, 'dish-feed', 'z', [0, 0, 0])
  feed.position.copy(new THREE.Vector3(0, depth + 0.045, 0).applyEuler(dish.rotation).add(dish.position))
  feed.rotation.copy(dish.rotation)
  feed.rotateX(Math.PI / 2)
  pivot.add(feed)
  pivot.userData.stowed = [Math.PI / 2, 0, 0]
  g.add(pivot)
  return g
}

/* ---------------------------------------------------------------- propulsion */

function nozzle(name: string, r: number, len: number, m: THREE.Material, pos: [number, number, number]) {
  // Bell pointing -Z
  const geo = new THREE.CylinderGeometry(r * 0.35, r, len, 24, 1, true)
  geo.rotateX(-Math.PI / 2)
  const n = mesh(geo, m, name, pos)
  n.material = m
  return n
}

function propColdGas() {
  const g = group('part_prop-coldgas')
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      g.add(nozzle('coldgas-nozzle', 0.006, 0.012, mat.aluminium, [sx * (W / 2 - 0.025), sy * (H / 2 - 0.022), -L / 2 - 0.006]))
  return g
}

function propChemical(id: string, scale: number) {
  const g = group(`part_${id}`)
  g.add(cyl(0.022 * scale, 0.022 * scale, 0.01, mat.anodized, 'engine-mount', 'z', [0, 0, -L / 2 - 0.004]))
  g.add(nozzle('engine-bell', 0.028 * scale, 0.05 * scale, mat.gold, [0, 0, -L / 2 - 0.009 - 0.025 * scale]))
  return g
}

function propIon(id: string, scale: number) {
  const g = group(`part_${id}`)
  const r = 0.04 * scale
  g.add(cyl(r, r * 1.05, 0.03, mat.anodized, 'ion-body', 'z', [0, 0, -L / 2 - 0.015]))
  g.add(cyl(r * 0.85, r * 0.85, 0.003, mat.aluminium, 'ion-grid', 'z', [0, 0, -L / 2 - 0.031]))
  const glow = cyl(r * 0.75, r * 0.75, 0.002, mat.ion, 'ion-glow', 'z', [0, 0, -L / 2 - 0.0335])
  g.add(glow)
  // Neutralizer cathode on the rim
  g.add(cyl(0.005, 0.005, 0.02, mat.copper, 'ion-cathode', 'z', [r + 0.008, 0, -L / 2 - 0.02], 8))
  return g
}

/* ---------------------------------------------------------------- instruments */

function instIrSpec() {
  // BIRCHES-style IR spectrometer: boxy body behind the deck, black baffle out the front (left)
  const g = group('part_inst-ir-spec')
  const x = -W / 4
  g.add(cyl(0.022, 0.026, 0.045, mat.anodized, 'ir-baffle', 'z', [x, 0, L / 2 + 0.0225]))
  g.add(cyl(0.017, 0.017, 0.002, mat.lens, 'ir-lens', 'z', [x, 0, L / 2 + 0.046]))
  g.add(box(0.06, 0.06, 0.004, mat.gold, 'ir-radiator', [x, 0, L / 2 + 0.003]))
  return g
}

function instLaser() {
  // Lunar Flashlight-style laser reflectometer: four emitters around a large receiver (right)
  const g = group('part_inst-laser')
  const x = W / 4
  g.add(cyl(0.028, 0.028, 0.02, mat.aluminium, 'laser-receiver-tube', 'z', [x, 0, L / 2 + 0.01]))
  g.add(cyl(0.024, 0.024, 0.002, mat.lens, 'laser-receiver', 'z', [x, 0, L / 2 + 0.021]))
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    g.add(cyl(0.005, 0.005, 0.012, mat.laser, 'laser-emitter', 'z', [x + dx * 0.036, dy * 0.03, L / 2 + 0.006], 10))
  return g
}

function instCamera() {
  // Small camera at the bottom centre of the deck
  const g = group('part_inst-camera')
  g.add(cyl(0.012, 0.014, 0.03, mat.anodized, 'camera-barrel', 'z', [0, -0.025, L / 2 + 0.015]))
  g.add(cyl(0.009, 0.009, 0.002, mat.lens, 'camera-lens', 'z', [0, -0.025, L / 2 + 0.031]))
  return g
}

function instNeutron() {
  // Neutron spectrometer: cylindrical detector on top, front end
  const g = group('part_inst-neutron')
  g.add(cyl(0.025, 0.025, 0.09, mat.gold, 'neutron-detector', 'x', [0, H / 2 + 0.027, L / 2 - 0.06]))
  g.add(box(0.1, 0.012, 0.04, mat.anodized, 'neutron-mount', [0, H / 2 + 0.006, L / 2 - 0.06]))
  return g
}

/* ---------------------------------------------------------------- attitude */

function attitudeBasic() {
  // Coarse sun sensors: small pyramids on the corners of the top face
  const g = group('part_attitude-basic')
  for (const [x, z] of [
    [-1, 1],
    [1, -1],
  ]) {
    const geo = new THREE.ConeGeometry(0.008, 0.008, 4)
    g.add(mesh(geo, mat.lens, 'sun-sensor', [x * (W / 2 - 0.02), H / 2 + 0.004, z * (L / 2 - 0.02)]))
  }
  return g
}

function attitudePrecision() {
  // Star tracker: angled baffle on top
  const g = group('part_attitude-precision')
  const t = cyl(0.014, 0.02, 0.04, mat.anodized, 'star-tracker', 'y', [W / 2 - 0.035, H / 2 + 0.02, 0.06])
  t.rotation.z = -0.35
  g.add(t)
  return g
}

/* ---------------------------------------------------------------- assembly */

export function buildCubeSat6U(): THREE.Group {
  const root = group(
    'cubesat-6u',
    frame(),
    solarBody(),
    solarSingle(),
    solarWings(),
    radioUhf(),
    radioSband(),
    radioXband(),
    propColdGas(),
    propChemical('prop-chemical', 1),
    propChemical('prop-chemical-large', 1.3),
    propIon('prop-ion', 1),
    propIon('prop-ion-large', 1.25),
    instIrSpec(),
    instLaser(),
    instCamera(),
    instNeutron(),
    attitudeBasic(),
    attitudePrecision(),
  )
  root.userData = { envelope: { x: W, y: H, z: L }, units: 'metres' }
  return root
}
