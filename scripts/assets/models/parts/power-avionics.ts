/**
 * Power and avionics catalogue models: the 6U structure, the three solar options, the three
 * battery packs, the two flight computers and the two attitude control units.
 *
 * Each export is a game-ready model of ONE catalogue choice, built at real size (1 unit = 1 m,
 * 1U = 10 cm) with the shared kit (../kit.ts). Conventions: +Y up, +Z forward (the face the
 * player sees first), origin at the centre of the footprint resting on y = 0 (kit.settle).
 *
 * Solar wings: pivots `pivot_wing-left` / `pivot_wing-right` on the bus hinge, then one nested
 * `pivot_wing-<side>-<n>` per panel hinge (accordion fold). The large array adds a solar array
 * drive: `pivot_gimbal-<side>`. All exported deployed; `userData.stowed` holds the folded pose.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mat, mesh, box, rbox, group, cyl, sphere, lathe, instances, settle, type V3 } from '../kit.ts'

/* ================================================================ local materials */

const std = (name: string, color: string, metalness: number, roughness: number) =>
  new THREE.MeshStandardMaterial({ name, color, metalness, roughness })

/** Materials this group needs that the kit has no surface for */
const pmat = {
  /** Tantalum radiation spot shields over the processors of the hardened computer */
  tantalum: std('tantalum_shield', '#6a6470', 0.92, 0.3),
  /** PTFE wire insulation (harness) */
  wireWhite: std('wire_white', '#efebe2', 0, 0.55),
}

/* ================================================================ helpers */

const PI = Math.PI

/** 6U envelope, same axes as cubesat-6u.ts: X width, Y height, Z length */
const W = 0.226
const H = 0.1
const L = 0.366

/** PC/104 board: 95 x 90 mm, mounting holes near the corners */
const BW = 0.095
const BD = 0.09
const HX = 0.0415
const HZ = 0.0385
const HOLES: V3[] = [
  [-HX, 0, -HZ],
  [HX, 0, -HZ],
  [-HX, 0, HZ],
  [HX, 0, HZ],
]

const at = (pts: V3[], dx: number, dy: number, dz: number): V3[] => pts.map(([x, y, z]) => [x + dx, y + dy, z + dz])

/** Rotate a geometry so its +Y axis points along `axis` */
function orient(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z') {
  if (axis === 'z') geo.rotateX(PI / 2)
  if (axis === 'x') geo.rotateZ(-PI / 2)
  return geo
}

/** Box with rounded vertical edges (a chip, a shield, a housing seen from above) */
function rblock(w: number, h: number, d: number, r: number, m: THREE.Material, name: string, pos: V3 = [0, 0, 0]) {
  const o = rbox(w, d, h, r, m, name, pos)
  o.rotation.x = -PI / 2
  return o
}

/** Closed surface of revolution: points as (radius, y), auto-oriented so normals face out */
function solid(points: [number, number][], m: THREE.Material, name: string, pos: V3 = [0, 0, 0], seg = 32) {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    area += x0 * y1 - x1 * y0
  }
  const pts = area < 0 ? [...points].reverse() : points
  const closed = pts[0][0] > 1e-6 ? [...pts, pts[0]] : pts
  return lathe(closed, m, name, pos, seg)
}

/** Many small fasteners pointing along an axis */
function bolts(pts: V3[], axis: 'x' | 'y' | 'z', name: string, r = 0.0021, m: THREE.Material = mat.solder) {
  return instances(orient(new THREE.CylinderGeometry(r, r, 0.0016, 8), axis), pts, m, name)
}

/** Hex nuts / hex standoffs */
function hexes(pts: V3[], r: number, h: number, m: THREE.Material, name: string, axis: 'x' | 'y' | 'z' = 'y') {
  return instances(orient(new THREE.CylinderGeometry(r, r, h, 6), axis), pts, m, name)
}

/** A smooth tube (wire, cable, harness) through points */
function tube(pts: V3[], r: number, m: THREE.Material, name: string, seg = 40, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
  return mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), m, name)
}

/** Helical spring along +Y centred on the origin, then turned to `axis` */
function helix(r: number, wire: number, turns: number, len: number, m: THREE.Material, name: string, pos: V3, axis: 'x' | 'y' | 'z' = 'y') {
  const n = Math.round(turns * 14)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = t * turns * 2 * PI
    pts.push(new THREE.Vector3(Math.cos(a) * r, t * len - len / 2, Math.sin(a) * r))
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 4, false)
  return mesh(orient(geo, axis), m, name, pos)
}

/** Flat plate in XY with rounded-rect windows cut through, extruded `t` along Z, centred */
function cutPlate(w: number, h: number, t: number, windows: { x: number; y: number; w: number; h: number; r: number }[], m: THREE.Material, name: string) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, -h / 2)
  s.lineTo(w / 2, -h / 2)
  s.lineTo(w / 2, h / 2)
  s.lineTo(-w / 2, h / 2)
  s.lineTo(-w / 2, -h / 2)
  for (const o of windows) {
    const p = new THREE.Path()
    const x = o.x - o.w / 2
    const y = o.y - o.h / 2
    const r = Math.min(o.r, o.w / 2, o.h / 2)
    p.moveTo(x + r, y)
    p.lineTo(x + o.w - r, y)
    p.quadraticCurveTo(x + o.w, y, x + o.w, y + r)
    p.lineTo(x + o.w, y + o.h - r)
    p.quadraticCurveTo(x + o.w, y + o.h, x + o.w - r, y + o.h)
    p.lineTo(x + r, y + o.h)
    p.quadraticCurveTo(x, y + o.h, x, y + o.h - r)
    p.lineTo(x, y + r)
    p.quadraticCurveTo(x, y, x + r, y)
    s.holes.push(p)
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 4 })
  geo.translate(0, 0, -t / 2)
  return mesh(geo, m, name)
}

/** Grid of space solar cells with cropped corners, lying in XZ facing +Y, merged */
function cellGrid(w: number, d: number, cols: number, rows: number, gap = 0.0028) {
  const cw = (w - gap * (cols - 1)) / cols
  const cd = (d - gap * (rows - 1)) / rows
  const k = Math.min(cw, cd) * 0.16
  const s = new THREE.Shape()
  s.moveTo(-cw / 2 + k, -cd / 2)
  s.lineTo(cw / 2 - k, -cd / 2)
  s.lineTo(cw / 2, -cd / 2 + k)
  s.lineTo(cw / 2, cd / 2 - k)
  s.lineTo(cw / 2 - k, cd / 2)
  s.lineTo(-cw / 2 + k, cd / 2)
  s.lineTo(-cw / 2, cd / 2 - k)
  s.lineTo(-cw / 2, -cd / 2 + k)
  s.lineTo(-cw / 2 + k, -cd / 2)
  const base = new THREE.ExtrudeGeometry(s, { depth: 0.0007, bevelEnabled: false })
  base.rotateX(-PI / 2)
  const cells: THREE.BufferGeometry[] = []
  const tabs: THREE.BufferGeometry[] = []
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = -w / 2 + cw / 2 + i * (cw + gap)
      const z = -d / 2 + cd / 2 + j * (cd + gap)
      cells.push(base.clone().translate(x, 0, z))
      // Silver interconnect tabs bridging to the next cell in the string
      if (j < rows - 1)
        for (const f of [-0.28, 0.28]) tabs.push(new THREE.BoxGeometry(cw * 0.12, 0.0004, gap + 0.003).translate(x + f * cw, 0.0006, z + cd / 2 + gap / 2))
      // Thin bus line on each cell (reads as the cell's front grid)
      tabs.push(new THREE.BoxGeometry(cw * 0.86, 0.0002, 0.0007).translate(x, 0.0008, z - cd / 2 + 0.0022))
    }
  return { cells: mergeGeometries(cells), tabs: mergeGeometries(tabs) }
}

/** A PC/104 board lying flat (normal +Y), top surface at y = 0.0008; with stack connector on -Z */
function board(name: string, m: THREE.Material, opts: { w?: number; d?: number; header?: boolean; pads?: boolean } = {}) {
  const w = opts.w ?? BW
  const d = opts.d ?? BD
  const g = group(name)
  g.add(box(w, 0.0016, d, m, `${name}-pcb`))
  if (opts.pads !== false) g.add(instances(new THREE.CylinderGeometry(0.0034, 0.0034, 0.0018, 12), HOLES, mat.solder, `${name}-pads`))
  if (opts.header !== false) {
    // The CubeSat stack connector: two 52-pin headers end to end, gold pins on top
    g.add(box(0.08, 0.0085, 0.0056, mat.anodized, `${name}-header`, [0, 0.0051, -0.0405]))
    g.add(box(0.078, 0.0006, 0.0034, mat.anodizedGold, `${name}-header-pins`, [0, 0.0097, -0.0405]))
  }
  return g
}

/** Surface-mount parts on a board, merged per material. Positions are on the board top (y = 0.0008). */
function chips(name: string, list: [number, number, number, number, number][], m: THREE.Material = mat.chip) {
  const geos = list.map(([w, h, d, x, z]) => new THREE.BoxGeometry(w, h, d).translate(x, 0.0008 + h / 2, z))
  return mesh(mergeGeometries(geos), m, name)
}

/** A row of status LEDs on the board top at the front edge */
function leds(name: string, xs: number[], z: number, ms: THREE.Material[], y = 0.0008) {
  const g = group(name)
  xs.forEach((x, i) => g.add(box(0.0024, 0.0013, 0.0018, ms[i % ms.length], `${name}-${i}`, [x, y + 0.00065, z])))
  return g
}

