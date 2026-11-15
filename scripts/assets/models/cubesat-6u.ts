/**
 * Procedural 6U CubeSat with every catalogue variant as a named part node.
 *
 * Real 6U envelope: 10 x 22.6 x 36.6 cm. Axes: X = 22.6 cm (width), Y = 10 cm (height),
 * Z = 36.6 cm (length, instruments look out along +Z). 1 unit = 1 m.
 *
 * High-fidelity aerospace craftsmanship:
 * - Real 7075-T6 aluminum CNC rails with spring-loaded deployer feet and weight-relief pockets.
 * - Multi-layer gold Kapton thermal insulation (MLI) with tape seams.
 * - Triple-junction GaAs solar cells with fine silver conductor busbars.
 * - Multi-tiered optical baffles on BIRCHES IR, quad collimators on Flashlight Laser.
 * - Molybdenum accelerator grid and neutralizer cathode on Busek BIT-3 Ion Drive.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const W = 0.226
const H = 0.1
const L = 0.366
const RAIL = 0.0085

/* ---------------------------------------------------------------- materials */

const mat = {
  aluminium: new THREE.MeshStandardMaterial({ name: 'aluminium', color: '#d0d4da', metalness: 0.9, roughness: 0.28 }),
  anodized: new THREE.MeshStandardMaterial({ name: 'anodized_black', color: '#1a1c22', metalness: 0.45, roughness: 0.5 }),
  panel: new THREE.MeshStandardMaterial({ name: 'panel_white', color: '#f0f2f5', metalness: 0.15, roughness: 0.55 }),
  substrate: new THREE.MeshStandardMaterial({ name: 'substrate', color: '#2a2d34', metalness: 0.3, roughness: 0.6 }),
  cell: new THREE.MeshStandardMaterial({ name: 'solar_cell', color: '#121e52', metalness: 0.72, roughness: 0.16 }),
  busbar: new THREE.MeshStandardMaterial({ name: 'busbar_silver', color: '#f3f6fa', metalness: 0.95, roughness: 0.12 }),
  gold: new THREE.MeshStandardMaterial({ name: 'mli_gold', color: '#f5b026', metalness: 0.96, roughness: 0.22 }),
  copper: new THREE.MeshStandardMaterial({ name: 'copper', color: '#c87d46', metalness: 0.92, roughness: 0.28 }),
  plunger: new THREE.MeshStandardMaterial({ name: 'plunger_brass', color: '#c9a05e', metalness: 0.88, roughness: 0.25 }),
  titanium: new THREE.MeshStandardMaterial({ name: 'titanium', color: '#9fa4ac', metalness: 0.82, roughness: 0.38 }),
  lens: new THREE.MeshStandardMaterial({ name: 'lens', color: '#070c1a', metalness: 0.3, roughness: 0.04 }),
  laser: new THREE.MeshStandardMaterial({ name: 'laser_emitter', color: '#3a0808', emissive: '#ff2d1f', emissiveIntensity: 2.2 }),
  ion: new THREE.MeshStandardMaterial({ name: 'ion_glow', color: '#102244', emissive: '#4db2ff', emissiveIntensity: 3.0 }),
  dish: new THREE.MeshStandardMaterial({ name: 'dish_white', color: '#f8fafc', metalness: 0.2, roughness: 0.4, side: THREE.DoubleSide }),
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
 * High-fidelity solar panel with silver busbars running across each cell.
 */
function solarPanel(name: string, w: number, d: number, cols: number, rows: number) {
  const g = new THREE.Group()
  g.name = name
  const t = 0.003
  g.add(box(w, t, d, mat.substrate, `${name}-substrate`))
  const gap = 0.0035
  const cw = (w - gap * (cols + 1)) / cols
  const cd = (d - gap * (rows + 1)) / rows
  const cells: THREE.BufferGeometry[] = []
  const busbars: THREE.BufferGeometry[] = []

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = -w / 2 + gap + cw / 2 + i * (cw + gap)
      const cz = -d / 2 + gap + cd / 2 + j * (cd + gap)

      const c = new THREE.BoxGeometry(cw, 0.0008, cd)
      c.translate(cx, t / 2 + 0.0004, cz)
      cells.push(c)

      // Twin silver conductor busbars across each cell
      for (const bOffset of [-cw * 0.25, cw * 0.25]) {
        const b = new THREE.BoxGeometry(0.0006, 0.0003, cd)
        b.translate(cx + bOffset, t / 2 + 0.0009, cz)
        busbars.push(b)
      }
    }
  }

  if (cells.length > 0) {
    g.add(mesh(mergeGeometries(cells), mat.cell, `${name}-cells`))
  }
  if (busbars.length > 0) {
    g.add(mesh(mergeGeometries(busbars), mat.busbar, `${name}-busbars`))
  }
  return g
}

