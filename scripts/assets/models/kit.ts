/**
 * Shared modelling kit for every procedural model in the game, so all hardware looks like
 * it came from the same studio. Use these materials and helpers; do not create new materials
 * unless the part truly needs a new surface (then add it here, named, for everyone).
 *
 * Conventions (same as src/assets/manifest.ts)
 * - 1 unit = 1 metre. 1U = a 10 cm cube. Real sizes from src/data/parts.ts (`volume` in U).
 * - +Y up, +Z forward (the side that faces out of the craft or toward the viewer).
 * - Part models: origin at the centre of the part's footprint, resting on y = 0.
 * - Moving parts under `pivot_<name>` groups with `userData.stowed = [x, y, z]` (radians).
 * - Node names: letters, digits, `-` and `_` only (three.js strips `:` `.` `/` on load).
 * - Glow (emissive) only for things that really emit: LEDs, laser, ion plume, status lamps.
 * - Readability over realism: exaggerate small features (connectors, screws, labels) a little,
 *   so a part reads at thumbnail size. Keep each part under ~40k triangles.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const U = 0.1

const std = (name: string, color: string, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ name, color, metalness, roughness, ...extra })

/** The palette. Shared instances: the exporter writes each material once. */
export const mat = {
  aluminium: std('aluminium', '#c9cdd3', 0.85, 0.32),
  aluminiumDark: std('aluminium_dark', '#8d939c', 0.8, 0.4),
  anodized: std('anodized_black', '#22252b', 0.4, 0.55),
  anodizedBlue: std('anodized_blue', '#2b4c8c', 0.6, 0.4),
  anodizedGold: std('anodized_gold', '#b8862d', 0.8, 0.35),
  panel: std('panel_white', '#e9ebee', 0.1, 0.6),
  substrate: std('substrate', '#d9dde3', 0.5, 0.4),
  cell: std('solar_cell', '#1b2f7a', 0.55, 0.22),
  gold: std('mli_gold', '#d9a62e', 1, 0.28),
  silverFoil: std('mli_silver', '#d8dce2', 1, 0.22),
  copper: std('copper', '#b8733f', 0.9, 0.35),
  pcb: std('pcb_green', '#1f5a3a', 0.2, 0.55),
  pcbBlue: std('pcb_blue', '#1b3f6e', 0.2, 0.55),
  chip: std('chip_black', '#111317', 0.3, 0.45),
  solder: std('solder', '#d6d9de', 0.95, 0.25),
  rubber: std('rubber', '#1a1a1a', 0, 0.9),
  ceramic: std('ceramic', '#ece6da', 0, 0.5),
  cellWrap: std('battery_wrap', '#2f6fb0', 0.2, 0.45),
  cellCap: std('battery_cap', '#c0c4ca', 0.9, 0.3),
  kapton: std('kapton', '#c9851f', 0.2, 0.35, { transparent: true, opacity: 0.92 }),
  carbon: std('carbon', '#2a2c30', 0.3, 0.35),
  titanium: std('titanium', '#9aa0a8', 0.9, 0.3),
  tank: std('tank_white', '#f2f2ee', 0.2, 0.35),
  dish: std('dish_white', '#f4f5f7', 0.15, 0.45, { side: THREE.DoubleSide }),
  concrete: std('concrete', '#c9ccd1', 0, 0.85),
  paintRed: std('paint_red', '#d9452b', 0.1, 0.5),
  paintOrange: std('paint_orange', '#f28c28', 0.1, 0.5),
  paintNavy: std('paint_navy', '#2c3e6b', 0.1, 0.5),
  lens: std('lens', '#0a1024', 0.2, 0.05),
  glass: std('glass_blue', '#5aa9e6', 0.3, 0.1, { transparent: true, opacity: 0.85 }),
  ledGreen: std('led_green', '#0b2a12', 0, 0.4, { emissive: '#3dff7a', emissiveIntensity: 2 }),
  ledRed: std('led_red', '#2a0b0b', 0, 0.4, { emissive: '#ff3b2f', emissiveIntensity: 2 }),
  ledAmber: std('led_amber', '#2a1a05', 0, 0.4, { emissive: '#ffb02e', emissiveIntensity: 2 }),
  laser: std('laser_emitter', '#2a0b0b', 0, 0.4, { emissive: '#ff3b2f', emissiveIntensity: 1.5 }),
  ion: std('ion_glow', '#16294a', 0, 0.4, { emissive: '#5fb4ff', emissiveIntensity: 2.5 }),
}

export type V3 = [number, number, number]

export function mesh(geo: THREE.BufferGeometry, m: THREE.Material, name: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) {
  const o = new THREE.Mesh(geo, m)
  o.name = name
  o.position.set(...pos)
  o.rotation.set(...rot)
  return o
}

export function box(w: number, h: number, d: number, m: THREE.Material, name: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0]) {
  return mesh(new THREE.BoxGeometry(w, h, d), m, name, pos, rot)
}