/** Micro-D connector facing +Z: metal shell, insulator, two jack screws */
function microD(name: string, w: number, pos: V3, shell: THREE.Material = mat.aluminium) {
  const g = group(name)
  g.position.set(...pos)
  g.add(rblock(w + 0.008, 0.0075, 0.0016, 0.0012, shell, `${name}-flange`, [0, 0, 0]))
  g.add(rblock(w, 0.0048, 0.0065, 0.0016, shell, `${name}-shell`, [0, 0, 0.004]))
  g.add(box(w - 0.0018, 0.0028, 0.0012, mat.anodized, `${name}-insert`, [0, 0, 0.0073]))
  g.add(instances(orient(new THREE.CylinderGeometry(0.0012, 0.0012, 0.003, 8), 'z'), [[-(w / 2 + 0.0025), 0, 0.0015], [w / 2 + 0.0025, 0, 0.0015]], mat.solder, `${name}-jackscrews`))
  return g
}

/* ================================================================ bus-6u */

function bus6u() {
  const g = group('bus-6u')
  const R = 0.0085 // rail leg
  const T = 0.0022 // rail wall
  const FOOT = 0.0065

  // Four L-section deployer rails, hard-anodised feet at both ends
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = (sx * W) / 2
      const y = sy > 0 ? H : 0
      const tag = `${sx > 0 ? 'r' : 'l'}${sy > 0 ? 't' : 'b'}`
      g.add(box(R, T, L - FOOT * 2, mat.aluminiumDark, `rail-${tag}-flat`, [x - (sx * R) / 2, y - (sy * T) / 2, 0]))
      g.add(box(T, R, L - FOOT * 2, mat.aluminiumDark, `rail-${tag}-web`, [x - (sx * T) / 2, y - (sy * R) / 2, 0]))
      for (const sz of [-1, 1]) g.add(rblock(R, R, FOOT, 0.0015, mat.anodized, `rail-${tag}-foot`, [x - (sx * R) / 2, y - (sy * R) / 2, sz * (L / 2 - FOOT / 2)]))
    }

  // End frames and the two 1U-boundary ribs, each a rectangular ring with a centre post
  const ring = (name: string, z: number, bar: number, depth: number, m: THREE.Material) => {
    const r = group(name)
    r.add(box(W - T * 2, bar, depth, m, `${name}-top`, [0, H - bar / 2 - T, z]))
    r.add(box(W - T * 2, bar, depth, m, `${name}-bottom`, [0, bar / 2 + T, z]))
    for (const sx of [-1, 1]) r.add(box(bar, H - T * 2, depth, m, `${name}-side`, [sx * (W / 2 - T - bar / 2), H / 2, z]))
    r.add(box(bar * 0.8, H - T * 2 - bar * 2, depth, m, `${name}-post`, [0, H / 2, z]))
    // Corner gussets
    const gus: V3[] = []
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) gus.push([sx * (W / 2 - T - bar - 0.004), H / 2 + sy * (H / 2 - T - bar - 0.004), z])
    r.add(instances(new THREE.BoxGeometry(0.012, 0.0045, depth).rotateZ(PI / 4), gus, m, `${name}-gussets`, gus.map(([x, y]) => [0, 0, (x > 0) === (y > H / 2) ? 0 : PI / 2])))
    return r
  }
  const zEnd = L / 2 - FOOT - 0.003
  g.add(ring('frame-front', zEnd, 0.008, 0.006, mat.aluminium))
  g.add(ring('frame-back', -zEnd, 0.008, 0.006, mat.aluminium))
  g.add(ring('rib-1', 0.0575, 0.006, 0.004, mat.aluminiumDark))
  g.add(ring('rib-2', -0.0575, 0.006, 0.004, mat.aluminiumDark))

  // Screws on the end frames (facing out)
  const fs: V3[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) fs.push([sx * (W / 2 - 0.009), H / 2 + sy * (H / 2 - 0.0085), zEnd + 0.003])
  for (const sy of [-1, 1]) fs.push([0, H / 2 + sy * (H / 2 - 0.0085), zEnd + 0.003])
  g.add(bolts(fs, 'z', 'frame-front-screws'))
  g.add(bolts(fs.map(([x, y, z]) => [x, y, -z] as V3), 'z', 'frame-back-screws'))

  // Bottom shear panel with lightening windows (one pair per 1U bay), so the inside reads
  const bays = [-0.1185, 0, 0.1185]
  const bottom = cutPlate(
    W - T * 2 - 0.001,
    L - FOOT * 2 - 0.004,
    0.0014,
    bays.flatMap((z) => [-1, 1].map((sx) => ({ x: sx * 0.054, y: z, w: 0.082, h: 0.09, r: 0.012 }))),
    mat.aluminium,
    'panel-bottom',
  )
  bottom.rotation.x = -PI / 2
  bottom.position.y = 0.0007 + T
  g.add(bottom)
  // Side shear panels, one window per bay
  for (const sx of [-1, 1]) {
    const side = cutPlate(L - FOOT * 2 - 0.004, H - R * 2 - 0.002, 0.0012, bays.map((z) => ({ x: z, y: 0, w: 0.088, h: 0.05, r: 0.01 })), mat.aluminium, `panel-side-${sx > 0 ? 'r' : 'l'}`)
    side.rotation.y = PI / 2
    side.position.set(sx * (W / 2 - T - 0.0006), H / 2, 0)
    g.add(side)
  }
  // Centre stringers between the two 3U halves
  g.add(box(0.007, 0.004, L - FOOT * 2 - 0.01, mat.aluminium, 'stringer-top', [0, H - 0.002 - T, 0]))
  g.add(box(0.007, 0.003, L - FOOT * 2 - 0.01, mat.aluminium, 'stringer-bottom', [0, T + 0.0028, 0]))

  // Four PC/104 threaded rods along the left 3U column, with nuts at each frame
  const cx = -W / 4
  const rodPts: V3[] = HOLES.map(([x, , z]) => [cx + x, H / 2 + z, 0])
  const rodLen = 2 * zEnd + 0.012
  g.add(instances(orient(new THREE.CylinderGeometry(0.0016, 0.0016, rodLen, 8), 'z'), rodPts, mat.titanium, 'pc104-rods'))
  const threads: V3[] = []
  for (const [x, y] of rodPts) for (let z = -zEnd + 0.004; z < zEnd - 0.002; z += 0.0055) threads.push([x, y, z])
  g.add(instances(orient(new THREE.CylinderGeometry(0.0019, 0.0019, 0.0008, 6), 'z'), threads, mat.titanium, 'pc104-threads'))
  const nuts: V3[] = []
  for (const [x, y] of rodPts) for (const z of [zEnd + 0.0045, zEnd - 0.0045, -zEnd + 0.0045, -zEnd - 0.0045, 0.0575 + 0.0035, -0.0575 - 0.0035]) nuts.push([x, y, z])
  g.add(hexes(nuts, 0.0034, 0.0028, mat.aluminium, 'pc104-nuts', 'z'))
  // Rod brackets on the ribs
  for (const z of [0.0575, -0.0575]) g.add(box(0.098, 0.006, 0.003, mat.aluminiumDark, `pc104-bracket-${z > 0 ? 'f' : 'b'}`, [cx, H / 2 + HZ, z]))

  // Harness bundle in the right column: four wires, cable ties, two breakouts to rib connectors
  const path: V3[] = [
    [0.03, 0.01, zEnd - 0.004],
    [0.045, 0.011, 0.1],
    [0.062, 0.012, 0.03],
    [0.06, 0.012, -0.04],
    [0.044, 0.011, -0.11],
    [0.03, 0.013, -zEnd + 0.004],
  ]
  const wires: [number, number, THREE.Material][] = [
    [0, 0, pmat.wireWhite],
    [0.0034, 0.0006, mat.paintRed],
    [-0.0034, 0.0006, pmat.wireWhite],
    [0.0016, 0.0032, mat.rubber],
    [-0.0016, 0.0032, pmat.wireWhite],
  ]
  wires.forEach(([dx, dy, m], i) => g.add(tube(at(path, dx, dy, 0), 0.0017, m, `harness-wire-${i}`, 60, 6)))
  const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)))
  const ties: THREE.BufferGeometry[] = []
  for (const t of [0.08, 0.2, 0.33, 0.47, 0.6, 0.74, 0.88]) {
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const tie = new THREE.TorusGeometry(0.0055, 0.0009, 4, 12)
    tie.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan))
    tie.translate(p.x, p.y + 0.0016, p.z)
    ties.push(tie)
  }
  g.add(mesh(mergeGeometries(ties), mat.rubber, 'harness-ties'))
  for (const z of [0.0575, -0.0575]) {
    const sz = Math.sign(z)
    const from = curve.getPointAt(z > 0 ? 0.33 : 0.6)
    g.add(tube([[from.x, from.y + 0.002, from.z], [from.x + 0.012, 0.03, z + sz * 0.012], [0.082, 0.05, z + sz * 0.006], [0.084, 0.058, z + sz * 0.003]], 0.0022, pmat.wireWhite, `harness-branch-${sz > 0 ? 'f' : 'b'}`, 24))
    const c = microD(`harness-connector-${sz > 0 ? 'f' : 'b'}`, 0.016, [0.084, 0.064, z + sz * 0.003])
    c.rotation.x = sz > 0 ? -PI / 2 : PI / 2
    g.add(c)
  }
  // P-clamps holding the bundle to the floor
  for (const t of [0.14, 0.54]) {
    const p = curve.getPointAt(t)
    g.add(box(0.016, 0.0012, 0.005, mat.aluminium, 'harness-clamp', [p.x, p.y + 0.006, p.z]))
  }

  // Deployment switches in the back rail feet: housing inboard of the rail, plunger out of the foot
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = sx * (W / 2 - R / 2)
      const y = sy > 0 ? H - R / 2 : R / 2
      g.add(rblock(0.007, 0.008, 0.013, 0.0012, mat.anodized, 'deploy-switch', [x - sx * (R / 2 + 0.0035), y, -L / 2 + FOOT + 0.009]))
      g.add(cyl(0.0018, 0.0018, 0.006, mat.titanium, 'deploy-switch-plunger', 'z', [x, y, -L / 2 - 0.0015], 12))
      g.add(cyl(0.0024, 0.0024, 0.0012, mat.paintRed, 'deploy-switch-collar', 'z', [x, y, -L / 2 + 0.0004], 12))
    }

  // Separation spring plungers in the front rail feet
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = sx * (W / 2 - R / 2)
      const y = sy > 0 ? H - R / 2 : R / 2
      g.add(cyl(0.0011, 0.0011, 0.009, mat.titanium, 'sep-spring-pin', 'z', [x, y, L / 2 + 0.0035], 8))
      g.add(cyl(0.0029, 0.0029, 0.0012, mat.aluminium, 'sep-spring-cap', 'z', [x, y, L / 2 + 0.0075], 14))
      g.add(helix(0.0022, 0.00045, 4, 0.007, mat.titanium, 'sep-spring', [x, y, L / 2 + 0.0035], 'z'))
    }

  // Remove-before-flight pin and flag through the front frame
  const rbf = group('remove-before-flight')
  rbf.position.set(W / 2 - 0.03, H - 0.012, zEnd + 0.004)
  rbf.add(cyl(0.0014, 0.0014, 0.014, mat.titanium, 'rbf-pin', 'z', [0, 0, 0], 8))
  const ringGeo = new THREE.TorusGeometry(0.0055, 0.0009, 6, 16)
  rbf.add(mesh(ringGeo, mat.titanium, 'rbf-ring', [0, -0.0055, 0.008]))
  const flag = box(0.012, 0.05, 0.0007, mat.paintRed, 'rbf-flag', [0.001, -0.036, 0.0105])
  flag.rotation.set(0.06, 0, 0.07)
  rbf.add(flag)
  rbf.add(box(0.0105, 0.004, 0.0009, pmat.wireWhite, 'rbf-flag-band', [0.0028, -0.05, 0.0112]))
  g.add(rbf)

  // Raised identification plate on the right rail web
  g.add(box(0.0008, 0.0045, 0.06, mat.anodizedBlue, 'id-plate', [W / 2 + 0.0004, H - R / 2, 0.09]))
  g.add(box(0.0006, 0.003, 0.03, mat.aluminium, 'id-plate-strip', [W / 2 + 0.0009, H - R / 2, 0.075]))

  // Survival heater patch on the floor (kapton with a copper serpentine)
  g.add(box(0.06, 0.0005, 0.04, mat.kapton, 'survival-heater', [0.055, T + 0.0012, -0.155]))

  g.userData = { envelope: { x: W, y: H, z: L } }
  return settle(g)
}