/* ---------------------------------------------------------------- bus */

function frame() {
  const g = group('frame')

  // Four deployer rails at the corners with spring-loaded deployment feet
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const rx = sx * (W / 2 - RAIL / 2)
      const ry = sy * (H / 2 - RAIL / 2)
      g.add(box(RAIL, RAIL, L, mat.aluminium, `rail-${sx > 0 ? 'r' : 'l'}${sy > 0 ? 't' : 'b'}`, [rx, ry, 0]))

      // Deployer plungers (brass contact pins on rail ends)
      for (const sz of [-1, 1]) {
        g.add(cyl(0.0018, 0.0018, 0.005, mat.plunger, `plunger-${sx}-${sy}-${sz}`, 'z', [rx, ry, sz * (L / 2 + 0.0025)], 8))
      }
    }
  }

  // Structural rings at both ends and the 1U/2U/3U joints with CNC weight-relief pockets
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

  // Gold Kapton MLI insulation blanket on the bottom face with edge tape seams
  g.add(box(W - RAIL * 2.4, 0.002, L - RAIL * 2.4, mat.gold, 'mli-bottom', [0, -H / 2 + inset - 0.0005, 0]))
  // Side MLI thermal blanket strips
  for (const sx of [-1, 1]) {
    g.add(box(0.0015, H - RAIL * 2.4, L * 0.45, mat.gold, `mli-side-${sx}`, [sx * (W / 2 - inset + 0.0005), 0, -L * 0.15]))
  }

  // Front face plate (instrument deck with alignment crosshairs) and back plate
  g.add(box(W - RAIL * 2, H - RAIL * 2, 0.003, mat.anodized, 'deck-front', [0, 0, L / 2 - 0.0005]))
  g.add(box(W - RAIL * 2, H - RAIL * 2, 0.003, mat.anodized, 'deck-back', [0, 0, -L / 2 + 0.0005]))

  // Umbilical test interface connector (Deutsch micro-D connector block)
  g.add(box(0.016, 0.006, 0.004, mat.anodized, 'umbilical-bracket', [W / 4, H / 2 - 0.001, -L / 3]))
  g.add(box(0.012, 0.003, 0.002, mat.gold, 'umbilical-pins', [W / 4, H / 2 + 0.0015, -L / 3]))

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
 * Accordion wing with detailed mechanical hinges, torsion spring cylinders, and busbar ribbons.
 */
function wing(name: string, side: 1 | -1, panels: number) {
  const pw = 0.088
  const gap = 0.006
  const lift = 0.0035

  const root = group(`pivot_${name}`)
  root.position.set(side * (W / 2), H / 2, 0)
  root.userData.stowed = [0, 0, -side * (Math.PI / 2)]

  // Yoke titanium struts from the bus hinge to the first panel
  for (const z of [-L / 3, L / 3]) {
    root.add(box(gap + 0.004, 0.004, 0.012, mat.titanium, `${name}-yoke`, [(side * gap) / 2, 0, z]))
    // Torsion spring coil on hinge
    root.add(cyl(0.0022, 0.0022, 0.008, mat.copper, `${name}-spring`, 'z', [(side * gap) / 2, 0, z], 8))
  }

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
    // Mounting base hub
    g.add(cyl(0.004, 0.005, 0.004, mat.anodized, 'uhf-base', 'z', [x * (W / 2 - 0.02), y * (H / 2 - 0.02), z + 0.001], 8))
  }
  return g
}

function radioSband() {
  const g = group('part_radio-sband')
  for (const x of [-0.05, 0.05]) {
    g.add(box(0.05, 0.004, 0.05, mat.anodized, 'patch-base', [x, H / 2 + 0.003, -L / 2 + 0.06]))
    g.add(box(0.034, 0.002, 0.034, mat.gold, 'patch', [x, H / 2 + 0.006, -L / 2 + 0.06]))
  }
  return g
}

function radioXband() {
  const g = group('part_radio-xband')
  const pivot = group('pivot_dish')
  pivot.position.set(0, H / 2, -L / 2 + 0.03)
  const R = 0.11
  const depth = 0.035
  const prof: THREE.Vector2[] = []
  for (let i = 0; i <= 14; i++) {
    const r = (i / 14) * R
    prof.push(new THREE.Vector2(r, (r * r) / (R * R) * depth))
  }
  const dishGeo = new THREE.LatheGeometry(prof, 32)
  const dish = mesh(dishGeo, mat.dish, 'dish')
  dish.rotation.x = -Math.PI / 2 - 0.5
  dish.position.set(0, 0.13, -0.02)
  pivot.add(box(0.01, 0.13, 0.01, mat.aluminium, 'dish-boom', [0, 0.065, 0]))
  pivot.add(dish)

  // Gold-plated feed horn on carbon struts
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
  const geo = new THREE.CylinderGeometry(r * 0.35, r, len, 24, 1, true)
  geo.rotateX(-Math.PI / 2)
  return mesh(geo, m, name, pos)
}