/** Box with softened edges (reads much better than a raw box at thumbnail size) */
export function rbox(w: number, h: number, d: number, r: number, m: THREE.Material, name: string, pos: V3 = [0, 0, 0]) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  const rr = Math.min(r, w / 2, h / 2)
  s.moveTo(x + rr, y)
  s.lineTo(x + w - rr, y)
  s.quadraticCurveTo(x + w, y, x + w, y + rr)
  s.lineTo(x + w, y + h - rr)
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  s.lineTo(x + rr, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - rr)
  s.lineTo(x, y + rr)
  s.quadraticCurveTo(x, y, x + rr, y)
  const bevel = Math.min(rr * 0.6, d / 4)
  const geo = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 })
  geo.translate(0, 0, -(d - bevel * 2) / 2)
  return mesh(geo, m, name, pos)
}

export function group(name: string, ...children: THREE.Object3D[]) {
  const g = new THREE.Group()
  g.name = name
  children.forEach((c) => g.add(c))
  return g
}

/** Cylinder along an axis */
export function cyl(rTop: number, rBottom: number, len: number, m: THREE.Material, name: string, axis: 'x' | 'y' | 'z', pos: V3 = [0, 0, 0], seg = 24, open = false) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 1, open)
  if (axis === 'z') geo.rotateX(Math.PI / 2)
  if (axis === 'x') geo.rotateZ(Math.PI / 2)
  return mesh(geo, m, name, pos)
}

export function sphere(r: number, m: THREE.Material, name: string, pos: V3 = [0, 0, 0], seg = 24) {
  return mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), m, name, pos)
}

/** Surface of revolution around Y from (radius, height) points */
export function lathe(points: [number, number][], m: THREE.Material, name: string, pos: V3 = [0, 0, 0], seg = 32) {
  return mesh(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), seg), m, name, pos)
}

/** Many copies of one geometry merged into one mesh (screws, cells, fins): cheap to draw */
export function instances(geo: THREE.BufferGeometry, positions: V3[], m: THREE.Material, name: string, rotations?: V3[]) {
  const parts = positions.map((p, i) => {
    const g = geo.clone()
    if (rotations?.[i]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotations[i])))
    g.translate(...p)
    return g
  })
  return mesh(mergeGeometries(parts), m, name)
}

/** Screw heads on a face, in a w x d grid (normal +Y) */
export function screws(w: number, d: number, y: number, name: string, nx = 2, nz = 2, r = 0.0025) {
  const pts: V3[] = []
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) pts.push([nx === 1 ? 0 : -w / 2 + (w * i) / (nx - 1), y, nz === 1 ? 0 : -d / 2 + (d * j) / (nz - 1)])
  return instances(new THREE.CylinderGeometry(r, r, 0.0015, 8), pts, mat.solder, name)
}

/** A CubeSat PC/104 circuit board (9.5 cm square) with chips, lying flat (normal +Y) */
export function pcb(name: string, m: THREE.Material = mat.pcb, chips = 5, seed = 1) {
  const g = group(name)
  g.add(box(0.095, 0.0016, 0.09, m, `${name}-board`))
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < chips; i++) {
    const w = 0.008 + rnd() * 0.018
    const d = 0.008 + rnd() * 0.014
    g.add(box(w, 0.002, d, mat.chip, `${name}-chip-${i}`, [-0.035 + rnd() * 0.07, 0.0018, -0.032 + rnd() * 0.064]))
  }
  // PC/104 stack connector along one edge
  g.add(box(0.06, 0.008, 0.006, mat.anodized, `${name}-connector`, [0, 0.004, -0.04]))
  return g
}

/** Flat solar panel in the XZ plane (normal +Y): substrate plus merged cells */
export function solarPanel(name: string, w: number, d: number, cols: number, rows: number) {
  const g = group(name)
  const t = 0.003
  g.add(box(w, t, d, mat.substrate, `${name}-substrate`))
  const gap = 0.004
  const cw = (w - gap * (cols + 1)) / cols
  const cd = (d - gap * (rows + 1)) / rows
  const cells: THREE.BufferGeometry[] = []
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const c = new THREE.BoxGeometry(cw, 0.001, cd)
      c.translate(-w / 2 + gap + cw / 2 + i * (cw + gap), t / 2 + 0.0005, -d / 2 + gap + cd / 2 + j * (cd + gap))
      cells.push(c)
    }
  g.add(mesh(mergeGeometries(cells), mat.cell, `${name}-cells`))
  return g
}

/** Parabolic dish facing +Y, radius R, depth `depth` */
export function dishGeometry(R: number, depth: number, seg = 40) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 14; i++) {
    const r = (i / 14) * R
    pts.push(new THREE.Vector2(r, (r * r) / (R * R) * depth))
  }
  return new THREE.LatheGeometry(pts, seg)
}

/** Put a model on the ground: shift so its lowest point is y = 0 and it is centred in x and z */
export function settle(root: THREE.Object3D) {
  const b = new THREE.Box3().setFromObject(root)
  const c = b.getCenter(new THREE.Vector3())
  const g = new THREE.Group()
  g.name = root.name
  root.name = `${root.name}-body`
  root.position.sub(new THREE.Vector3(c.x, b.min.y, c.z))
  g.add(root)
  return g
}