/* ================================================================ solar: body-mounted */

/** One body panel lying in XZ (cells up), length along Z, wiring end at -Z */
function bodyPanel(name: string, w: number, d: number, cols: number, rows: number, sensor: boolean) {
  const g = group(name)
  const t = 0.0018
  g.add(rblock(w, t, d, 0.004, mat.substrate, `${name}-substrate`, [0, 0, 0]))
  const { cells, tabs } = cellGrid(w - 0.012, d - 0.03, cols, rows)
  g.add(mesh(cells, mat.cell, `${name}-cells`, [0, t / 2, 0.006]))
  g.add(mesh(tabs, mat.solder, `${name}-interconnects`, [0, t / 2, 0.006]))
  // String end bus bars and the wiring tabs at the connector end
  g.add(box(w - 0.016, 0.0005, 0.003, mat.solder, `${name}-busbar`, [0, t / 2 + 0.0003, -d / 2 + 0.017]))
  const tabX = [-0.3, -0.1, 0.1, 0.3].map((f) => f * (w - 0.02))
  g.add(instances(new THREE.BoxGeometry(0.004, 0.0006, 0.009), tabX.map((x) => [x, t / 2 + 0.0004, -d / 2 + 0.01] as V3), mat.copper, `${name}-tabs`))
  g.add(box(0.026, 0.004, 0.006, mat.anodized, `${name}-connector`, [w / 2 - 0.02, t / 2 + 0.002, -d / 2 + 0.006]))
  g.add(box(0.022, 0.0008, 0.0035, mat.anodizedGold, `${name}-connector-pins`, [w / 2 - 0.02, t / 2 + 0.0044, -d / 2 + 0.006]))
  // Mounting screws around the edge
  const sp: V3[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) sp.push([sx * (w / 2 - 0.0035), t / 2, sz * (d / 2 - 0.0035)])
  g.add(bolts(sp, 'y', `${name}-screws`, 0.0019))
  if (sensor) {
    // Coarse sun sensor and a temperature sensor in the wiring zone
    g.add(rblock(0.012, 0.003, 0.009, 0.0015, mat.anodized, `${name}-sun-sensor`, [-w / 2 + 0.016, t / 2 + 0.0015, -d / 2 + 0.008]))
    g.add(box(0.006, 0.0008, 0.004, mat.glass, `${name}-sun-sensor-window`, [-w / 2 + 0.016, t / 2 + 0.0031, -d / 2 + 0.008]))
    g.add(box(0.004, 0.0012, 0.003, mat.chip, `${name}-thermistor`, [0, t / 2 + 0.0006, -d / 2 + 0.0055]))
  }
  // Pigtail leads out of the connector
  g.add(tube([[w / 2 - 0.02, t / 2 + 0.002, -d / 2 + 0.003], [w / 2 - 0.018, 0.002, -d / 2 - 0.012], [w / 2 - 0.03, -0.004, -d / 2 - 0.02]], 0.0012, mat.paintRed, `${name}-lead-pos`, 12, 5))
  g.add(tube([[w / 2 - 0.016, t / 2 + 0.002, -d / 2 + 0.003], [w / 2 - 0.012, 0.002, -d / 2 - 0.012], [w / 2 - 0.022, -0.004, -d / 2 - 0.022]], 0.0012, mat.rubber, `${name}-lead-neg`, 12, 5))
  return g
}

function solarBody() {
  const g = group('solar-body')
  const len = L - 0.02
  // Back to front: two large-face panels, then the two narrow side panels, fanned like a hand of cards
  const set: { name: string; w: number; cols: number; a: number; dx: number }[] = [
    { name: 'panel-large-a', w: W - 0.016, cols: 5, a: 0.3, dx: -0.03 },
    { name: 'panel-large-b', w: W - 0.016, cols: 5, a: 0.11, dx: -0.012 },
    { name: 'panel-side-a', w: H - 0.012, cols: 2, a: -0.1, dx: 0.02 },
    { name: 'panel-side-b', w: H - 0.012, cols: 2, a: -0.3, dx: 0.035 },
  ]
  const fan = group('fan')
  set.forEach((p, i) => {
    const panel = bodyPanel(p.name, p.w, len, p.cols, 4, i % 2 === 0)
    // Stand it up: cells face +Z, wiring end at the bottom
    panel.rotation.set(PI / 2, PI, 0)
    panel.position.y = len / 2 + 0.008
    const holder = group(`${p.name}-holder`, panel)
    holder.position.set(p.dx, 0, i * 0.009)
    holder.rotation.z = p.a
    fan.add(holder)
  })
  fan.rotation.x = -0.16
  fan.position.set(0, 0.022, 0.0)
  g.add(fan)
  // Integration stand (ground support): a slotted aluminium block holding the set
  g.add(rblock(0.2, 0.03, 0.07, 0.008, mat.anodized, 'stand-base', [0, 0.015, 0.008]))
  g.add(rblock(0.17, 0.006, 0.05, 0.004, mat.aluminium, 'stand-cap', [0, 0.031, 0.01]))
  g.add(bolts([[-0.075, 0.0342, 0.01], [0.075, 0.0342, 0.01], [-0.075, 0.0342, -0.01], [0.075, 0.0342, -0.01]], 'y', 'stand-screws', 0.0028))
  g.add(box(0.05, 0.0012, 0.014, mat.anodizedBlue, 'stand-plate', [0, 0.018, 0.0433]))
  g.userData = { panels: 4, watts: 28 }
  return settle(g)
}

/* ================================================================ solar: deployable wings */

type WingSpec = {
  side: 1 | -1
  panels: number
  pw: number
  cols: number
  rows: number
  frame: THREE.Material
  /** Solar array drive between the bus hinge and the panels (large array) */
  gimbal?: { yoke: number; tilt: number }
}

const PL = L - 0.02 // panel length
const GAP = 0.006 // hinge gap between panels
const PITCH = 0.0052 // stack pitch when folded

/** One wing panel in its pivot's frame: spans x = side*[GAP/2, GAP/2 + pw], plane at y = py */
function wingPanel(name: string, s: WingSpec, py: number, tip: boolean) {
  const g = group(name)
  const x0 = (s.side * (GAP / 2 + s.pw / 2))
  const t = 0.0026
  g.add(box(s.pw, t, PL, mat.substrate, `${name}-substrate`, [x0, py, 0]))
  // Edge frame: stiffeners along the long edges and the ends
  for (const e of [-1, 1]) g.add(box(0.0028, 0.0034, PL, s.frame, `${name}-stiffener`, [x0 + (e * (s.pw / 2 - 0.0014)), py - 0.0004, 0]))
  for (const e of [-1, 1]) g.add(box(s.pw, 0.0034, 0.0028, s.frame, `${name}-endcap`, [x0, py - 0.0004, e * (PL / 2 - 0.0014)]))
  const { cells, tabs } = cellGrid(s.pw - 0.009, PL - 0.012, s.cols, s.rows)
  g.add(mesh(cells, mat.cell, `${name}-cells`, [x0, py + t / 2, 0]))
  g.add(mesh(tabs, mat.solder, `${name}-interconnects`, [x0, py + t / 2, 0]))
  // Back: kapton harness strip and tie-down cups
  g.add(box(0.008, 0.0004, PL - 0.03, mat.kapton, `${name}-back-harness`, [x0 - s.side * (s.pw / 2 - 0.008), py - t / 2 - 0.0002, 0]))
  if (tip) {
    for (const z of [-PL / 3, PL / 3]) g.add(cyl(0.004, 0.004, 0.0025, mat.aluminium, `${name}-tiedown`, 'y', [x0 + s.side * (s.pw / 2 - 0.008), py - t / 2 - 0.0012, z], 12))
  }
  return g
}