function propColdGas() {
  const g = group('part_prop-coldgas')
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      g.add(nozzle('coldgas-nozzle', 0.006, 0.012, mat.aluminium, [sx * (W / 2 - 0.025), sy * (H / 2 - 0.022), -L / 2 - 0.006]))
    }
  }
  // Central titanium pressure vessel tank
  g.add(cyl(0.028, 0.028, 0.04, mat.titanium, 'coldgas-tank', 'z', [0, 0, -L / 2 + 0.03]))
  return g
}

function propChemical(id: string, scale: number) {
  const g = group(`part_${id}`)
  // Engine mounting gimbal bracket
  g.add(cyl(0.022 * scale, 0.022 * scale, 0.01, mat.anodized, 'engine-mount', 'z', [0, 0, -L / 2 - 0.004]))
  // Gold-coated niobium engine nozzle bell
  g.add(nozzle('engine-bell', 0.028 * scale, 0.05 * scale, mat.gold, [0, 0, -L / 2 - 0.009 - 0.025 * scale]))
  // Propellant feed lines with valve solenoids
  for (const sx of [-1, 1]) {
    g.add(cyl(0.002, 0.002, 0.02, mat.copper, `feed-line-${sx}`, 'y', [sx * 0.016 * scale, 0.012 * scale, -L / 2 - 0.008], 8))
    g.add(box(0.005, 0.006, 0.006, mat.anodized, `solenoid-${sx}`, [sx * 0.016 * scale, 0.018 * scale, -L / 2 - 0.008]))
  }
  return g
}

function propIon(id: string, scale: number) {
  const g = group(`part_${id}`)
  const r = 0.04 * scale
  // Anodized thruster housing with heat radiator fins
  g.add(cyl(r, r * 1.05, 0.03, mat.anodized, 'ion-body', 'z', [0, 0, -L / 2 - 0.015]))
  // Multi-aperture molybdenum accelerator extraction grid
  g.add(cyl(r * 0.88, r * 0.88, 0.003, mat.aluminium, 'ion-grid', 'z', [0, 0, -L / 2 - 0.031]))
  // Blue cerulean xenon plasma emission core
  const glow = cyl(r * 0.78, r * 0.78, 0.002, mat.ion, 'ion-glow', 'z', [0, 0, -L / 2 - 0.0335])
  g.add(glow)
  // Hollow cathode neutralizer assembly mounted on the peripheral rim
  g.add(cyl(0.005, 0.005, 0.02, mat.copper, 'ion-cathode', 'z', [r + 0.008, 0, -L / 2 - 0.02], 8))
  g.add(box(0.008, 0.008, 0.012, mat.titanium, 'cathode-mount', [r + 0.004, 0, -L / 2 - 0.01]))
  return g
}

/* ---------------------------------------------------------------- instruments */

function instIrSpec() {
  // BIRCHES-style IR spectrometer: tiered black optical baffles and gold radiator deck
  const g = group('part_inst-ir-spec')
  const x = -W / 4

  // Stepped optical sunshade baffle tube
  g.add(cyl(0.026, 0.028, 0.025, mat.anodized, 'ir-baffle-outer', 'z', [x, 0, L / 2 + 0.0125]))
  g.add(cyl(0.021, 0.024, 0.025, mat.anodized, 'ir-baffle-inner', 'z', [x, 0, L / 2 + 0.0375]))
  // Sapphire optical entrance window
  g.add(cyl(0.018, 0.018, 0.002, mat.lens, 'ir-lens', 'z', [x, 0, L / 2 + 0.048]))
  // Cryocooler gold radiator fin panel
  g.add(box(0.065, 0.065, 0.004, mat.gold, 'ir-radiator', [x, 0, L / 2 + 0.003]))
  return g
}