/** Hinge line along Z at the pivot origin: knuckles, pin and torsion springs */
function hingeLine(name: string, len: number, frame: THREE.Material) {
  const g = group(name)
  g.add(cyl(0.0011, 0.0011, len, mat.titanium, `${name}-pin`, 'z', [0, 0, 0], 8))
  const ks: V3[] = [-0.4, -0.13, 0.13, 0.4].map((f) => [0, 0, f * len])
  g.add(instances(orient(new THREE.CylinderGeometry(0.0026, 0.0026, 0.02, 12), 'z'), ks, frame, `${name}-knuckles`))
  for (const f of [-0.27, 0.27]) g.add(helix(0.0024, 0.0005, 5, 0.012, mat.titanium, `${name}-spring`, [0, 0, f * len], 'z'))
  return g
}

/**
 * Accordion wing. Panel k folds onto panel k-1 at hinge k; the hinge sits half a stack
 * pitch off the parent's panel plane, on the side the stack grows, so that a half turn
 * lays the child exactly one pitch away (no panels through each other when stowed).
 */
function wing(id: string, s: WingSpec) {
  const tag = s.side > 0 ? 'right' : 'left'
  const root = group(`pivot_wing-${tag}`)
  root.position.set(s.side * (W / 2 + PITCH / 2 + 0.003), H, 0)
  root.userData.stowed = [0, 0, (-s.side * PI) / 2]
  root.add(hingeLine(`${id}-${tag}-root-hinge`, PL - 0.04, mat.aluminium))

  let parent: THREE.Object3D = root
  if (s.gimbal) {
    // Solar array drive: motor on the hinge, a forked yoke out to the rotating wing
    const yk = s.gimbal.yoke
    root.add(cyl(0.011, 0.011, 0.016, mat.anodized, `${tag}-drive-motor`, 'x', [s.side * 0.008, 0, 0], 20))
    root.add(cyl(0.0125, 0.0125, 0.003, mat.aluminium, `${tag}-drive-flange`, 'x', [s.side * 0.0175, 0, 0], 20))
    root.add(box(0.016, 0.004, 0.012, mat.anodizedGold, `${tag}-drive-label`, [s.side * 0.008, 0.0105, 0]))
    // Braces from the drive flange out to the yoke bar
    for (const z of [-1, 1]) {
      const a = new THREE.Vector3(s.side * 0.019, 0, 0)
      const b = new THREE.Vector3(s.side * (yk - 0.003), 0, z * 0.11)
      const len = a.distanceTo(b)
      const arm = box(0.005, 0.005, len, mat.aluminium, `${tag}-yoke-arm`, [(a.x + b.x) / 2, 0, b.z / 2])
      arm.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
      root.add(arm)
    }
    root.add(box(0.006, 0.006, PL - 0.02, mat.aluminium, `${tag}-yoke-bar`, [s.side * (yk - 0.003), 0, 0]))
    const gim = group(`pivot_gimbal-${tag}`)
    gim.position.set(s.side * yk, 0, 0)
    gim.rotation.x = s.gimbal.tilt
    gim.userData.stowed = [0, 0, 0]
    root.add(gim)
    parent = gim
  }

  let py = -PITCH / 2
  for (let k = 0; k < s.panels; k++) {
    parent.add(wingPanel(`${tag}-panel-${k + 1}`, s, py, k === s.panels - 1))
    if (k === s.panels - 1) break
    // Stack grows to local +y in an even (unflipped) frame, -y in an odd one
    const sigma = k % 2 === 0 ? 1 : -1
    const hy = py + (sigma * PITCH) / 2
    const hinge = group(`pivot_wing-${tag}-${k + 2}`)
    hinge.position.set(s.side * (s.pw + GAP), hy, 0)
    hinge.userData.stowed = [0, 0, s.side * sigma * PI]
    hinge.add(hingeLine(`${tag}-hinge-${k + 2}`, PL - 0.05, s.frame))
    parent.add(hinge)
    parent = hinge
    py = py - hy
  }
  return root
}

/** The bus-side half of a wing kit: hinge brackets, release mechanisms and a slim mounting frame */
function wingMount(id: string) {
  const g = group(`${id}-mount`)
  const zE = L / 2 - 0.012
  // Two end bulkheads with lightening windows outline the bus the wings fit onto
  for (const z of [-zE, zE]) {
    const plate = cutPlate(W - 0.004, H - 0.002, 0.005, [-1, 1].map((sx) => ({ x: sx * 0.054, y: 0, w: 0.086, h: 0.066, r: 0.01 })), mat.aluminiumDark, 'mount-bulkhead')
    plate.position.set(0, H / 2, z)
    g.add(plate)
    const bs: V3[] = []
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) bs.push([sx * (W / 2 - 0.012), H / 2 + sy * (H / 2 - 0.009), z + Math.sign(z) * 0.0028])
    g.add(bolts(bs, 'z', 'mount-bulkhead-screws', 0.002))
    // MLI blanket behind the bulkhead windows
    g.add(box(W - 0.02, H - 0.02, 0.001, mat.gold, 'mount-end-mli', [0, H / 2, z - Math.sign(z) * 0.005]))
  }
  for (const sx of [-1, 1]) {
    // Hinge rail along the top edge with clevis brackets
    g.add(box(0.0085, 0.0085, L, mat.aluminium, 'mount-hinge-rail', [sx * (W / 2 - 0.00425), H - 0.00425, 0]))
    g.add(instances(new THREE.BoxGeometry(0.008, 0.007, 0.012), [-0.13, 0, 0.13].map((z) => [sx * (W / 2 + 0.002), H - 0.0005, z] as V3), mat.aluminium, 'mount-clevis'))
    // Bottom rail carrying the burn-wire hold-down and release mechanisms
    g.add(box(0.0085, 0.0085, L, mat.aluminium, 'mount-bottom-rail', [sx * (W / 2 - 0.00425), 0.00425, 0]))
    for (const z of [-0.1, 0.1]) {
      g.add(rblock(0.01, 0.012, 0.022, 0.002, mat.anodized, 'hdrm-body', [sx * (W / 2 - 0.006), 0.012, z]))
      g.add(box(0.008, 0.0012, 0.016, mat.pcb, 'hdrm-board', [sx * (W / 2 - 0.006), 0.0186, z]))
      g.add(instances(orient(new THREE.CylinderGeometry(0.0011, 0.0011, 0.006, 8), 'z'), [[sx * (W / 2 - 0.004), 0.0198, z - 0.003], [sx * (W / 2 - 0.008), 0.0198, z + 0.003]], mat.ceramic, 'hdrm-resistors'))
      // Cut line ends (the tie-down cord after release)
      g.add(tube([[sx * (W / 2 - 0.001), 0.013, z], [sx * (W / 2 + 0.004), 0.01, z + 0.004], [sx * (W / 2 + 0.006), 0.004, z + 0.002]], 0.0007, pmat.wireWhite, 'hdrm-cord', 10, 4))
    }
    // Closed side skin (white radiator panel) so the mount reads as a spacecraft body, with a raised access plate
    g.add(box(0.002, H - 0.019, L - 0.036, mat.panel, 'mount-skin-side', [sx * (W / 2 - 0.0095), H / 2, 0]))
    g.add(rblock(0.0012, 0.04, 0.1, 0.003, mat.aluminium, 'mount-access-plate', [sx * (W / 2 - 0.0082), H / 2, 0.06]))
    g.add(bolts([-1, 1].flatMap((sy) => [-1, 1].map((sz) => [sx * (W / 2 - 0.0074), H / 2 + sy * 0.016, 0.06 + sz * 0.044] as V3)), 'x', 'mount-access-screws', 0.0015))
    g.add(box(0.0012, 0.03, 0.12, mat.gold, 'mount-mli-patch', [sx * (W / 2 - 0.0082), H / 2, -0.07]))
    // Power harness from the array along the hinge rail
    g.add(box(0.003, 0.0035, L - 0.06, pmat.wireWhite, 'mount-harness', [sx * (W / 2 - 0.0095), H - 0.0018, 0]))
    g.add(instances(new THREE.BoxGeometry(0.0045, 0.0045, 0.002), [-0.12, -0.04, 0.04, 0.12].map((z) => [sx * (W / 2 - 0.0095), H - 0.0018, z] as V3), mat.rubber, 'mount-harness-ties'))
  }
  // Top deck and bottom closeout between the rails
  g.add(box(W - 0.019, 0.002, L - 0.036, mat.panel, 'mount-deck-top', [0, H - 0.0095, 0]))
  g.add(box(W - 0.019, 0.002, L - 0.036, mat.aluminiumDark, 'mount-deck-bottom', [0, 0.0095, 0]))
  g.add(box(0.12, 0.0012, 0.2, mat.silverFoil, 'mount-radiator', [0, H - 0.0079, 0]))
  return g
}

function solarWings(id: string, spec: Omit<WingSpec, 'side'>) {
  const g = group(id, wingMount(id), wing(id, { ...spec, side: -1 }), wing(id, { ...spec, side: 1 }))
  return settle(g)
}