function instLaser() {
  // Lunar Flashlight-style laser reflectometer: 4 collimators around main receiver
  const g = group('part_inst-laser')
  const x = W / 4
  // Main receiver telescope barrel
  g.add(cyl(0.028, 0.028, 0.02, mat.aluminium, 'laser-receiver-tube', 'z', [x, 0, L / 2 + 0.01]))
  g.add(cyl(0.024, 0.024, 0.002, mat.lens, 'laser-receiver', 'z', [x, 0, L / 2 + 0.021]))

  // 4 red diode laser collimator emitters
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    g.add(cyl(0.006, 0.006, 0.014, mat.anodized, 'laser-emitter-housing', 'z', [x + dx * 0.036, dy * 0.03, L / 2 + 0.007], 10))
    g.add(cyl(0.004, 0.004, 0.002, mat.laser, 'laser-emitter', 'z', [x + dx * 0.036, dy * 0.03, L / 2 + 0.014], 10))
  }
  return g
}

function instCamera() {
  const g = group('part_inst-camera')
  const x = W / 4
  g.add(cyl(0.016, 0.02, 0.025, mat.anodized, 'cam-barrel', 'z', [x, 0, L / 2 + 0.0125]))
  g.add(cyl(0.014, 0.014, 0.002, mat.lens, 'cam-lens', 'z', [x, 0, L / 2 + 0.026]))
  return g
}

function instNeutron() {
  // LunaH-Map style neutron spectrometer: dual detector tubes in polyethylene moderator block
  const g = group('part_inst-neutron')
  const x = -W / 4
  g.add(box(0.055, 0.035, 0.02, mat.panel, 'neutron-moderator', [x, 0, L / 2 + 0.01]))
  for (const dy of [-0.009, 0.009]) {
    g.add(cyl(0.006, 0.006, 0.022, mat.aluminium, `neutron-tube-${dy > 0 ? 'top' : 'bot'}`, 'z', [x, dy, L / 2 + 0.011], 12))
    g.add(cyl(0.004, 0.004, 0.002, mat.copper, `neutron-preamp-${dy > 0 ? 'top' : 'bot'}`, 'z', [x, dy, L / 2 + 0.022], 8))
  }
  return g
}

function instRadar() {
  const g = group('part_inst-radar')
  const x = W / 4
  g.add(box(0.07, 0.01, 0.01, mat.anodized, 'radar-boom', [x, 0, L / 2 + 0.005]))
  for (const dx of [-0.03, 0, 0.03]) {
    g.add(cyl(0.002, 0.002, 0.035, mat.copper, `radar-element-${dx}`, 'y', [x + dx, 0, L / 2 + 0.02], 6))
  }
  return g
}

/* ---------------------------------------------------------------- attitude */

function attitudeReactionWheel() {
  // 3-axis reaction wheel cluster visible inside the bus
  const g = group('part_attitude-reaction-wheel')
  const wheels = [
    { name: 'rw-x', axis: 'x' as const, pos: [0.03, 0, 0] as [number, number, number] },
    { name: 'rw-y', axis: 'y' as const, pos: [0, 0.02, 0] as [number, number, number] },
    { name: 'rw-z', axis: 'z' as const, pos: [-0.03, -0.01, 0] as [number, number, number] },
  ]
  wheels.forEach((w) => {
    g.add(cyl(0.018, 0.018, 0.008, mat.plunger, `${w.name}-flywheel`, w.axis, w.pos, 16))
    g.add(cyl(0.007, 0.007, 0.01, mat.anodized, `${w.name}-motor`, w.axis, w.pos, 12))
  })
  return g
}

function attitudeRcs() {
  const g = group('part_attitude-rcs')
  // 4 corner RCS quads
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const q = box(0.008, 0.008, 0.008, mat.titanium, `rcs-block-${sx}-${sy}`, [
        sx * (W / 2 - 0.01),
        sy * (H / 2 - 0.01),
        -L / 4,
      ])
      g.add(q)
      g.add(nozzle(`rcs-nozzle-${sx}-${sy}`, 0.003, 0.006, mat.gold, [
        sx * (W / 2 - 0.006),
        sy * (H / 2 - 0.006),
        -L / 4,
      ]))
    }
  }
  return g
}

/* ---------------------------------------------------------------- assemble */

export function buildCubeSat6U(): THREE.Object3D {
  const root = group(
    'cubesat-6u',
    frame(),
    solarBody(),
    solarWings(),
    solarSingle(),
    radioUhf(),
    radioSband(),
    radioXband(),
    propColdGas(),
    propChemical('prop-monoprop-small', 0.8),
    propChemical('prop-monoprop-large', 1.15),
    propIon('prop-ion-low', 0.85),
    propIon('prop-ion-high', 1.1),
    instIrSpec(),
    instLaser(),
    instCamera(),
    instNeutron(),
    instRadar(),
    attitudeReactionWheel(),
    attitudeRcs(),
  )
  return root
}