/* ================================================================ batteries */

const CELL_R = 0.00915
const CELL_L = 0.0625

/** One layer of 18650 cells lying along X, sitting in two cradles; origin on the board top */
function cellLayer(name: string, n: number) {
  const g = group(name)
  const pitch = 0.0195
  const zs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch)
  const cy = 0.0016 + CELL_R
  // Kapton heater film under the cells, with its copper serpentine showing through
  g.add(box(0.07, 0.0004, n * pitch + 0.004, mat.kapton, `${name}-heater`, [0, 0.0002, 0]))
  const serp: V3[] = []
  for (let i = 0; i < 6; i++) serp.push([-0.03 + i * 0.012, 0.0005, 0])
  g.add(instances(new THREE.BoxGeometry(0.0012, 0.0002, n * pitch - 0.002), serp, mat.copper, `${name}-heater-trace`))
  // Cradles
  for (const x of [-0.019, 0.019]) g.add(rblock(0.007, 0.011, n * pitch + 0.006, 0.0015, mat.anodized, `${name}-cradle`, [x, 0.0055, 0]))
  // Cells: blue wrap, white label band, steel end caps, positive button
  g.add(instances(orient(new THREE.CylinderGeometry(CELL_R, CELL_R, CELL_L - 0.002, 20), 'x'), zs.map((z) => [0, cy, z] as V3), mat.cellWrap, `${name}-cells`))
  g.add(instances(orient(new THREE.CylinderGeometry(CELL_R + 0.0002, CELL_R + 0.0002, 0.012, 20), 'x'), zs.map((z) => [0.004, cy, z] as V3), mat.ceramic, `${name}-cell-bands`))
  g.add(instances(orient(new THREE.CylinderGeometry(CELL_R - 0.0004, CELL_R - 0.0004, 0.0016, 20), 'x'), zs.flatMap((z) => [[-CELL_L / 2 + 0.0002, cy, z], [CELL_L / 2 - 0.0002, cy, z]] as V3[]), mat.cellCap, `${name}-cell-caps`))
  g.add(instances(orient(new THREE.CylinderGeometry(0.0038, 0.0038, 0.0014, 14), 'x'), zs.map((z, i) => [(i % 2 === 0 ? 1 : -1) * (CELL_L / 2 + 0.0006), cy, z] as V3), mat.cellCap, `${name}-cell-buttons`))
  // Nickel strips across both ends of the string
  for (const e of [-1, 1]) {
    g.add(box(0.0005, 0.007, n * pitch - 0.004, mat.solder, `${name}-nickel`, [e * (CELL_L / 2 + 0.0014), cy, 0]))
    g.add(box(0.0005, cy - 0.0016, 0.004, mat.solder, `${name}-nickel-tab`, [e * (CELL_L / 2 + 0.0014), (cy + 0.0016) / 2, (n * pitch) / 2 - 0.004]))
  }
  // Thermistor bead taped to the middle cell
  g.add(box(0.008, 0.0004, 0.006, mat.kapton, `${name}-thermistor-tape`, [-0.008, cy + CELL_R + 0.0001, zs[Math.floor(n / 2)]]))
  g.add(sphere(0.0014, mat.chip, `${name}-thermistor`, [-0.008, cy + CELL_R + 0.0008, zs[Math.floor(n / 2)]], 8))
  return g
}

function battery(id: string, layers: number, perLayer: number) {
  const g = group(id)
  const foot = 0.004
  const pitch = 0.0195
  const layerH = 0.0016 + CELL_R * 2 + 0.0035
  const span = perLayer * pitch
  g.add(hexes(HOLES.map(([x, , z]) => [x, foot / 2, z] as V3), 0.003, foot, mat.aluminium, 'feet'))

  // Deck 1 is the battery-management board (blue); a second deck (green) carries the upper cells
  let y = foot + 0.0008
  for (let l = 0; l < layers; l++) {
    const b = board(`${id}-deck-${l + 1}`, l === 0 ? mat.pcbBlue : mat.pcb, { header: true })
    b.position.y = y
    g.add(b)
    const layer = cellLayer(`${id}-cells-${l + 1}`, perLayer)
    layer.position.set(0, y + 0.0008, 0.003)
    g.add(layer)
    // Protection MOSFETs, fuse and sense resistor on the left strip beside the cells
    g.add(chips(`${id}-protection-${l + 1}`, [[0.006, 0.0018, 0.005, -0.041, -0.02], [0.006, 0.0018, 0.005, -0.041, -0.012], [0.005, 0.0014, 0.003, -0.041, -0.003]].map(([w, h, d, x, z]) => [w, h, d, x, z] as [number, number, number, number, number])).translateY(y))
    g.add(box(0.004, 0.002, 0.008, mat.solder, `${id}-shunt-${l + 1}`, [-0.041, y + 0.0018, 0.008]))
    // Clamp strap over the cells (medium and large)
    if (perLayer > 2) {
      const ys = y + 0.0008 + 0.0016 + CELL_R * 2 + 0.0008
      g.add(box(0.006, 0.0014, span + 0.012, mat.aluminium, `${id}-strap-${l + 1}`, [0.014, ys, 0.003]))
      g.add(box(0.0062, 0.0004, span + 0.004, mat.kapton, `${id}-strap-liner-${l + 1}`, [0.014, ys - 0.0009, 0.003]))
      for (const e of [-1, 1]) {
        g.add(cyl(0.0022, 0.0022, ys - y, mat.aluminium, `${id}-strap-post`, 'y', [0.014, y + (ys - y) / 2, 0.003 + e * (span / 2 + 0.004)], 6))
        g.add(bolts([[0.014, ys + 0.0008, 0.003 + e * (span / 2 + 0.004)]], 'y', `${id}-strap-screw`, 0.0016))
      }
    }
    const yNext = y + layerH + 0.0016
    if (l < layers - 1) g.add(hexes(HOLES.map(([x, , z]) => [x, (y + yNext) / 2, z] as V3), 0.0028, yNext - y, mat.aluminium, `${id}-standoffs-${l + 1}`))
    y = yNext
  }
  const yTop = y - 0.0016

  // Battery management on the right strip of the base deck: monitor IC, balancing resistors, LED
  const yb = foot + 0.0008
  const bms = group(`${id}-bms`)
  bms.position.y = yb
  bms.add(chips(`${id}-bms-ics`, [[0.008, 0.0016, 0.01, 0.0405, -0.022], [0.006, 0.0012, 0.005, 0.0405, -0.008]]))
  const bal: V3[] = []
  for (let i = 0; i < perLayer * layers; i++) bal.push([0.0385 + (i % 2) * 0.004, 0.0013, 0.001 + Math.floor(i / 2) * 0.0035])
  bms.add(instances(new THREE.BoxGeometry(0.0025, 0.001, 0.0016), bal, mat.ceramic, `${id}-bms-balancers`))
  bms.add(leds(`${id}-bms-led`, [0.044], 0.041, [mat.ledGreen]))
  // Main power connector on the right edge with a pigtail and inline plug
  bms.add(rblock(0.007, 0.007, 0.016, 0.0012, mat.anodized, `${id}-power-connector`, [0.043, 0.0043, 0.027]))
  bms.add(box(0.0008, 0.004, 0.012, mat.anodizedGold, `${id}-power-connector-pins`, [0.0468, 0.0043, 0.027]))
  bms.add(tube([[0.046, 0.005, 0.023], [0.056, 0.004, 0.022], [0.064, 0.001, 0.016], [0.068, -0.003, 0.008]], 0.0016, mat.paintRed, `${id}-lead-pos`, 16, 6))
  bms.add(tube([[0.046, 0.005, 0.031], [0.057, 0.004, 0.031], [0.066, 0.001, 0.025], [0.07, -0.003, 0.017]], 0.0016, mat.rubber, `${id}-lead-neg`, 16, 6))
  const plug = rblock(0.012, 0.008, 0.016, 0.002, mat.anodized, `${id}-plug`, [0.071, -0.0037, 0.012])
  plug.rotation.y = 0.5
  bms.add(plug)
  // Inhibit header with a red arming jumper (pulled before flight)
  bms.add(box(0.004, 0.004, 0.008, mat.chip, `${id}-inhibit-header`, [-0.041, 0.0028, 0.03]))
  bms.add(box(0.0045, 0.0045, 0.005, mat.paintRed, `${id}-inhibit-jumper`, [-0.041, 0.0055, 0.03]))
  g.add(bms)

  // Threaded rods through the whole pack with nuts on top
  const rodTop = yTop + 0.004
  g.add(instances(new THREE.CylinderGeometry(0.0015, 0.0015, rodTop, 8), HOLES.map(([x, , z]) => [x, rodTop / 2, z] as V3), mat.titanium, `${id}-rods`))
  g.add(hexes(HOLES.map(([x, , z]) => [x, yTop - layerH + 0.004, z] as V3), 0.0032, 0.0026, mat.aluminium, `${id}-nuts`))
  g.add(hexes(HOLES.map(([x, , z]) => [x, rodTop - 0.0013, z] as V3), 0.0032, 0.0026, mat.aluminium, `${id}-nuts-top`))
  // Large pack: aluminium clamp cheeks across both decks, with lightening windows
  if (layers > 1) {
    for (const sx of [-1, 1]) {
      const hgt = yTop - foot - 0.004
      const cheek = cutPlate(0.05, hgt, 0.002, [{ x: 0, y: 0.002, w: 0.032, h: hgt * 0.5, r: 0.005 }], mat.aluminium, `${id}-cheek`)
      cheek.rotation.y = PI / 2
      cheek.position.set(sx * 0.0372, foot + 0.002 + hgt / 2, 0.003)
      g.add(cheek)
    }
  }
  g.userData = { cells: layers * perLayer }
  return settle(g)
}

/* ================================================================ computers */

function computerBasic() {
  const g = group('computer-basic')
  const foot = 0.004
  g.add(hexes(HOLES.map(([x, , z]) => [x, foot / 2, z] as V3), 0.003, foot, mat.aluminium, 'feet'))
  // Lower deck: interface board (blue) with the debug port and bus transceivers
  const ya = foot + 0.0008
  const a = board('io-board', mat.pcbBlue)
  a.position.y = ya
  a.add(chips('io-ics', [[0.007, 0.0012, 0.005, -0.03, 0.02], [0.007, 0.0012, 0.005, -0.03, 0.008], [0.007, 0.0012, 0.005, 0.03, 0.02], [0.01, 0.0014, 0.006, 0.028, 0.006]]))
  a.add(microD('debug-port', 0.013, [-0.012, 0.0042, 0.039]))
  a.add(leds('io-leds', [0.016, 0.021], 0.041, [mat.ledGreen, mat.ledAmber]))
  g.add(a)
  // Upper deck: the processor board (green)
  const yb = ya + 0.0125
  g.add(hexes(HOLES.map(([x, , z]) => [x, (ya + yb) / 2, z] as V3), 0.0028, yb - ya, mat.aluminium, 'standoffs'))
  const b = board('obc-board', mat.pcb)
  b.position.y = yb
  b.add(rblock(0.021, 0.0022, 0.021, 0.001, mat.chip, 'cpu', [-0.006, 0.0019, 0.004]))
  b.add(rblock(0.015, 0.0012, 0.015, 0.0015, mat.aluminium, 'cpu-lid', [-0.006, 0.0036, 0.004]))
  b.add(chips('memory', [[0.013, 0.0014, 0.008, 0.022, 0.016], [0.013, 0.0014, 0.008, 0.022, 0.004], [0.011, 0.0012, 0.006, 0.022, -0.008], [0.006, 0.001, 0.006, -0.032, -0.022], [0.004, 0.0009, 0.004, 0.006, -0.024]]))
  b.add(rblock(0.006, 0.0016, 0.003, 0.0012, mat.solder, 'crystal', [-0.024, 0.0016, -0.01]))
  // SD card slot with the card inserted from the front
  b.add(box(0.014, 0.0022, 0.016, mat.aluminium, 'sd-holder', [-0.031, 0.0019, 0.022]))
  b.add(box(0.011, 0.0009, 0.007, mat.anodizedBlue, 'sd-card', [-0.031, 0.002, 0.0325]))
  const caps: V3[] = []
  for (let i = 0; i < 12; i++) caps.push([-0.0175 + (i % 6) * 0.0045, 0.0013, -0.012 + Math.floor(i / 6) * 0.0032])
  b.add(instances(new THREE.BoxGeometry(0.002, 0.001, 0.0012), caps, mat.copper, 'capacitors'))
  b.add(leds('status-leds', [0.022, 0.027, 0.032, 0.037], 0.041, [mat.ledGreen, mat.ledGreen, mat.ledAmber, mat.ledRed]))
  // Watchdog reset header with a jumper
  b.add(box(0.006, 0.003, 0.003, mat.chip, 'reset-header', [0.006, 0.0023, 0.036]))
  b.add(box(0.0035, 0.0035, 0.0028, mat.paintNavy, 'reset-jumper', [0.0045, 0.0045, 0.036]))
  g.add(b)
  // Stack-through connector body between the decks
  g.add(box(0.08, yb - ya - 0.0085, 0.0056, mat.anodized, 'stack-connector', [0, ya + 0.0085 + (yb - ya - 0.0085) / 2, -0.0405]))
  g.add(instances(new THREE.CylinderGeometry(0.0015, 0.0015, yb + 0.006, 8), HOLES.map(([x, , z]) => [x, (yb + 0.006) / 2, z] as V3), mat.titanium, 'rods'))
  g.add(hexes(HOLES.map(([x, , z]) => [x, yb + 0.0028, z] as V3), 0.0032, 0.0026, mat.aluminium, 'nuts'))
  return settle(g)
}

/** One half-width processor board of the hardened computer (lane A or B) */
function laneBoard(name: string, m: THREE.Material) {
  const g = group(name)
  g.add(box(0.04, 0.0016, 0.08, m, `${name}-pcb`))
  g.add(rblock(0.018, 0.002, 0.018, 0.001, mat.chip, `${name}-cpu`, [0, 0.0018, 0.012]))
  // Tantalum spot shields over the processor and the two memories
  g.add(rblock(0.022, 0.004, 0.022, 0.0025, pmat.tantalum, `${name}-shield-cpu`, [0, 0.0045, 0.012]))
  g.add(bolts([[-0.0085, 0.0066, 0.0035], [0.0085, 0.0066, 0.0035], [-0.0085, 0.0066, 0.0205], [0.0085, 0.0066, 0.0205]], 'y', `${name}-shield-screws`, 0.0012))
  g.add(rblock(0.014, 0.003, 0.009, 0.0015, pmat.tantalum, `${name}-shield-mem-1`, [-0.006, 0.0023, -0.012]))
  g.add(rblock(0.014, 0.003, 0.009, 0.0015, pmat.tantalum, `${name}-shield-mem-2`, [-0.006, 0.0023, -0.024]))
  g.add(chips(`${name}-fpga`, [[0.011, 0.0016, 0.011, 0.011, -0.018], [0.005, 0.001, 0.004, 0.012, -0.031], [0.005, 0.001, 0.004, -0.013, 0.033]]))
  g.add(rblock(0.005, 0.0013, 0.0025, 0.001, mat.solder, `${name}-crystal`, [0.014, 0.0014, -0.004]))
  // Cross-strap connector at the back
  g.add(box(0.016, 0.005, 0.006, mat.anodized, `${name}-xstrap-connector`, [0, 0.0033, -0.034]))
  return g
}

function computerRedundant() {
  const g = group('computer-redundant')
  const ew = 0.096
  const ed = 0.092
  const eh = 0.032
  const wall = 0.003
  // Machined aluminium enclosure: floor, walls, centre shielding wall, mounting ears
  g.add(rblock(ew, wall, ed, 0.004, mat.aluminium, 'enclosure-floor', [0, wall / 2, 0]))
  for (const sx of [-1, 1]) g.add(box(wall, eh - wall, ed, mat.aluminium, 'enclosure-wall-side', [sx * (ew / 2 - wall / 2), wall + (eh - wall) / 2, 0]))
  g.add(box(ew - wall * 2, eh - wall, wall, mat.aluminium, 'enclosure-wall-back', [0, wall + (eh - wall) / 2, -ed / 2 + wall / 2]))
  g.add(box(ew - wall * 2, eh - wall, wall, mat.aluminium, 'enclosure-wall-front', [0, wall + (eh - wall) / 2, ed / 2 - wall / 2]))
  g.add(box(0.0025, eh - wall - 0.008, ed - wall * 2, mat.aluminiumDark, 'enclosure-divider', [0, wall + (eh - wall - 0.008) / 2, 0]))
  // Wall top lip and screw holes for the (removed) lid
  const lid: V3[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) lid.push([sx * (ew / 2 - wall / 2), eh + 0.0002, sz * (ed / 2 - 0.008)])
  g.add(bolts(lid, 'y', 'lid-screw-holes', 0.0011, mat.anodized))
  // Cooling ribs on the side walls
  for (const sx of [-1, 1]) for (const y of [0.01, 0.017, 0.024]) g.add(box(0.0022, 0.0022, ed - 0.03, mat.aluminium, 'enclosure-rib', [sx * (ew / 2 + 0.0011), y, -0.006]))
  // Mounting ears at the corners
  const ears: V3[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ears.push([sx * (ew / 2 + 0.006), 0.0015, sz * (ed / 2 - 0.009)])
  g.add(instances(new THREE.BoxGeometry(0.012, 0.003, 0.014), ears, mat.aluminium, 'enclosure-ears'))
  g.add(bolts(at(ears, 0, 0.0018, 0), 'y', 'ear-screws', 0.0024))

  // The two processor lanes
  const lanes: [string, number, THREE.Material][] = [
    ['lane-a', -0.0235, mat.pcb],
    ['lane-b', 0.0235, mat.pcb],
  ]
  for (const [name, x, m] of lanes) {
    const b = laneBoard(name, m)
    b.position.set(x, wall + 0.006, 0)
    g.add(b)
    g.add(hexes([[x - 0.016, wall + 0.003, -0.034], [x + 0.016, wall + 0.003, -0.034], [x - 0.016, wall + 0.003, 0.034], [x + 0.016, wall + 0.003, 0.034]], 0.0024, 0.006, mat.aluminium, `${name}-standoffs`))
  }
  // Cross-strapping cables: each lane's connector to the other's spare port, crossing over the divider
  const yb = wall + 0.006 + 0.0008
  g.add(tube([[-0.0235, yb + 0.006, -0.034], [-0.014, yb + 0.022, -0.03], [0.012, yb + 0.022, -0.012], [0.023, yb + 0.008, -0.004], [0.023, yb + 0.004, -0.002]], 0.0019, pmat.wireWhite, 'xstrap-a-to-b', 40))
  g.add(tube([[0.0235, yb + 0.006, -0.034], [0.014, yb + 0.026, -0.03], [-0.012, yb + 0.026, -0.012], [-0.023, yb + 0.008, -0.004], [-0.023, yb + 0.004, -0.002]], 0.0019, mat.anodizedBlue, 'xstrap-b-to-a', 40))
  for (const sx of [-1, 1]) {
    g.add(rblock(0.012, 0.004, 0.006, 0.001, mat.anodized, 'xstrap-port', [sx * 0.023, yb + 0.002, -0.002]))
    g.add(rblock(0.012, 0.004, 0.004, 0.0012, mat.solder, 'xstrap-plug', [sx * 0.023, yb + 0.006, -0.002]))
  }
  // Front panel: one connector per lane, light pipes in lane groups, colour-coded lane tabs
  const zf = ed / 2
  for (const [sx, tab] of [
    [-1, mat.anodizedBlue],
    [1, mat.paintOrange],
  ] as const) {
    g.add(microD(`front-connector-${sx < 0 ? 'a' : 'b'}`, 0.018, [sx * 0.024, 0.02, zf], mat.anodizedGold))
    const lp: [number, THREE.Material][] = [
      [0.034, mat.ledGreen],
      [0.028, mat.ledGreen],
      [0.022, mat.ledAmber],
      [0.016, mat.ledGreen],
    ]
    lp.forEach(([x, m], i) => g.add(cyl(0.0014, 0.0014, 0.0022, m, `light-pipe-${sx < 0 ? 'a' : 'b'}-${i}`, 'z', [sx * x, 0.0085, zf + 0.0011], 10)))
    g.add(box(0.024, 0.0035, 0.0008, tab, `lane-tab-${sx < 0 ? 'a' : 'b'}`, [sx * 0.025, 0.0285, zf + 0.0004]))
  }
  g.add(cyl(0.0017, 0.0017, 0.0024, mat.ledRed, 'light-pipe-watchdog', 'z', [0, 0.0085, zf + 0.0012], 10))
  g.add(box(0.006, 0.006, 0.0008, mat.anodized, 'watchdog-bezel', [0, 0.0085, zf + 0.0002]))
  g.add(bolts([[-0.044, 0.004, zf + 0.0006], [0.044, 0.004, zf + 0.0006], [-0.044, 0.028, zf + 0.0006], [0.044, 0.028, zf + 0.0006]], 'z', 'front-screws', 0.0015))
  return settle(g)
}

/* ================================================================ attitude control */

/** Magnetorquer rod along +Y (turned by the caller): copper winding, end caps, ferrite core tips */
function torquerRod(name: string, len: number, r: number) {
  const g = group(name)
  const pts: [number, number][] = [[0, -len / 2]]
  const turns = 22
  for (let i = 0; i <= turns; i++) {
    const y = -len / 2 + 0.006 + ((len - 0.012) * i) / turns
    pts.push([r * (i % 2 === 0 ? 0.94 : 1), y])
  }
  pts.push([0, len / 2])
  g.add(solid(pts, mat.copper, `${name}-winding`, [0, 0, 0], 20))
  for (const e of [-1, 1]) {
    g.add(cyl(r + 0.0009, r + 0.0009, 0.006, mat.anodized, `${name}-cap`, 'y', [0, e * (len / 2 - 0.003), 0], 20))
    g.add(cyl(0.0022, 0.0022, 0.004, mat.titanium, `${name}-core`, 'y', [0, e * (len / 2 + 0.0015), 0], 12))
  }
  // Lead wires
  g.add(tube([[r * 0.7, len / 2 - 0.004, 0], [r + 0.002, len / 2 - 0.01, r * 0.5], [r + 0.001, len / 2 - 0.018, r + 0.002]], 0.0007, mat.paintRed, `${name}-lead-a`, 10, 4))
  g.add(tube([[-r * 0.7, len / 2 - 0.004, 0], [-r - 0.002, len / 2 - 0.01, r * 0.5], [-r - 0.001, len / 2 - 0.018, r + 0.002]], 0.0007, mat.rubber, `${name}-lead-b`, 10, 4))
  return g
}

/** Exposed reaction wheel, spin axis +Y, base at y = 0 */
function reactionWheel(name: string, r: number, h: number) {
  const g = group(name)
  // Housing cup: flange, motor body
  g.add(solid([[0, 0], [r + 0.002, 0], [r + 0.002, 0.0022], [r * 0.7, 0.0022], [r * 0.7, h * 0.45], [0, h * 0.45]], mat.aluminiumDark, `${name}-housing`, [0, 0, 0], 32))
  // Flywheel: heavy rim, four spokes, hub
  const rimY = h * 0.45 + 0.0012
  g.add(solid([[r - 0.0035, rimY], [r, rimY], [r, rimY + h * 0.42], [r - 0.0035, rimY + h * 0.42]], mat.titanium, `${name}-rim`, [0, 0, 0], 40))
  g.add(solid([[r - 0.0034, rimY + h * 0.36], [r + 0.0004, rimY + h * 0.36], [r + 0.0004, rimY + h * 0.42], [r - 0.0034, rimY + h * 0.42]], mat.anodizedGold, `${name}-rim-band`, [0, 0, 0], 40))
  for (let i = 0; i < 4; i++) {
    const s = box(r * 2 - 0.006, 0.0018, 0.003, mat.aluminium, `${name}-spoke`, [0, rimY + h * 0.2, 0])
    s.rotation.y = (i * PI) / 4 + (i > 1 ? PI / 4 : 0)
    if (i < 2) g.add(s)
  }
  g.add(cyl(0.0045, 0.0045, h * 0.42, mat.aluminium, `${name}-hub`, 'y', [0, rimY + h * 0.21, 0], 16))
  g.add(cyl(0.0022, 0.0022, 0.0015, mat.anodized, `${name}-hub-nut`, 'y', [0, rimY + h * 0.42 + 0.0007, 0], 6))
  // Balance weights on the rim
  g.add(bolts([[r - 0.0017, rimY + h * 0.42 + 0.0006, 0], [-(r - 0.0017), rimY + h * 0.42 + 0.0006, 0]], 'y', `${name}-balance`, 0.0009))
  return g
}

/** Coarse sun sensor: dark body with a glass window facing +Y */
function sunSensor(name: string, pos: V3, rot: V3 = [0, 0, 0]) {
  const g = group(name)
  g.position.set(...pos)
  g.rotation.set(...rot)
  g.add(rblock(0.012, 0.004, 0.012, 0.002, mat.anodized, `${name}-body`, [0, 0.002, 0]))
  g.add(box(0.007, 0.0008, 0.007, mat.glass, `${name}-window`, [0, 0.0043, 0]))
  g.add(box(0.003, 0.0006, 0.003, mat.gold, `${name}-diode`, [0, 0.0043, 0]))
  return g
}

function attitudeBasic() {
  const g = group('attitude-basic')
  const foot = 0.004
  g.add(hexes(HOLES.map(([x, , z]) => [x, foot / 2, z] as V3), 0.003, foot, mat.aluminium, 'feet'))
  const b = board('adcs-board', mat.pcbBlue)
  b.position.y = foot + 0.0008
  g.add(b)
  const yt = foot + 0.0016
  // Embedded air-core coil (Z torquer) around the board edge
  const coil = cutPlate(0.088, 0.083, 0.0016, [{ x: 0, y: 0, w: 0.078, h: 0.073, r: 0.006 }], mat.copper, 'air-coil')
  coil.rotation.x = -PI / 2
  coil.position.y = yt + 0.0008
  g.add(coil)
  // Two magnetorquer rods (X and Y axes) in saddle clamps
  const rx = torquerRod('torquer-x', 0.064, 0.0058)
  rx.rotation.z = PI / 2
  rx.position.set(-0.004, yt + 0.0075, -0.026)
  g.add(rx)
  const rz = torquerRod('torquer-y', 0.06, 0.0058)
  rz.rotation.x = PI / 2
  rz.position.set(0.031, yt + 0.0075, 0.008)
  g.add(rz)
  for (const [x, z, ry] of [
    [-0.024, -0.026, 0],
    [0.016, -0.026, 0],
    [0.031, -0.012, PI / 2],
    [0.031, 0.028, PI / 2],
  ]) {
    const s = box(0.005, 0.009, 0.015, mat.aluminium, 'rod-clamp', [x, yt + 0.0045, z])
    s.rotation.y = ry + PI / 2
    g.add(s)
  }
  // One small reaction wheel
  const rw = reactionWheel('reaction-wheel', 0.0155, 0.018)
  rw.position.set(-0.014, yt, 0.012)
  g.add(rw)
  g.add(bolts([[-0.014 + 0.0165, yt + 0.0026, 0.012], [-0.014 - 0.0165, yt + 0.0026, 0.012], [-0.014, yt + 0.0026, 0.012 + 0.0165], [-0.014, yt + 0.0026, 0.012 - 0.0165]], 'y', 'wheel-screws', 0.0012))
  // Coarse sun sensors: two on the top corners, two looking out the front and the side
  g.add(sunSensor('sun-sensor-1', [-0.035, yt, 0.035]))
  g.add(sunSensor('sun-sensor-2', [0.034, yt + 0.0, -0.035]))
  g.add(box(0.016, 0.016, 0.002, mat.aluminium, 'sun-bracket-front', [0.012, yt + 0.008, 0.042]))
  g.add(sunSensor('sun-sensor-3', [0.012, yt + 0.009, 0.043], [PI / 2, 0, 0]))
  // Magnetometer, controller and LED
  g.add(chips('adcs-ics', [[0.009, 0.0016, 0.009, 0.012, 0.032], [0.005, 0.0012, 0.005, -0.036, 0.012], [0.006, 0.001, 0.004, -0.036, -0.002]].map(([w, h, d, x, z]) => [w, h, d, x, z] as [number, number, number, number, number])).translateY(yt - 0.0008) as THREE.Mesh)
  g.add(leds('adcs-leds', [0.038], 0.041, [mat.ledGreen], yt - 0.0008))
  // Rods and nuts
  g.add(instances(new THREE.CylinderGeometry(0.0015, 0.0015, 0.024, 8), HOLES.map(([x, , z]) => [x, 0.012, z] as V3), mat.titanium, 'rods'))
  g.add(hexes(HOLES.map(([x, , z]) => [x, yt + 0.0016, z] as V3), 0.0032, 0.0026, mat.aluminium, 'nuts'))
  return settle(g)
}

function attitudePrecision() {
  const g = group('attitude-precision')
  const S = 0.098
  const HH = 0.05
  // Chassis: base plate, two closed walls (back, left), open frame on the front and right
  g.add(rblock(S, 0.004, S, 0.004, mat.anodized, 'base-plate', [0, 0.002, 0]))
  g.add(box(S, HH - 0.004, 0.003, mat.anodized, 'wall-back', [0, 0.004 + (HH - 0.004) / 2, -S / 2 + 0.0015]))
  g.add(box(0.003, HH - 0.004, S, mat.anodized, 'wall-left', [-S / 2 + 0.0015, 0.004 + (HH - 0.004) / 2, 0]))
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
  ])
    g.add(box(0.007, HH - 0.004, 0.007, mat.aluminium, 'corner-post', [x * (S / 2 - 0.0035), 0.004 + (HH - 0.004) / 2, z * (S / 2 - 0.0035)]))
  // Top frame
  g.add(box(S, 0.004, 0.008, mat.aluminium, 'top-frame', [0, HH - 0.002, S / 2 - 0.004]))
  g.add(box(S, 0.004, 0.008, mat.aluminium, 'top-frame', [0, HH - 0.002, -S / 2 + 0.004]))
  g.add(box(0.008, 0.004, S, mat.aluminium, 'top-frame', [S / 2 - 0.004, HH - 0.002, 0]))
  g.add(box(0.008, 0.004, S, mat.aluminium, 'top-frame', [-S / 2 + 0.004, HH - 0.002, 0]))
  const ts: V3[] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ts.push([sx * (S / 2 - 0.004), HH + 0.0002, sz * (S / 2 - 0.004)])
  g.add(bolts(ts, 'y', 'top-screws', 0.0018))
  const ws: V3[] = []
  for (const x of [-0.035, 0, 0.035]) for (const y of [0.012, 0.04]) ws.push([x, y, -S / 2])
  g.add(bolts(ws, 'z', 'wall-screws', 0.0016))
  // Bottom electronics board
  const b = board('control-board', mat.pcb, { header: false, pads: false, w: 0.09, d: 0.09 })
  b.position.y = 0.0048
  b.add(chips('control-ics', [[0.012, 0.0016, 0.012, 0.03, 0.03], [0.008, 0.0012, 0.008, -0.03, 0.032], [0.008, 0.0012, 0.006, 0.033, -0.01]]))
  g.add(b)

  // Three reaction wheels in a pyramid, axes tilted out from vertical
  const tilt = 0.6
  const rad = 0.022
  for (let i = 0; i < 3; i++) {
    const az = (i * 2 * PI) / 3 + PI / 6
    const holder = group(`wheel-${i + 1}`)
    holder.position.set(Math.sin(az) * rad, 0.011, Math.cos(az) * rad)
    holder.rotation.set(tilt, az, 0, 'YXZ')
    // Angled mount bracket under the wheel
    holder.add(cyl(0.012, 0.014, 0.008, mat.aluminium, `wheel-${i + 1}-mount`, 'y', [0, -0.004, 0], 20))
    holder.add(reactionWheel(`wheel-${i + 1}-rw`, 0.0165, 0.018))
    g.add(holder)
  }
  // Gyro module on a centre pedestal
  g.add(cyl(0.004, 0.005, 0.014, mat.aluminium, 'gyro-pedestal', 'y', [0, 0.012, 0], 12))
  g.add(rblock(0.018, 0.011, 0.018, 0.002, mat.anodizedBlue, 'gyro-module', [0, 0.0235, 0]))
  g.add(rblock(0.014, 0.0012, 0.014, 0.0015, mat.anodizedGold, 'gyro-lid', [0, 0.0295, 0]))
  g.add(bolts([[-0.0065, 0.0304, -0.0065], [0.0065, 0.0304, -0.0065], [-0.0065, 0.0304, 0.0065], [0.0065, 0.0304, 0.0065]], 'y', 'gyro-screws', 0.0009))

  // Star tracker: camera head on the back-left corner, long black baffle with internal vanes
  // Tilted on a machined wedge so the head sits flat on its seat instead of balancing on a corner
  const tiltA = 0.8
  const half = 0.018
  const h0 = half * Math.tan(tiltA) + 0.003
  const wshape = new THREE.Shape([
    new THREE.Vector2(-half, 0),
    new THREE.Vector2(half, 0),
    new THREE.Vector2(half, h0 - half * Math.tan(tiltA)),
    new THREE.Vector2(-half, h0 + half * Math.tan(tiltA)),
  ])
  const wgeo = new THREE.ExtrudeGeometry(wshape, { depth: 0.034, bevelEnabled: false })
  wgeo.rotateY(-PI / 2)
  wgeo.translate(0.017, 0, 0)
  const wedge = new THREE.Group()
  wedge.name = 'tracker-wedge'
  wedge.position.set(-0.024, HH + 0.002, -0.026)
  wedge.rotation.y = -PI / 2.6
  wedge.add(mesh(wgeo, mat.aluminium, 'tracker-wedge-block'))
  g.add(wedge)
  const st = group('star-tracker')
  st.position.set(-0.024, HH + 0.002 + h0, -0.026)
  st.rotation.set(tiltA, -PI / 2.6, 0, 'YXZ')
  st.add(rblock(0.032, 0.022, 0.032, 0.004, mat.anodized, 'tracker-head', [0, 0.011, 0]))
  st.add(box(0.026, 0.0012, 0.008, mat.anodizedGold, 'tracker-label', [0, 0.012, 0.0162]))
  st.add(cyl(0.012, 0.013, 0.008, mat.aluminium, 'tracker-lens-mount', 'y', [0, 0.026, 0], 24))
  const bl = 0.058
  const r0 = 0.0125
  const r1 = 0.0175
  const prof: [number, number][] = [[r0 - 0.0015, 0.03], [r0 + 0.001, 0.03], [r1 + 0.001, 0.03 + bl], [r1 + 0.002, 0.03 + bl + 0.0015]]
  // Inner wall with knife-edge vanes, back down to the lens
  const vanes = 6
  const inner: [number, number][] = [[r1 - 0.0005, 0.03 + bl + 0.0015]]
  for (let v = vanes; v >= 1; v--) {
    const y = 0.03 + (bl * v) / (vanes + 0.5)
    const rw = r0 + ((r1 - r0) * (y - 0.03)) / bl - 0.0005
    inner.push([rw, y + 0.002], [rw - 0.0045, y + 0.0002], [rw, y - 0.0004])
  }
  inner.push([r0 - 0.0015, 0.0315])
  st.add(solid([...prof, ...inner], mat.anodized, 'tracker-baffle', [0, 0, 0], 36))
  st.add(cyl(r0 - 0.0016, r0 - 0.0016, 0.0016, mat.lens, 'tracker-lens', 'y', [0, 0.031, 0], 24))
  // Machined bands and a bright lip so the baffle reads as optics, not a cone
  for (const f of [0.3, 0.62]) {
    const rr = r0 + (r1 - r0) * f + 0.0016
    st.add(cyl(rr, rr, 0.003, mat.aluminium, 'tracker-band', 'y', [0, 0.03 + bl * f, 0], 32))
  }
  st.add(solid([[r1 - 0.0006, 0.03 + bl], [r1 + 0.0028, 0.03 + bl], [r1 + 0.0028, 0.03 + bl + 0.003], [r1 - 0.0006, 0.03 + bl + 0.003]], mat.aluminium, 'tracker-lip', [0, 0, 0], 36))
  st.add(box(0.008, 0.004, 0.003, mat.anodized, 'tracker-strut', [0, 0.04, r0 + 0.002]))
  g.add(st)
  // Flange and harness to the tracker
  g.add(rblock(0.04, 0.003, 0.04, 0.004, mat.aluminium, 'tracker-flange', [-0.024, HH + 0.0005, -0.026]))
  g.add(tube([[-0.044, HH - 0.004, 0.0], [-0.052, HH - 0.01, -0.01], [-0.052, 0.02, -0.03], [-0.044, 0.01, -0.035]], 0.0018, pmat.wireWhite, 'tracker-harness', 24))
  // Side connector and a raised identification plate on the left wall
  const c = microD('main-connector', 0.022, [-S / 2, 0.022, 0.018])
  c.rotation.y = -PI / 2
  g.add(c)
  g.add(box(0.0008, 0.012, 0.04, mat.aluminium, 'id-plate', [-S / 2 - 0.0004, 0.036, -0.012]))
  g.add(box(0.0006, 0.004, 0.03, mat.anodizedGold, 'id-plate-band', [-S / 2 - 0.0009, 0.036, -0.012]))
  return settle(g)
}

/* ================================================================ export */

export const models: Record<string, () => THREE.Object3D> = {
  'bus-6u': bus6u,
  'solar-body': solarBody,
  'solar-1wing': () => solarWings('solar-1wing', { panels: 3, pw: 0.088, cols: 2, rows: 4, frame: mat.aluminium }),
  'solar-2wing': () => solarWings('solar-2wing', { panels: 5, pw: 0.074, cols: 2, rows: 5, frame: mat.carbon, gimbal: { yoke: 0.024, tilt: 0.6 } }),
  'battery-small': () => battery('battery-small', 1, 2),
  'battery-medium': () => battery('battery-medium', 1, 4),
  'battery-large': () => battery('battery-large', 2, 4),
  'computer-basic': computerBasic,
  'computer-redundant': computerRedundant,
  'attitude-basic': attitudeBasic,
  'attitude-precision': attitudePrecision,
}
