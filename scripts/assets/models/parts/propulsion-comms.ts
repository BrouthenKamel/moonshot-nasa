/**
 * Propulsion and radio parts: one game-ready model per catalogue choice (src/data/parts.ts).
 *
 *   prop-coldgas          0.6U  cold-gas tray: titanium tank, manifold, four corner nozzles
 *   prop-chemical         2.4U  green monopropellant block: one tank dome, four thrusters
 *   prop-chemical-large   2.9U  longer block with twin tank domes, bigger thrusters
 *   prop-ion              1.5U  gridded RF ion thruster: tank, power boards, gimballed head
 *   prop-ion-large        1.6U  same family, bigger grid and head, longer tank
 *   radio-uhf             0.2U  transceiver board plus four tape-spring whips (pivot_antennas)
 *   radio-sband           0.5U  finned deep-space radio with a 2 x 2 patch array plate
 *   radio-xband           1.2U  sliced transponder plus a three-panel reflectarray (pivot_dish)
 *                               and its feed horn boom (pivot_feed)
 *
 * Conventions from ../kit.ts: +Y up, +Z is the face that looks out of the craft (thrusters,
 * grids, antennas), origin at the centre of the footprint on y = 0, 1 unit = 1 m.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { box, cyl, group, instances, lathe, mat, mesh, pcb, rbox, settle, type V3 } from '../kit.ts'

/* ---------------------------------------------------------------- local materials */

const std = (name: string, color: string, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ name, color, metalness, roughness, ...extra })

/** Materials this group needs beyond the kit palette */
const pm = {
  /** Faint discharge glow seen through the ion grid apertures (a real emitter) */
  ionFaint: std('ion_glow_faint', '#0f1d36', 0, 0.5, { emissive: '#5fb4ff', emissiveIntensity: 1.2 }),
  /** Molybdenum ion-optics grid */
  moly: std('moly_grid', '#9aa0a8', 0.75, 0.42),
  /** Rhenium / iridium thruster chambers and bells */
  rhenium: std('thruster_rhenium', '#77726d', 0.9, 0.38),
  /** Sooted nozzle and chamber interiors (seen from both sides) */
  soot: std('nozzle_soot', '#141518', 0.5, 0.7, { side: THREE.DoubleSide }),
  /** Spring-steel tape antenna (thin curved strip, seen from both sides) */
  tape: std('tape_steel', '#cfd3d8', 0.9, 0.28, { side: THREE.DoubleSide }),
  /** Reflectarray substrate (dark laminate) */
  laminate: std('reflectarray_laminate', '#1d2a3a', 0.3, 0.5),
}

/* ---------------------------------------------------------------- helpers */

const TAU = Math.PI * 2

function rectPath(p: THREE.Path, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  const x0 = x - w / 2
  const y0 = y - h / 2
  p.moveTo(x0 + rr, y0)
  p.lineTo(x0 + w - rr, y0)
  p.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr)
  p.lineTo(x0 + w, y0 + h - rr)
  p.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h)
  p.lineTo(x0 + rr, y0 + h)
  p.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr)
  p.lineTo(x0, y0 + rr)
  p.quadraticCurveTo(x0, y0, x0 + rr, y0)
  return p
}

const rectHole = (x: number, y: number, w: number, h: number, r = 0.003) => rectPath(new THREE.Path(), x, y, w, h, r)
const circleHole = (x: number, y: number, r: number) => new THREE.Path().absarc(x, y, r, 0, TAU, true)

/** Plate in the XY plane (normal +Z), w x h, thickness t, with real cut-outs */
function plate(w: number, h: number, t: number, holes: THREE.Path[], m: THREE.Material, name: string, r = 0.002, curve = 8) {
  const s = rectPath(new THREE.Shape(), 0, 0, w, h, r) as THREE.Shape
  s.holes.push(...holes)
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: curve })
  geo.translate(0, 0, -t / 2)
  return mesh(geo, m, name)
}

/** Ring with a rectangular section around the Z axis: inner r0, outer r1, from z0 to z1 */
function ringZ(r0: number, r1: number, z0: number, z1: number, m: THREE.Material, name: string, seg = 40) {
  const geo = new THREE.LatheGeometry(
    [
      [r0, z0],
      [r1, z0],
      [r1, z1],
      [r0, z1],
      [r0, z0],
    ].map(([a, b]) => new THREE.Vector2(a, b)),
    seg,
  )
  geo.rotateX(Math.PI / 2) // lathe height (+Y) maps to +Z
  return mesh(geo, m, name)
}

/** Pipe through points with rounded bends (bend radius `bend`) */
function pipe(name: string, pts: V3[], r: number, m: THREE.Material, bend = 0.006) {
  const v = pts.map((p) => new THREE.Vector3(...p))
  const path = new THREE.CurvePath<THREE.Vector3>()
  let cur = v[0].clone()
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1]
    const b = v[i]
    const c = v[i + 1]
    const d1 = b.clone().sub(a)
    const d2 = c.clone().sub(b)
    const k = Math.min(bend, d1.length() / 2, d2.length() / 2)
    const p1 = b.clone().sub(d1.normalize().multiplyScalar(k))
    const p2 = b.clone().add(d2.normalize().multiplyScalar(k))
    if (cur.distanceTo(p1) > 1e-6) path.add(new THREE.LineCurve3(cur, p1))
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2))
    cur = p2
  }
  path.add(new THREE.LineCurve3(cur, v[v.length - 1]))
  return mesh(new THREE.TubeGeometry(path, 10 * v.length, r, 8, false), m, name)
}

/** Smooth cable through points */
function cable(name: string, pts: V3[], r: number, m: THREE.Material = mat.rubber) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    false,
    'centripetal',
  )
  return mesh(new THREE.TubeGeometry(curve, 8 * pts.length, r, 6, false), m, name)
}

/** Rotation that turns +Y into direction d */
function alignY(d: V3) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize())
  return new THREE.Euler().setFromQuaternion(q)
}

/** Place obj at pos with its +Y pointing along dir */
function pointY<T extends THREE.Object3D>(obj: T, pos: V3, dir: V3) {
  obj.position.set(...pos)
  obj.rotation.copy(alignY(dir))
  return obj
}

/** Hex nut / fitting along Y */
const hex = (r: number, h: number, m: THREE.Material, name: string, pos: V3 = [0, 0, 0]) => cyl(r, r, h, m, name, 'y', pos, 6)

/** Screw heads on arbitrary points, facing direction n */
function screwsAt(pts: V3[], n: V3, name: string, r = 0.0018) {
  const geo = new THREE.CylinderGeometry(r, r, 0.0012, 8)
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(alignY(n)))
  return instances(geo, pts, mat.solder, name)
}

/** Ring of points of radius r around the Z axis at depth z */
const ringPts = (r: number, z: number, n: number, phase = 0): V3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * TAU
    return [Math.cos(a) * r, Math.sin(a) * r, z] as V3
  })

/** Micro-D connector facing +Z (shell, insert, jackscrews) */
function microD(name: string, w = 0.018) {
  const g = group(name)
  g.add(rbox(w, 0.0075, 0.004, 0.0015, mat.aluminium, `${name}-shell`, [0, 0, 0.002]))
  g.add(rbox(w * 0.62, 0.0042, 0.003, 0.0012, mat.anodized, `${name}-insert`, [0, 0, 0.0045]))
  for (const sx of [-1, 1]) g.add(hexAt(name, sx * (w / 2 - 0.0016)))
  return g
}
function hexAt(name: string, x: number) {
  const n = hex(0.0013, 0.004, mat.solder, `${name}-jackscrew`)
  n.rotation.x = Math.PI / 2
  n.position.set(x, 0, 0.005)
  return n
}

/** SMA coax connector facing +Z */
function sma(name: string) {
  const g = group(name)
  const nut = hex(0.0032, 0.003, mat.anodizedGold, `${name}-nut`)
  nut.rotation.x = Math.PI / 2
  nut.position.z = 0.0015
  g.add(nut)
  g.add(cyl(0.0024, 0.0024, 0.006, mat.anodizedGold, `${name}-barrel`, 'z', [0, 0, 0.006], 12))
  g.add(cyl(0.0012, 0.0012, 0.0005, mat.ceramic, `${name}-dielectric`, 'z', [0, 0, 0.0092], 10))
  return g
}

/** Raised label plate facing +Z with engraved-looking text bars */
function label(name: string, w: number, h: number, lines = 3) {
  const g = group(name)
  g.add(rbox(w, h, 0.0012, Math.min(w, h) * 0.12, mat.aluminiumDark, `${name}-plate`, [0, 0, 0.0006]))
  const bars: THREE.BufferGeometry[] = []
  for (let i = 0; i < lines; i++) {
    const bw = (i === 0 ? 0.75 : 0.55 - i * 0.08) * w
    const b = new THREE.BoxGeometry(bw, (h / (lines * 2.4)) * (i === 0 ? 1.3 : 1), 0.0005)
    b.translate(-w / 2 + w * 0.1 + bw / 2, h / 2 - h * 0.25 - (i * h * 0.75) / lines, 0.0014)
    bars.push(b)
  }
  g.add(mesh(mergeGeometries(bars), mat.panel, `${name}-text`))
  return g
}

/** Little red "remove before flight" style protective cap on a fill valve, along +Y */
function fillValve(name: string) {
  const g = group(name)
  g.add(hex(0.0042, 0.004, mat.titanium, `${name}-body`, [0, 0.002, 0]))
  g.add(cyl(0.0026, 0.0026, 0.006, mat.titanium, `${name}-stem`, 'y', [0, 0.007, 0], 16))
  g.add(cyl(0.0034, 0.0034, 0.006, mat.paintRed, `${name}-cap`, 'y', [0, 0.012, 0], 16))
  g.add(cyl(0.0036, 0.0036, 0.0012, mat.paintRed, `${name}-cap-rim`, 'y', [0, 0.0094, 0], 16))
  return g
}

/** Pressure transducer along +Y: titanium body, hex, connector, cable stub */
function transducer(name: string, s = 1) {
  const g = group(name)
  g.add(hex(0.0055 * s, 0.004 * s, mat.titanium, `${name}-hex`, [0, 0.002 * s, 0]))
  g.add(cyl(0.0048 * s, 0.0048 * s, 0.014 * s, mat.titanium, `${name}-body`, 'y', [0, 0.011 * s, 0], 20))
  g.add(cyl(0.0052 * s, 0.0052 * s, 0.0015 * s, mat.aluminiumDark, `${name}-band`, 'y', [0, 0.0145 * s, 0], 20))
  g.add(cyl(0.0036 * s, 0.0036 * s, 0.006 * s, mat.anodized, `${name}-connector`, 'y', [0, 0.021 * s, 0], 16))
  return g
}

/** Solenoid valve along +Y: gold coil can, titanium end caps, wire leads */
function solenoid(name: string, s = 1) {
  const g = group(name)
  g.add(cyl(0.0045 * s, 0.0045 * s, 0.0105 * s, mat.anodizedGold, `${name}-coil`, 'y', [0, 0.0065 * s, 0], 20))
  g.add(cyl(0.0048 * s, 0.0048 * s, 0.0015 * s, mat.titanium, `${name}-cap-a`, 'y', [0, 0.0012 * s, 0], 20))
  g.add(cyl(0.0048 * s, 0.0048 * s, 0.0015 * s, mat.titanium, `${name}-cap-b`, 'y', [0, 0.0118 * s, 0], 20))
  g.add(cyl(0.0032 * s, 0.0032 * s, 0.0012 * s, mat.kapton, `${name}-sleeve`, 'y', [0, 0.0131 * s, 0], 16))
  return g
}

/** Closed bell nozzle along +Y: throat at y = 0, exit at y = len */
function bell(name: string, rThroat: number, rExit: number, len: number, m: THREE.Material = pm.rhenium) {
  const g = group(name)
  const wall = Math.max(0.0005, rExit * 0.08)
  const outer: [number, number][] = []
  const inner: [number, number][] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    const r = rThroat + (rExit - rThroat) * Math.pow(t, 0.62)
    outer.push([r + wall, t * len])
    inner.push([r, t * len])
  }
  // Solid shell: outside going up, lip, inside coming down
  const prof: [number, number][] = [[rThroat * 0.6, -wall], ...outer, [inner[10][0], len], ...inner.slice().reverse().slice(1), [rThroat * 0.6, 0]]
  g.add(lathe(prof, m, `${name}-bell`, [0, 0, 0], 28))
  g.add(lathe(inner.map(([r, y]) => [r * 0.985, y] as [number, number]), pm.soot, `${name}-throat`, [0, 0, 0], 28))
  return g
}

/** Origin at the centre of the footprint on y = 0, without re-centring on deployed parts */
function finish(root: THREE.Object3D, footprint: THREE.Object3D = root) {
  root.updateMatrixWorld(true)
  const all = new THREE.Box3().setFromObject(root)
  const fp = new THREE.Box3().setFromObject(footprint)
  const c = fp.getCenter(new THREE.Vector3())
  const g = new THREE.Group()
  g.name = root.name
  root.name = `${root.name}-body`
  root.position.sub(new THREE.Vector3(c.x, all.min.y, c.z))
  g.add(root)
  return g
}

/* ================================================================ prop-coldgas (0.6U) */

/**
 * Cold-gas tray, 10 x 6 x 10 cm (like MarCO's): a titanium capsule tank in saddles, a valve
 * manifold, a bridge with fill valve and pressure transducer, four corner posts each with a
 * solenoid valve and a tiny canted nozzle.
 */
function buildColdGas() {
  const W = 0.1
  const H = 0.06
  const T = 0.004
  const P = 0.014 // corner post
  const root = group('prop-coldgas')

  // Base plate with chamfered look and a gold MLI underside
  root.add(rbox(W, W, T, 0.004, mat.aluminium, 'base-plate').rotateX(-Math.PI / 2).translateZ(T / 2))
  root.add(box(W - 0.01, 0.0008, W - 0.01, mat.gold, 'base-mli', [0, -0.0004, 0]))

  // Low walls with lightening windows between corner posts
  const wallH = 0.022
  const span = W - P * 2
  for (const [i, [nx, nz]] of ([[0, 1], [0, -1], [1, 0], [-1, 0]] as [number, number][]).entries()) {
    const holes = i === 0 ? [] : [rectHole(-span * 0.22, 0.001, span * 0.3, wallH * 0.5), rectHole(span * 0.22, 0.001, span * 0.3, wallH * 0.5)]
    const wall = plate(span, wallH, 0.003, holes, mat.aluminium, `wall-${i}`, 0.001)
    wall.position.set(nx * (W / 2 - 0.0015), T + wallH / 2, nz * (W / 2 - 0.0015))
    wall.rotation.y = Math.atan2(nx, nz)
    root.add(wall)
    // Lip along the top edge
    const lip = box(span, 0.002, 0.006, mat.aluminium, `wall-lip-${i}`, [nx * (W / 2 - 0.003), T + wallH, nz * (W / 2 - 0.003)])
    lip.rotation.y = Math.atan2(nx, nz)
    root.add(lip)
  }

  // Front wall: label and harness connector
  const lab = label('label', 0.03, 0.011)
  lab.position.set(-0.012, T + wallH / 2, W / 2)
  root.add(lab)
  const md = microD('connector', 0.016)
  md.position.set(0.019, T + wallH / 2, W / 2)
  root.add(md)

  // Corner posts with valve and nozzle on top
  const postH = H - 0.016
  const valves: V3[] = []
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * (W / 2 - P / 2)
      const cz = sz * (W / 2 - P / 2)
      const post = rbox(P, P, postH, 0.003, mat.aluminium, `post-${sx}${sz}`)
      post.rotation.x = -Math.PI / 2
      post.position.set(cx, postH / 2, cz)
      root.add(post)
      root.add(screwsAt([[cx, postH + 0.0006, cz]], [0, 1, 0], `post-screw-${sx}${sz}`, 0.0022))
      // Valve mount block on top of the post, solenoid stacked on it
      root.add(box(P * 0.9, 0.004, P * 0.9, mat.anodized, `valve-block-${sx}${sz}`, [cx, postH + 0.002, cz]))
      const sol = solenoid(`valve-${sx}${sz}`, 0.95)
      sol.position.set(cx, postH + 0.004, cz)
      root.add(sol)
      valves.push([cx, postH + 0.002, cz])
      // Nozzle canted out along the corner diagonal and slightly forward
      const dir: V3 = [sx * 0.7, 0.05, sz * 0.7]
      const nz = bell(`nozzle-${sx}${sz}`, 0.0011, 0.0042, 0.009)
      pointY(nz, [cx + sx * 0.0055, postH + 0.002, cz + sz * 0.0055], dir)
      root.add(nz)
    }

  // Titanium capsule tank in two saddles with straps
  const tr = 0.022
  const tl = 0.03
  const ty = T + 0.004 + tr
  const tank = mesh(new THREE.CapsuleGeometry(tr, tl, 10, 32), mat.titanium, 'tank', [0, ty, -0.004])
  tank.rotation.z = Math.PI / 2
  root.add(tank)
  const seam = mesh(new THREE.TorusGeometry(tr + 0.0002, 0.0007, 6, 40), mat.aluminium, 'tank-weld', [0, ty, -0.004])
  seam.rotation.y = Math.PI / 2
  root.add(seam)
  for (const sx of [-1, 1]) {
    root.add(box(0.008, 0.008, 0.034, mat.aluminiumDark, `saddle-${sx}`, [sx * 0.017, T + 0.004, -0.004]))
    const strap = mesh(new THREE.CylinderGeometry(tr + 0.0012, tr + 0.0012, 0.005, 40, 1, true, 0, TAU), mat.aluminiumDark, `strap-${sx}`, [sx * 0.017, ty, -0.004])
    strap.rotation.z = Math.PI / 2
    root.add(strap)
    root.add(box(0.005, 0.004, 0.006, mat.aluminiumDark, `strap-clamp-${sx}`, [sx * 0.017, ty + tr + 0.002, -0.004]))
    root.add(screwsAt([[sx * 0.017, ty + tr + 0.0042, -0.004]], [0, 1, 0], `strap-screw-${sx}`, 0.0014))
    // End bosses with ports
    root.add(cyl(0.006, 0.006, 0.004, mat.titanium, `tank-boss-${sx}`, 'x', [sx * (tl / 2 + tr + 0.001), ty, -0.004], 16))
  }
  // Kapton heater on top of the tank
  const heater = mesh(new THREE.CylinderGeometry(tr + 0.0004, tr + 0.0004, 0.024, 24, 1, true, (3 * Math.PI) / 2 - 0.55, 1.1), mat.kapton, 'tank-heater', [0, ty, -0.004])
  heater.rotation.z = -Math.PI / 2
  root.add(heater)

  // Manifold block in front of the tank, transducer on it
  const my = T + wallH + 0.004
  const mz = 0.033
  root.add(box(0.012, my - T, 0.008, mat.aluminiumDark, 'manifold-pedestal', [0, T + (my - T) / 2, mz]))
  root.add(rbox(0.032, 0.012, 0.011, 0.002, mat.anodizedGold, 'manifold', [0, my, mz]))
  root.add(screwsAt([[-0.012, my + 0.006, mz], [0.012, my + 0.006, mz]], [0, 1, 0], 'manifold-screws', 0.0014))
  const td = transducer('pressure-transducer', 0.9)
  td.position.set(0, my + 0.006, mz)
  root.add(td)

  // Pipework: tank +X port under to the manifold, manifold out to each corner valve
  const pr = 0.0012
  root.add(pipe('pipe-feed', [[tl / 2 + tr + 0.003, ty, -0.004], [0.041, ty, -0.004], [0.041, T + 0.006, -0.004], [0.041, T + 0.006, mz], [0.009, T + 0.006, mz], [0.009, my - 0.006, mz]], pr, mat.titanium, 0.005))
  for (const [cx, cy, cz] of valves) {
    const sx = Math.sign(cx)
    const sz = Math.sign(cz)
    const pts: V3[] =
      sz > 0
        ? [[sx * 0.016, my + 0.003, mz], [sx * 0.033, my + 0.003, mz], [sx * 0.033, cy, mz], [sx * 0.033, cy, 0.041], [sx * 0.038, cy, 0.041]]
        : [[sx * 0.016, my - 0.003, mz], [sx * 0.0435, my - 0.003, mz], [sx * 0.0435, my - 0.003, -0.033], [sx * 0.0435, cy, -0.033], [sx * 0.0435, cy, -0.038]]
    root.add(pipe(`pipe-${sx}${sz}`, pts, pr * 0.9, mat.titanium, 0.004))
    // Fitting nut where the line enters the valve block
    const last = pts[pts.length - 1]
    const prev = pts[pts.length - 2]
    root.add(pointY(hex(0.0021, 0.003, mat.titanium, `fitting-${sx}${sz}`), last, [last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]]))
  }
  // Fill line from the -X port up to the fill valve on a bridge at the back
  const by = H - 0.012
  const bz = -0.034
  root.add(box(span + 0.004, 0.005, 0.009, mat.aluminium, 'bridge', [0, by, bz]))
  root.add(screwsAt([[-span / 2 + 0.004, by + 0.0026, bz], [span / 2 - 0.004, by + 0.0026, bz]], [0, 1, 0], 'bridge-screws'))
  const fv = fillValve('fill-valve')
  fv.position.set(-0.016, by + 0.0025, bz)
  root.add(fv)
  const fv2 = fillValve('vent-valve')
  fv2.position.set(0.004, by + 0.0025, bz)
  root.add(fv2)
  root.add(pipe('pipe-fill', [[-(tl / 2 + tr + 0.003), ty, -0.004], [-0.04, ty, -0.004], [-0.04, ty, bz], [-0.04, by - 0.004, bz], [-0.016, by - 0.004, bz], [-0.016, by, bz]], pr, mat.titanium, 0.005))
  // Harness from the connector to the valves
  root.add(cable('harness', [[0.019, T + wallH / 2, W / 2 - 0.004], [0.022, T + 0.004, 0.036], [0.034, T + 0.004, 0.034], [0.036, postH + 0.004, 0.036]], 0.0011, mat.rubber))
  root.add(cable('harness-2', [[0.017, T + wallH / 2, W / 2 - 0.004], [-0.02, T + 0.003, 0.044], [-0.034, T + 0.004, 0.034], [-0.036, postH + 0.004, 0.036]], 0.0011, mat.rubber))
  return settle(root)
}

/* ================================================================ prop-chemical (2.4U / 2.9U) */

/**
 * Green monopropellant module (like Lunar Flashlight's): a machined aluminium block with pocketed
 * faces, the propellant tank dome(s) bulging from the top, four canted thrusters on the +Z face,
 * fill/drain valves, a pressure transducer, kapton heater pads and harness connectors.
 */
function buildChemical(id: string, length: number, large: boolean) {
  const W = 0.2
  const H = 0.1
  const nozzleOut = large ? 0.032 : 0.028
  const D = length - nozzleOut // machined block depth
  const domeH = large ? 0.024 : 0.022
  const Hb = H - domeH // block height
  const zc = -nozzleOut / 2 // block centre (thrusters stick out in front)
  const root = group(id)
  const t = 0.004
  const edge = 0.01

  // Dark core (seen through the pockets)
  root.add(box(W - 0.006, Hb - 0.006, D - 0.006, mat.aluminiumDark, 'core', [0, Hb / 2, zc]))

  // Edge rails along all twelve edges (chunky machined frame)
  const rail = (w: number, h: number, d: number, pos: V3, n: string) => root.add(rbox(w, h, d, 0.0025, mat.aluminium, n, pos))
  for (const sx of [-1, 1])
    for (const sy of [0, 1]) {
      const y = sy ? Hb - edge / 2 : edge / 2
      rail(edge, edge, D, [sx * (W / 2 - edge / 2), y, zc], `edge-z-${sx}${sy}`)
      const r = rbox(edge, edge, W - edge * 2, 0.0025, mat.aluminium, `edge-x-${sx}${sy}`)
      r.rotation.y = Math.PI / 2
      r.position.set(0, y, zc + sx * (D / 2 - edge / 2))
      root.add(r)
    }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const r = rbox(edge, edge, Hb - edge * 2, 0.0025, mat.aluminium, `edge-y-${sx}${sz}`)
      r.rotation.x = Math.PI / 2
      r.position.set(sx * (W / 2 - edge / 2), Hb / 2, zc + sz * (D / 2 - edge / 2))
      root.add(r)
    }

  // Pocketed side faces (±X)
  const sideW = D - edge * 2
  const sideH = Hb - edge * 2
  const nzp = large ? 4 : 3
  const sideHoles: THREE.Path[] = []
  const pw = (sideW - 0.006 * (nzp + 1)) / nzp
  const ph = (sideH - 0.006 * 3) / 2
  for (let i = 0; i < nzp; i++)
    for (let j = 0; j < 2; j++) sideHoles.push(rectHole(-sideW / 2 + 0.006 + pw / 2 + i * (pw + 0.006), -sideH / 2 + 0.006 + ph / 2 + j * (ph + 0.006), pw, ph, 0.004))
  for (const sx of [-1, 1]) {
    const p = plate(sideW, sideH, t, sideHoles, mat.aluminium, `side-${sx}`, 0.001)
    p.rotation.y = (sx * Math.PI) / 2
    p.position.set(sx * (W / 2 - t / 2), Hb / 2, zc)
    root.add(p)
  }
  // The large unit's tanks run the full length: its sides wear stitched gold MLI blankets
  // (the tier cue), held by silver tape borders and velcro tabs
  if (large)
    for (const sx of [-1, 1]) {
      const bx = sx * (W / 2 + 0.0012)
      const bW = sideW - 0.002
      const bH = sideH - 0.002
      const blanket = rbox(0.0024, bH, bW, 0.002, mat.gold, `mli-blanket-${sx}`, [bx, Hb / 2, zc])
      root.add(blanket)
      const seams: THREE.BufferGeometry[] = []
      for (const z of [-bW / 4, 0, bW / 4]) {
        const b = new THREE.BoxGeometry(0.0006, bH * 0.92, 0.0009)
        b.translate(bx + sx * 0.0013, Hb / 2, zc + z)
        seams.push(b)
      }
      const hb = new THREE.BoxGeometry(0.0006, 0.0009, bW * 0.94)
      hb.translate(bx + sx * 0.0013, Hb / 2, zc)
      seams.push(hb)
      root.add(mesh(mergeGeometries(seams), mat.silverFoil, `mli-stitches-${sx}`))
      for (const sy of [-1, 1]) root.add(box(0.003, 0.004, bW, mat.silverFoil, `mli-tape-${sx}${sy}`, [bx + sx * 0.0004, Hb / 2 + sy * (bH / 2 - 0.0015), zc]))
      for (const z of [-bW / 3, bW / 3]) root.add(box(0.0034, 0.008, 0.008, mat.panel, `mli-tab-${sx}`, [bx + sx * 0.0006, Hb / 2 + bH / 2 - 0.006, zc + z]))
    }
  // Kapton heater pads in two -X pockets, with leads
  for (let i = 0; i < 2; i++) {
    const hz = zc - sideW / 2 + 0.006 + pw / 2 + i * (pw + 0.006)
    root.add(box(0.0008, ph * 0.7, pw * 0.7, mat.kapton, `heater-pad-${i}`, [-W / 2 + t + 0.0004 - 0.001, Hb / 2 - ph / 2 - 0.003, hz]))
  }

  // Top face: pockets around the dome openings
  const topW = W - edge * 2
  const topD = D - edge * 2
  const domes: [number, number][] = large ? [[-0.044, 0], [0.044, 0]] : [[0, 0]]
  const domeR = large ? 0.04 : 0.042
  const topHoles: THREE.Path[] = domes.map(([x, z]) => circleHole(x, -z, domeR + 0.004))
  if (!large) for (const sx of [-1, 1]) topHoles.push(rectHole(sx * 0.068, 0, 0.034, topD - 0.016, 0.004))
  const top = plate(topW, topD, t, topHoles, large ? mat.gold : mat.aluminium, large ? 'top-mli' : 'top', 0.001, 24)
  top.rotation.x = -Math.PI / 2
  top.position.set(0, Hb - t / 2, zc)
  root.add(top)

  // Tank domes with bolted flanges
  for (const [i, [x, z]] of domes.entries()) {
    const prof: [number, number][] = []
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * (Math.PI / 2)
      prof.push([domeR * Math.cos(a), domeH * 0.95 * Math.sin(a)])
    }
    prof.unshift([domeR, -0.004])
    root.add(lathe(prof, mat.titanium, `tank-dome-${i}`, [x, Hb, zc + z], 48))
    const fl = ringZ(domeR - 0.001, domeR + 0.008, 0, 0.003, mat.aluminium, `dome-flange-${i}`, 48)
    fl.rotation.x = -Math.PI / 2
    fl.position.set(x, Hb, zc + z)
    root.add(fl)
    root.add(screwsAt(ringPts(domeR + 0.0045, 0, 16).map(([a, b]) => [x + a, Hb + 0.0032, zc + z - b] as V3), [0, 1, 0], `dome-screws-${i}`, 0.0017))
    // Weld land ring and a top boss with the propellant port
    const land = mesh(new THREE.TorusGeometry(domeR * 0.72, 0.0008, 6, 48), mat.aluminium, `dome-weld-${i}`, [x, Hb + domeH * 0.95 * Math.sin(Math.acos(0.72)), zc + z])
    land.rotation.x = Math.PI / 2
    root.add(land)
    root.add(cyl(0.007, 0.008, 0.004, mat.titanium, `dome-boss-${i}`, 'y', [x, Hb + domeH * 0.95 + 0.0005, zc + z], 20))
  }

  // Bottom plate with mounting flanges
  root.add(box(W - edge, 0.003, D - edge, mat.aluminium, 'bottom', [0, 0.0015, zc]))
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      root.add(rbox(0.016, 0.003, 0.012, 0.002, mat.aluminium, `foot-${sx}${sz}`, [sx * (W / 2 + 0.004), 0.0015, zc + sz * (D / 2 - 0.016)]))
      root.add(screwsAt([[sx * (W / 2 + 0.006), 0.0034, zc + sz * (D / 2 - 0.016)]], [0, 1, 0], `foot-screw-${sx}${sz}`, 0.0022))
    }

  // Front face (+Z): plate with four thruster bosses
  const fz = zc + D / 2
  const fh = Hb - edge * 2
  const front = plate(W - edge * 2, fh, t, [rectHole(0, fh / 2 - 0.009, 0.05, 0.008, 0.003), rectHole(0, -fh / 2 + 0.009, 0.05, 0.008, 0.003)], mat.aluminium, 'front', 0.001)
  front.position.set(0, Hb / 2, fz - t / 2)
  root.add(front)
  const tx = large ? 0.062 : 0.06
  const ty = Hb / 2
  const tdy = Hb * 0.24
  const s = large ? 1.38 : 1.18
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const g = group(`thruster-${sx}${sy}`)
      g.add(cyl(0.012 * s, 0.012 * s, 0.003, mat.aluminium, 'boss', 'y', [0, 0.0015, 0], 28))
      g.add(screwsAt(ringPts(0.0095 * s, 0, 4, Math.PI / 4).map(([a, b]) => [a, 0.0032, b] as V3), [0, 1, 0], 'boss-screws', 0.0012))
      g.add(cyl(0.0078 * s, 0.0078 * s, 0.008 * s, mat.anodizedGold, 'valve', 'y', [0, 0.003 + 0.004 * s, 0], 24))
      g.add(cyl(0.0082 * s, 0.0082 * s, 0.0012, mat.titanium, 'valve-cap', 'y', [0, 0.003 + 0.008 * s, 0], 24))
      // Thermal standoff (three thin legs) and the catalyst chamber with its heater band
      for (const a of [0, 2.09, 4.19]) g.add(cyl(0.0007, 0.0007, 0.005 * s, mat.titanium, 'standoff', 'y', [Math.cos(a) * 0.004 * s, 0.003 + 0.0105 * s, Math.sin(a) * 0.004 * s], 6))
      g.add(cyl(0.0048 * s, 0.0048 * s, 0.009 * s, pm.rhenium, 'chamber', 'y', [0, 0.003 + 0.0175 * s, 0], 20))
      g.add(cyl(0.0056 * s, 0.0056 * s, 0.004 * s, mat.copper, 'heater-band', 'y', [0, 0.003 + 0.0165 * s, 0], 20))
      const b = bell('bell', 0.0018 * s, 0.0086 * s, 0.0105 * s)
      b.position.y = 0.003 + 0.022 * s
      g.add(b)
      // Cant outward a little so plumes clear the craft
      pointY(g, [sx * tx, ty + sy * tdy, fz], [sx * 0.09, sy * 0.09, 1])
      root.add(g)
    }
  // Valve leads looping back into the face
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = sx * tx
      const y = ty + sy * tdy
      root.add(cable(`valve-lead-${sx}${sy}`, [[x - sx * 0.008 * s, y, fz + 0.007 * s], [x - sx * 0.013 * s, y + 0.001, fz + 0.006], [x - sx * 0.016 * s, y, fz + 0.0005]], 0.0009, mat.rubber))
    }
  const lab = label('label', 0.05, 0.016)
  lab.position.set(0, ty, fz)
  root.add(lab)

  // Back face (-Z): pocketed plate with connectors
  const bz = zc - D / 2
  const back = plate(W - edge * 2, Hb - edge * 2, t, [rectHole(-0.045, 0, 0.07, Hb - edge * 2 - 0.012), rectHole(0.045, 0, 0.07, Hb - edge * 2 - 0.012)], mat.aluminium, 'back', 0.001)
  back.position.set(0, Hb / 2, bz + t / 2)
  root.add(back)
  for (const [i, x] of [-0.045, 0.045].entries()) {
    const c = microD(`connector-${i}`, 0.024)
    c.rotation.y = Math.PI
    c.position.set(x, Hb / 2, bz + t)
    root.add(c)
  }

  // Fill/drain valves and pressure transducer on the top, plumbed to the dome bosses
  const vz = zc - D / 2 + 0.018
  const valveXs = large ? [-0.012, 0.012] : [-0.075, -0.06]
  for (const [i, x] of valveXs.entries()) {
    const fv = fillValve(`fill-valve-${i}`)
    fv.scale.setScalar(1.3)
    fv.position.set(x, Hb, vz)
    root.add(fv)
  }
  const tdX = large ? 0 : 0.068
  const td = transducer('pressure-transducer', 1.3)
  td.position.set(tdX, Hb, large ? zc + D / 2 - 0.018 : vz)
  root.add(td)
  const py = Hb + 0.003
  for (const [i, [x, z]] of domes.entries()) {
    const top = Hb + domeH * 0.95 + 0.002
    const dz = zc + z
    const target: V3 = large ? [valveXs[i], py, vz] : [valveXs[0], py, vz]
    root.add(pipe(`pipe-fill-${i}`, [[x, top, dz], [x, top + 0.004, dz], [x + (target[0] - x) * 0.5, top + 0.004, dz], [target[0], py + 0.01, dz - 0.02], [target[0], py, target[2] + 0.006], target], 0.0016, mat.titanium, 0.008))
  }
  if (!large) root.add(pipe('pipe-transducer', [[0.008, Hb + domeH * 0.95 + 0.002, zc], [0.008, Hb + domeH * 0.95 + 0.005, zc], [0.05, Hb + 0.012, zc], [tdX, py + 0.004, zc], [tdX, py, vz + 0.008]], 0.0014, mat.titanium, 0.008))
  else root.add(pipe('pipe-transducer', [[0, Hb + 0.004, zc - 0.02], [0, Hb + 0.004, zc + D / 2 - 0.03], [0, Hb + 0.004, zc + D / 2 - 0.018]], 0.0014, mat.titanium, 0.006))
  if (large)
    // Crossover line between the two tanks
    root.add(pipe('pipe-crossover', [[-0.044 + domeR * 0.75, Hb + 0.006, zc + 0.02], [0, Hb + 0.006, zc + 0.02], [0.044 - domeR * 0.75, Hb + 0.006, zc + 0.02]], 0.0016, mat.titanium))

  return settle(root)
}

/* ================================================================ prop-ion (1.5U / 1.6U) */

/** Perforated ion-optics grid: a disc with a hex-packed field of real apertures (normal +Z) */
function ionGrid(name: string, R: number, pitch: number, holeR: number) {
  const holes: THREE.Path[] = []
  const rows = Math.ceil(R / (pitch * 0.866))
  for (let j = -rows; j <= rows; j++)
    for (let i = -rows - 1; i <= rows + 1; i++) {
      const x = (i + (j & 1 ? 0.5 : 0)) * pitch
      const y = j * pitch * 0.866
      if (Math.hypot(x, y) < R - pitch * 0.75) holes.push(new THREE.Path().absarc(x, y, holeR, 0, TAU, true))
    }
  holes.forEach((h) => (h.autoClose = true))
  const s = new THREE.Shape().absarc(0, 0, R, 0, TAU, false)
  s.holes.push(...holes)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0008, bevelEnabled: false, curveSegments: 4 })
  return mesh(geo, pm.moly, name)
}

/** Gridded RF ion thruster head, axis +Z, grid face at z = 0, body toward -Z */
function ionHead(rc: number, rg: number, len: number, large: boolean) {
  const g = group('thruster-head')
  // Front flange and grid
  g.add(ringZ(rg - 0.001, rc, -0.007, 0, mat.aluminium, 'flange', 56))
  g.add(ringZ(rg - 0.0025, rg + 0.0005, -0.0016, 0.0004, mat.ceramic, 'grid-insulator', 56))
  const grid = ionGrid('screen-grid', rg, large ? 0.0042 : 0.0039, large ? 0.0015 : 0.0014)
  grid.position.z = -0.0012
  g.add(grid)
  g.add(screwsAt(ringPts((rg + rc) / 2 + 0.0008, 0.0003, large ? 16 : 12), [0, 0, 1], 'flange-screws', 0.0015))
  // Discharge interior: dark chamber with a faint plasma ring
  g.add(cyl(rg, rg, 0.002, mat.chip, 'chamber-back', 'z', [0, 0, -0.0125], 40))
  g.add(ringZ(rg * 0.38, rg * 0.78, -0.0102, -0.0098, pm.ionFaint, 'plasma-ring', 48))
  g.add(cyl(rg * 0.98, rg * 0.98, 0.009, pm.soot, 'chamber-wall', 'z', [0, 0, -0.0055], 40, true))
  // Ceramic discharge chamber wrapped in the copper RF coil, inside an open strut cage
  const rch = rc * 0.84
  g.add(cyl(rch, rch, len - 0.017, mat.ceramic, 'discharge-chamber', 'z', [0, 0, -0.013 - (len - 0.017) / 2], 40, true))
  const turns = large ? 5 : 4
  const coil: V3[] = []
  for (let i = 0; i <= turns * 24; i++) {
    const a = (i / 24) * TAU
    coil.push([Math.cos(a) * (rch + 0.0016), Math.sin(a) * (rch + 0.0016), -0.012 - (i / (turns * 24)) * len * 0.5])
  }
  g.add(cable('rf-coil', coil, 0.0014, mat.copper))
  for (const a of ringPts(rc - 0.002, 0, 4, Math.PI / 4)) g.add(cyl(0.0016, 0.0016, len - 0.007, mat.aluminium, 'cage-strut', 'z', [a[0], a[1], -0.007 - (len - 0.007) / 2], 10))
  g.add(cyl(rc * 0.98, rc * 0.98, 0.004, mat.aluminium, 'back-cap', 'z', [0, 0, -len], 40))
  g.add(cyl(rc * 0.5, rc * 0.5, 0.004, mat.anodized, 'back-boss', 'z', [0, 0, -len - 0.004], 24))
  const rf = sma('rf-port')
  rf.rotation.y = Math.PI
  rf.position.set(rc * 0.25, 0, -len - 0.006)
  g.add(rf)

  // Neutralizer cathode(s) on the rim, canted toward the beam (the large unit carries two)
  const nr = large ? 1.15 : 1
  for (const [k, na] of (large ? [Math.PI / 4, (3 * Math.PI) / 4] : [Math.PI / 4]).entries()) {
    const nx = Math.cos(na) * (rc + 0.006)
    const ny = Math.sin(na) * (rc + 0.006)
    g.add(box(0.008 * nr, 0.006, 0.01, mat.aluminium, `cathode-bracket-${k}`, [Math.cos(na) * (rc + 0.002), Math.sin(na) * (rc + 0.002), -0.006]).rotateZ(na))
    const cath = group(`neutralizer-${k}`)
    cath.add(cyl(0.0042 * nr, 0.0042 * nr, 0.016 * nr, mat.titanium, 'cathode-tube', 'y', [0, 0.008 * nr, 0], 16))
    cath.add(cyl(0.005 * nr, 0.005 * nr, 0.004, mat.ceramic, 'cathode-insulator', 'y', [0, 0.003, 0], 16))
    cath.add(cyl(0.0035 * nr, 0.0042 * nr, 0.003, mat.aluminiumDark, 'cathode-keeper', 'y', [0, 0.0175 * nr, 0], 16))
    cath.add(cyl(0.0012, 0.0012, 0.0008, pm.ionFaint, 'cathode-orifice', 'y', [0, 0.0192 * nr, 0], 10))
    pointY(cath, [nx, ny, -0.012], [-Math.cos(na) * 0.35, -Math.sin(na) * 0.35, 1])
    g.add(cath)
    g.add(cable(`cathode-lead-${k}`, [[nx, ny, -0.012], [nx * 1.05, ny * 1.05, -0.02], [Math.cos(na) * rc * 0.95, Math.sin(na) * rc * 0.95, -len + 0.004]], 0.0009, mat.rubber))
  }
  return g
}

/**
 * Gridded ion thruster module (like the iodine thruster on Lunar IceCube, unbranded): rail
 * frame, gold-wrapped iodine tank at the back, power-processing boards in the middle, and the
 * thruster head in a two-axis gimbal at the front, its grid face looking out (+Z).
 */
function buildIon(id: string, length: number, large: boolean) {
  const W = 0.1
  const RAIL = 0.0085
  const rc = large ? 0.0385 : 0.028
  const rg = large ? 0.0325 : 0.022
  const headLen = large ? 0.05 : 0.044
  const z0 = -length / 2
  const zFront = length / 2 // grid face
  const plateZ = zFront - (large ? 0.026 : 0.024)
  const root = group(id)

  // Rails and end frames
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const y = W / 2 + sy * (W / 2 - RAIL / 2)
      root.add(rbox(RAIL, RAIL, plateZ - z0, 0.002, mat.aluminium, `rail-${sx}${sy}`, [sx * (W / 2 - RAIL / 2), y, (z0 + plateZ) / 2]))
    }
  const midZ = z0 + (large ? 0.075 : 0.066)
  for (const [i, z] of [z0 + 0.003, midZ].entries())
    for (const sy of [-1, 1]) {
      root.add(box(W - RAIL * 2, RAIL * 0.7, 0.005, mat.aluminium, `frame-x-${i}${sy}`, [0, W / 2 + sy * (W / 2 - RAIL * 0.35), z]))
      root.add(box(RAIL * 0.7, W - RAIL * 2, 0.005, mat.aluminium, `frame-y-${i}${sy}`, [sy * (W / 2 - RAIL * 0.35), W / 2, z]))
    }

  // Back plate with connectors and label
  root.add(box(W - 0.004, W - 0.004, 0.003, mat.anodized, 'back-plate', [0, W / 2, z0 + 0.0015]))
  for (const [i, x] of [-0.02, 0.02].entries()) {
    const c = microD(`connector-${i}`, 0.02)
    c.rotation.y = Math.PI
    c.position.set(x, W * 0.66, z0)
    root.add(c)
  }
  const lab = label('label', 0.05, 0.016)
  lab.rotation.y = Math.PI
  lab.position.set(0, W * 0.32, z0)
  root.add(lab)

  // Iodine tank: gold MLI blanket with stitch lines and straps
  const tankLen = midZ - z0 - 0.012
  const tz = z0 + 0.006 + tankLen / 2
  const tS = W - RAIL * 2 - 0.004
  root.add(rbox(tS, tS, tankLen, 0.012, mat.gold, 'iodine-tank', [0, W / 2, tz]))
  for (const z of [-tankLen * 0.3, tankLen * 0.3]) {
    root.add(rbox(tS + 0.002, tS + 0.002, 0.006, 0.012, mat.aluminiumDark, 'tank-strap', [0, W / 2, tz + z]))
  }
  const stitch: THREE.BufferGeometry[] = []
  for (const sy of [-1, 1])
    for (const x of [-0.02, 0.02]) {
      const b = new THREE.BoxGeometry(0.0008, 0.0006, tankLen * 0.9)
      b.translate(x, W / 2 + sy * (tS / 2 + 0.0002), tz)
      stitch.push(b)
    }
  root.add(mesh(mergeGeometries(stitch), mat.silverFoil, 'mli-stitches'))
  root.add(box(0.03, 0.0008, tankLen * 0.45, mat.kapton, 'tank-heater', [0.0, W / 2 + tS / 2 + 0.0006, tz]))

  // Power-processing boards standing across the frame, with stand-offs
  const boards = large ? 3 : 2
  const boardZ0 = midZ + 0.006
  const pitch = (plateZ - 0.008 - boardZ0) / boards
  for (let i = 0; i < boards; i++) {
    const bz = boardZ0 + pitch * (i + 0.3)
    const b = pcb(`ppu-board-${i}`, i === 0 ? mat.pcbBlue : mat.pcb, 6, i + 3)
    b.scale.set(0.86, 1, 0.9)
    b.rotation.x = Math.PI / 2
    b.position.set(0, W / 2, bz)
    root.add(b)
    // Transformer toroids, capacitors and a heat spreader on the front side
    for (const [k, [x, y]] of [[-0.022, 0.018], [0.02, 0.02]].entries()) root.add(mesh(new THREE.TorusGeometry(0.0062, 0.0028, 10, 20), mat.copper, `ppu-toroid-${i}${k}`, [x, W / 2 + y, bz + 0.0035]))
    for (let k = 0; k < 3; k++) root.add(cyl(0.0032, 0.0032, 0.008, mat.cellWrap, `ppu-cap-${i}${k}`, 'z', [-0.024 + k * 0.009, W / 2 - 0.022, bz + 0.005], 14))
    root.add(rbox(0.026, 0.018, 0.003, 0.002, mat.aluminium, `ppu-spreader-${i}`, [0.018, W / 2 - 0.018, bz + 0.0025]))
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) root.add(cyl(0.0018, 0.0018, pitch, mat.solder, `ppu-standoff-${i}`, 'z', [sx * 0.034, W / 2 + sy * 0.032, bz - pitch / 2], 6))
  }

  // Feed line from the tank to the head through a flow-control valve
  const fx = -0.032
  const fy = W / 2 - 0.034
  root.add(pipe('feed-line', [[fx, fy, midZ - 0.01], [fx, fy, plateZ - 0.012], [fx * 0.5, fy * 0.6, plateZ - 0.004], [0, W / 2 - rc * 0.4, plateZ + 0.004]], 0.0016, mat.titanium, 0.008))
  root.add(rbox(0.012, 0.012, 0.016, 0.002, mat.anodizedGold, 'flow-valve', [fx, fy, midZ + 0.004]))
  // The large unit's third power board needs more heat rejection: a black finned radiator
  // closes the top bay over the boards (its tier cue, readable from above)
  if (large) {
    const rz0 = midZ + 0.004
    const rz1 = plateZ - 0.004
    const rLen = rz1 - rz0
    const rW = W - RAIL * 2 - 0.001
    const topY = W - 0.006
    root.add(box(rW, 0.003, rLen, mat.anodized, 'radiator-base', [0, topY, (rz0 + rz1) / 2]))
    const fins: THREE.BufferGeometry[] = []
    const nf = 11
    for (let i = 0; i < nf; i++) {
      const f = new THREE.BoxGeometry(rW - 0.006, 0.0075, 0.0016)
      f.translate(0, topY + 0.0015 + 0.00375 - 0.002, rz0 + 0.003 + (i * (rLen - 0.006)) / (nf - 1))
      fins.push(f)
    }
    root.add(mesh(mergeGeometries(fins), mat.anodized, 'radiator-fins'))
    for (const sx of [-1, 1]) root.add(box(0.0018, 0.008, rLen, mat.aluminium, `radiator-rail-${sx}`, [sx * (rW / 2 - 0.0009), topY + 0.002, (rz0 + rz1) / 2]))
  }
  root.add(cable('ppu-harness', [[0.034, W / 2 + 0.034, midZ + 0.006], [0.036, W / 2 + 0.036, plateZ - 0.008], [0.026, W / 2 + 0.026, plateZ + 0.004]], 0.0018, mat.rubber))

  // Front plate with the head opening
  const hole = rc + 0.004
  const fp = plate(W, W, 0.004, [circleHole(0, 0, hole)], mat.anodized, 'front-plate', 0.003, 32)
  fp.position.set(0, W / 2, plateZ)
  root.add(fp)
  root.add(screwsAt([[-0.044, 0.044], [0.044, 0.044], [-0.044, -0.044], [0.044, -0.044]].map(([x, y]) => [x, W / 2 + y, plateZ + 0.0026] as V3), [0, 0, 1], 'front-screws', 0.0022))

  // Two-axis gimbal: outer ring pinned to yokes on ±X, inner ring pinned to the outer on ±Y
  const gz = plateZ + 0.012
  const ri = rc + 0.0012
  const ro = rc + 0.0085
  const gimbal = group('gimbal')
  gimbal.position.set(0, W / 2, gz)
  gimbal.add(ringZ(ri, ri + 0.0035, -0.004, 0.004, mat.aluminium, 'gimbal-inner'))
  gimbal.add(ringZ(ro, ro + 0.0035, -0.0035, 0.0035, mat.anodizedBlue, 'gimbal-outer'))
  for (const s of [-1, 1]) {
    gimbal.add(cyl(0.0022, 0.0022, ro - ri, mat.titanium, 'gimbal-pin-y', 'y', [0, s * (ri + (ro - ri) / 2 + 0.002), 0], 12))
    gimbal.add(cyl(0.0022, 0.0022, 0.008, mat.titanium, 'gimbal-pin-x', 'x', [s * (ro + 0.006), 0, 0], 12))
    // Yoke from the front plate to the outer ring
    gimbal.add(rbox(0.006, 0.012, gz - plateZ + 0.006, 0.002, mat.aluminium, 'gimbal-yoke', [s * (ro + 0.0065), 0, -(gz - plateZ) / 2 + 0.001]))
  }
  // Gimbal stepper motors
  gimbal.add(rbox(0.012, 0.012, 0.012, 0.002, mat.anodized, 'gimbal-motor-x', [ro + 0.0065, 0.013, -(gz - plateZ) / 2 + 0.002]))
  gimbal.add(cyl(0.0055, 0.0055, 0.01, mat.anodized, 'gimbal-motor-y', 'z', [0, ro + 0.007, -0.005], 16))
  root.add(gimbal)

  const head = ionHead(rc, rg, headLen, large)
  head.position.set(0, W / 2, zFront)
  root.add(head)
  return settle(root)
}

/* ================================================================ radio-uhf (0.2U) */

/** Curved tape-spring whip along +Z from the origin */
function tapeWhip(name: string, len: number) {
  const g = group(name)
  // Concave-up curved strip, like a tape measure
  const r = 0.0075
  const geo = new THREE.CylinderGeometry(r, r, len, 10, 1, true, -0.85, 1.7)
  geo.rotateX(Math.PI / 2)
  geo.translate(0, r, len / 2)
  g.add(mesh(geo, pm.tape, `${name}-tape`))
  // Root clamp and a protective tip cap
  g.add(box(0.014, 0.0035, 0.012, mat.aluminium, `${name}-clamp`, [0, 0.0017, 0.006]))
  g.add(screwsAt([[-0.0035, 0.0036, 0.006], [0.0035, 0.0036, 0.006]], [0, 1, 0], `${name}-clamp-screw`, 0.0014))
  const cap = mesh(new THREE.CapsuleGeometry(0.0045, 0.012, 4, 12), mat.paintOrange, `${name}-tip`, [0, 0.0012, len])
  cap.rotation.x = Math.PI / 2
  g.add(cap)
  return g
}

/**
 * UHF transceiver: a PC/104 radio board with a shield can, under an antenna deck with four
 * tape-spring whips in a turnstile. pivot_antennas holds the four whips, each in its own
 * pivot_antenna-N hinged at the deck edge; stowed, each whip lies folded along the edge.
 */
function buildUhf() {
  const S = 0.098
  const root = group('radio-uhf')
  // Transceiver board on stand-offs
  const board = pcb('transceiver-board', mat.pcbBlue, 7, 4)
  board.scale.set(S / 0.095, 1, S / 0.09)
  board.position.y = 0.0028
  root.add(board)
  const can = rbox(0.046, 0.034, 0.007, 0.003, mat.aluminium, 'shield-can', [0.012, 0.0075, 0.01])
  can.rotation.x = Math.PI / 2
  root.add(can)
  root.add(box(0.04, 0.0006, 0.028, mat.aluminiumDark, 'shield-lid', [0.012, 0.0111, 0.01]))
  root.add(screwsAt([[-0.008, 0.0112, -0.002], [0.032, 0.0112, -0.002], [-0.008, 0.0112, 0.022], [0.032, 0.0112, 0.022]], [0, 1, 0], 'shield-screws', 0.0015))
  for (const [i, x] of [-0.03, -0.018].entries()) {
    const c = sma(`rf-out-${i}`)
    c.position.set(x, 0.006, S / 2 - 0.006)
    root.add(c)
  }
  root.add(box(0.008, 0.002, 0.004, mat.ledGreen, 'status-led', [-0.035, 0.0045, 0.03]))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(cyl(0.0025, 0.0025, 0.012, mat.aluminium, 'standoff', 'y', [sx * 0.043, 0.008, sz * 0.043], 6))

  // Antenna deck: black frame with a window, four burn-wire hinge housings
  const deckY = 0.016
  const deck = plate(S, S, 0.003, [rectHole(0, 0, 0.062, 0.062, 0.006)], mat.anodized, 'antenna-deck', 0.004, 8)
  deck.rotation.x = -Math.PI / 2
  deck.position.y = deckY
  root.add(deck)
  root.add(screwsAt([[-0.043, -0.043], [0.043, -0.043], [-0.043, 0.043], [0.043, 0.043]].map(([x, z]) => [x, deckY + 0.0016, z] as V3), [0, 1, 0], 'deck-screws', 0.002))

  const pivots = group('pivot_antennas')
  pivots.userData.stowed = [0, 0, 0]
  const whipLen = 0.17
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    // Edge i faces outward direction (sin a, cos a); hinge near one end of the edge
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
    const along = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a))
    const hp = out.clone().multiplyScalar(S / 2 - 0.006).add(along.clone().multiplyScalar(-S / 2 + 0.014))
    const housing = rbox(0.016, 0.008, 0.012, 0.002, mat.panel, `hinge-housing-${i + 1}`, [hp.x, deckY + 0.0055, hp.z])
    housing.rotation.y = a
    root.add(housing)
    root.add(box(0.004, 0.0012, 0.004, mat.ceramic, `burn-resistor-${i + 1}`, [hp.x + along.x * 0.012, deckY + 0.0021, hp.z + along.z * 0.012]).rotateY(a))
    const p = group(`pivot_antenna-${i + 1}`)
    p.position.set(hp.x + out.x * 0.006, deckY + 0.006, hp.z + out.z * 0.006)
    p.rotation.y = a
    p.userData.stowed = [0, a + Math.PI / 2, 0]
    p.add(cyl(0.0035, 0.0035, 0.009, mat.anodized, 'hinge-drum', 'y', [0, -0.001, 0], 14))
    // Feed line from the radio board up to the antenna root
    root.add(cable(`antenna-feed-${i + 1}`, [[hp.x * 0.55, 0.006, hp.z * 0.55], [hp.x * 0.8, 0.012, hp.z * 0.8], [hp.x, deckY + 0.002, hp.z]], 0.0008, mat.copper))
    p.add(tapeWhip(`whip-${i + 1}`, whipLen))
    pivots.add(p)
  }
  root.add(pivots)
  return finish(root, deck)
}

/* ================================================================ radio-sband (0.5U) */

/**
 * Deep-space radio, 10 x 10 x 5 cm: a finned aluminium box with connectors on the back, and a
 * 2 x 2 patch-antenna array plate on the front (+Z), fed by semi-rigid coax.
 */
function buildSband() {
  const W = 0.1
  const D = 0.05
  const plateT = 0.007
  const root = group('radio-sband')
  const zPlate = D / 2 - plateT / 2
  const boxD = D - plateT - 0.004
  const bz = -D / 2 + boxD / 2

  // Radio box with fins on the top and sides
  const finH = 0.01
  const bw = W - finH * 2
  const bh = W - finH - 0.002
  root.add(rbox(bw, bh, boxD, 0.004, mat.aluminium, 'radio-box', [0, bh / 2, bz]))
  const fins: THREE.BufferGeometry[] = []
  const nTop = 9
  for (let i = 0; i < nTop; i++) {
    const f = new THREE.BoxGeometry(0.0018, finH, boxD - 0.004)
    f.translate(-bw / 2 + 0.004 + (i * (bw - 0.008)) / (nTop - 1), bh + finH / 2, bz)
    fins.push(f)
  }
  for (const sx of [-1, 1])
    for (let i = 0; i < 7; i++) {
      const f = new THREE.BoxGeometry(finH, 0.0018, boxD - 0.004)
      f.translate(sx * (bw / 2 + finH / 2), 0.008 + (i * (bh - 0.016)) / 6, bz)
      fins.push(f)
    }
  root.add(mesh(mergeGeometries(fins), mat.aluminium, 'heat-sink-fins'))
  // Fin root plates (dark anodized seams)
  root.add(box(bw - 0.004, 0.001, boxD - 0.002, mat.anodized, 'fin-root-top', [0, bh + 0.0004, bz]))

  // Back panel: connectors, label, LED
  const back = -D / 2
  const c1 = microD('power-connector', 0.022)
  c1.rotation.y = Math.PI
  c1.position.set(-0.018, bh * 0.7, back)
  root.add(c1)
  for (const [i, x] of [0.012, 0.026].entries()) {
    const s = sma(`test-port-${i}`)
    s.rotation.y = Math.PI
    s.position.set(x, bh * 0.7, back)
    root.add(s)
  }
  const lab = label('label', 0.05, 0.016)
  lab.rotation.y = Math.PI
  lab.position.set(0, bh * 0.35, back)
  root.add(lab)
  root.add(box(0.004, 0.003, 0.0012, mat.ledGreen, 'status-led', [-0.03, bh * 0.35, back - 0.0005]))
  root.add(screwsAt([[-bw / 2 + 0.005, 0.006], [bw / 2 - 0.005, 0.006], [-bw / 2 + 0.005, bh - 0.006], [bw / 2 - 0.005, bh - 0.006]].map(([x, y]) => [x, y, back - 0.0004] as V3), [0, 0, -1], 'back-screws', 0.0018))

  // Stand-off posts and the patch array plate
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) root.add(cyl(0.0025, 0.0025, 0.006, mat.aluminium, 'plate-standoff', 'z', [sx * 0.042, W / 2 + sy * 0.042, zPlate - plateT / 2 - 0.003], 8))
  root.add(rbox(W, W, 0.003, 0.004, mat.aluminium, 'ground-plane', [0, W / 2, zPlate - plateT / 2 + 0.0015]))
  root.add(rbox(W - 0.004, W - 0.004, 0.004, 0.003, mat.ceramic, 'substrate', [0, W / 2, zPlate + 0.0015]))
  const ps = 0.034
  const pitch = 0.044
  // Corner-truncated square patch (circular polarisation), extruded toward +Z
  const cut = 0.006
  const ph = ps / 2
  const patchShape = new THREE.Shape()
    .moveTo(-ph + cut, ph)
    .lineTo(ph, ph)
    .lineTo(ph, -ph + cut)
    .lineTo(ph - cut, -ph)
    .lineTo(-ph, -ph)
    .lineTo(-ph, ph - cut)
    .closePath()
  const patchGeo = new THREE.ExtrudeGeometry(patchShape, { depth: 0.0006, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0004, bevelSegments: 1 })
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const cx = (sx * pitch) / 2
      const cy = W / 2 + (sy * pitch) / 2
      root.add(mesh(patchGeo, mat.anodizedGold, `patch-${sx}${sy}`, [cx, cy, zPlate + 0.0039]))
      root.add(cyl(0.0016, 0.0016, 0.0012, mat.solder, `feed-pin-${sx}${sy}`, 'z', [cx + 0.007 * sx, cy, zPlate + 0.0049], 10))
    }
  // Plate rim screws
  root.add(screwsAt([[-0.045, -0.045], [0.045, -0.045], [-0.045, 0.045], [0.045, 0.045], [0, -0.046], [0, 0.046], [-0.046, 0], [0.046, 0]].map(([x, y]) => [x, W / 2 + y, zPlate + 0.0037] as V3), [0, 0, 1], 'plate-screws', 0.0017))
  // Semi-rigid coax from the box sides to the plate
  for (const sx of [-1, 1]) {
    root.add(pipe(`coax-${sx}`, [[sx * (bw / 2 - 0.004), 0.004, bz + boxD / 2 - 0.004], [sx * (bw / 2 - 0.004), 0.004, zPlate - plateT / 2 - 0.006], [sx * 0.03, 0.01, zPlate - plateT / 2 - 0.004], [sx * 0.03, 0.01, zPlate - plateT / 2]], 0.0013, mat.copper, 0.005))
  }
  return settle(root)
}

/* ================================================================ radio-xband (1.2U) */

/**
 * Reflectarray panel in the XZ plane (normal +Y), patch sizes following the feed phase so the
 * Fresnel zones read as rings. (ox, oz) is this panel's centre in array coordinates.
 */
function reflectPanel(name: string, w: number, d: number, t: number, ox: number, oz: number, F: number) {
  const g = group(name)
  g.add(box(w, t, d, pm.laminate, `${name}-laminate`))
  // Honeycomb backing with stiffener ribs
  g.add(box(w - 0.002, t * 0.5, d - 0.002, mat.aluminiumDark, `${name}-backing`, [0, -t * 0.6, 0]))
  const ribs: THREE.BufferGeometry[] = []
  for (const x of [-w / 4, w / 4]) {
    const r = new THREE.BoxGeometry(0.004, 0.003, d - 0.01)
    r.translate(x, -t - 0.0012, 0)
    ribs.push(r)
  }
  for (const z of [-d / 4, d / 4]) {
    const r = new THREE.BoxGeometry(w - 0.01, 0.003, 0.004)
    r.translate(0, -t - 0.0012, z)
    ribs.push(r)
  }
  g.add(mesh(mergeGeometries(ribs), mat.aluminium, `${name}-ribs`))
  // Frame
  for (const sz of [-1, 1]) g.add(box(w, t * 1.3, 0.003, mat.aluminium, `${name}-frame-z`, [0, 0, sz * (d / 2 - 0.0015)]))
  for (const sx of [-1, 1]) g.add(box(0.003, t * 1.3, d, mat.aluminium, `${name}-frame-x`, [sx * (w / 2 - 0.0015), 0, 0]))
  const pitch = 0.0105
  const nx = Math.floor((w - 0.006) / pitch)
  const nz = Math.floor((d - 0.006) / pitch)
  const geos: THREE.BufferGeometry[] = []
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -((nx - 1) * pitch) / 2 + i * pitch
      const z = -((nz - 1) * pitch) / 2 + j * pitch
      const gx = x + ox
      const gz = z + oz
      const path = Math.sqrt(gx * gx + gz * gz + F * F) - F
      const phase = (path / 0.028) % 1
      const s = pitch * (0.3 + 0.55 * (0.5 + 0.5 * Math.cos(phase * TAU)))
      const b = new THREE.CylinderGeometry(s / 2, s / 2, 0.0006, 12)
      b.translate(x, t / 2 + 0.0003, z)
      geos.push(b)
    }
  g.add(mesh(mergeGeometries(geos), mat.gold, `${name}-patches`))
  return g
}

/**
 * Deep-space transponder (sliced aluminium stack, like Iris) with a MarCO-style three-panel
 * reflectarray stowed on top. pivot_dish is the panel hinge on the top front edge: deployed,
 * the array stands up leaning back, facing out and up, its wings (pivot_dish-wing-l / -r)
 * unfolded flat to the sides. pivot_feed swings the feed horn up on its boom in front of it.
 */
function buildXband() {
  const W = 0.1
  const D = 0.12
  const t = 0.004
  const Hb = 0.1 - t * 3 - 0.0015 // transponder height, the folded array stack sits on top
  const root = group('radio-xband')
  const body = group('transponder')
  root.add(body)

  // Sliced stack: dark core with aluminium slices, tie rods along Z
  body.add(box(W - 0.004, Hb - 0.004, D - 0.002, mat.anodized, 'core', [0, Hb / 2, 0]))
  const slices = 6
  const sd = (D - 0.002 * (slices - 1)) / slices
  for (let i = 0; i < slices; i++) {
    const z = -D / 2 + sd / 2 + i * (sd + 0.002)
    body.add(rbox(W, Hb, sd, 0.004, i === 0 || i === slices - 1 ? mat.aluminium : mat.aluminium, `slice-${i}`, [0, Hb / 2, z]))
    body.add(screwsAt([[-0.035, Hb + 0.0006, z], [0.035, Hb + 0.0006, z]], [0, 1, 0], `slice-screws-${i}`, 0.0016))
    // Ribbed side relief on each slice
    for (const sx of [-1, 1]) body.add(box(0.0016, Hb * 0.62, sd * 0.55, mat.aluminiumDark, `slice-rib-${i}${sx}`, [sx * (W / 2 + 0.0006), Hb * 0.45, z]))
  }
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const p: V3 = [sx * 0.042, Hb / 2 + sy * (Hb / 2 - 0.008), 0]
      body.add(cyl(0.0022, 0.0022, D + 0.006, mat.titanium, 'tie-rod', 'z', p, 10))
      for (const sz of [-1, 1]) {
        const n = hex(0.0035, 0.003, mat.titanium, 'tie-nut')
        n.rotation.x = Math.PI / 2
        n.position.set(p[0], p[1], sz * (D / 2 + 0.002))
        body.add(n)
      }
    }
  // Back: connectors and label
  const c1 = microD('power-connector', 0.024)
  c1.rotation.y = Math.PI
  c1.position.set(-0.016, Hb * 0.62, -D / 2)
  body.add(c1)
  for (const [i, x] of [0.016, 0.03].entries()) {
    const s = sma(`rf-port-${i}`)
    s.rotation.y = Math.PI
    s.position.set(x, Hb * 0.62, -D / 2)
    body.add(s)
  }
  const lab = label('label', 0.05, 0.014)
  lab.rotation.y = Math.PI
  lab.position.set(0, Hb * 0.3, -D / 2)
  body.add(lab)

  // Hinge knuckles on the top front edge, launch-lock posts at the back
  const hingeY = Hb + t * 0.5 + 0.0012
  const hingeZ = D / 2 - 0.002
  for (const sx of [-1, 1]) {
    body.add(rbox(0.012, 0.008, 0.01, 0.002, mat.aluminium, 'hinge-bracket', [sx * 0.03, Hb + 0.002, hingeZ - 0.002]))
    body.add(box(0.008, 0.012, 0.008, mat.anodized, 'launch-lock', [sx * 0.044, Hb + 0.004, -D / 2 + 0.006]))
  }
  body.add(cyl(0.003, 0.003, 0.07, mat.titanium, 'hinge-pin', 'x', [0, hingeY, hingeZ], 12))

  // ---- reflectarray on pivot_dish (authored stowed, then rotated to deployed)
  const F = 0.11
  const pd = group('pivot_dish')
  pd.position.set(0, hingeY, hingeZ)
  const pw = W
  const pdp = D - 0.004
  const zc = -pdp / 2 // panel centre relative to the hinge (stowed)
  const centre = reflectPanel('array-centre', pw, pdp, t, 0, 0, F)
  centre.position.set(0, 0, zc)
  pd.add(centre)
  for (const sx of [-1, 1]) pd.add(cyl(0.0042, 0.0042, 0.016, mat.aluminium, 'hinge-knuckle', 'x', [sx * 0.03, 0, 0], 14))
  // Wings: left hinge lifted one panel, right hinge two panels, so they stack when folded
  for (const [k, sx] of ([-1, 1] as const).entries()) {
    const lift = t * (k + 1)
    const wp = group(`pivot_dish-wing-${sx < 0 ? 'l' : 'r'}`)
    wp.position.set((sx * pw) / 2, lift, zc)
    wp.userData.stowed = [0, 0, -sx * Math.PI]
    const wing = reflectPanel(`array-wing-${sx < 0 ? 'l' : 'r'}`, pw, pdp, t, sx * pw, 0, F)
    wing.position.set((sx * pw) / 2, -lift, 0)
    wp.add(wing)
    for (const z of [-pdp * 0.3, pdp * 0.3]) wp.add(cyl(0.0022, 0.0022, 0.012, mat.aluminium, 'wing-hinge', 'z', [0, 0, z], 10))
    pd.add(wp)
  }
  // Coax from the hinge to the panel
  pd.add(cable('array-coax', [[0.02, -0.002, 0], [0.024, -0.003, -0.012], [0.024, -0.003, -0.03]], 0.0012, mat.copper))
  pd.userData.stowed = [0, 0, 0]
  pd.rotation.x = (74 * Math.PI) / 180
  root.add(pd)

  // ---- feed horn on a boom hinged at the top front corner; stowed it lies along the +X side
  root.updateMatrixWorld(true)
  const arrayCentre = centre.getWorldPosition(new THREE.Vector3())
  const arrayNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(centre.getWorldQuaternion(new THREE.Quaternion()))
  const focus = arrayCentre.clone().add(arrayNormal.multiplyScalar(0.085))
  const hinge = new THREE.Vector3(W / 2 + 0.006, Hb - 0.01, D / 2 - 0.008)
  body.add(rbox(0.006, 0.014, 0.012, 0.002, mat.aluminium, 'feed-hinge-block', [W / 2 + 0.003, Hb - 0.01, D / 2 - 0.008]))
  const toFocus = focus.clone().sub(hinge)
  const boomLen = Math.min(toFocus.length() - 0.014, D - 0.012)
  const pf = group('pivot_feed')
  pf.position.copy(hinge)
  pf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toFocus.clone().normalize())
  pf.userData.stowed = [0, Math.PI, 0]
  pf.add(cyl(0.0042, 0.0042, 0.012, mat.titanium, 'feed-knuckle', 'y', [0, 0, 0], 14))
  pf.add(cyl(0.0028, 0.0028, boomLen, mat.carbon, 'feed-boom', 'z', [0, 0, boomLen / 2], 12))
  pf.add(cyl(0.0042, 0.0042, 0.006, mat.aluminium, 'feed-collar', 'z', [0, 0, boomLen - 0.003], 12))
  const horn = group('feed-horn')
  // Pyramidal horn: square frustum with a dark throat, opening toward the array
  const hornIn = new THREE.CylinderGeometry(0.0135, 0.0045, 0.022, 4, 1, true)
  hornIn.rotateY(Math.PI / 4)
  horn.add(mesh(hornIn, pm.soot, 'horn-inside', [0, 0.011, 0]))
  const hornOut = new THREE.CylinderGeometry(0.0145, 0.0055, 0.022, 4, 1, true)
  hornOut.rotateY(Math.PI / 4)
  horn.add(mesh(hornOut, mat.anodizedGold, 'horn', [0, 0.011, 0]))
  horn.add(box(0.008, 0.012, 0.005, mat.anodizedGold, 'waveguide', [0, -0.005, 0]))
  pf.add(horn)
  pf.add(cable('feed-coax', [[0.003, 0.003, 0], [0.004, 0.004, boomLen * 0.5], [0.003, 0.003, boomLen]], 0.0011, mat.copper))
  root.add(pf)
  root.updateMatrixWorld(true)
  const tip = new THREE.Vector3(0, 0, boomLen + 0.004)
  const toArray = pf.worldToLocal(arrayCentre.clone()).sub(tip).normalize()
  horn.position.copy(tip)
  horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toArray)

  return finish(root, body)
}

/* ---------------------------------------------------------------- registry */

export const models: Record<string, () => THREE.Object3D> = {
  'prop-coldgas': buildColdGas,
  'prop-chemical': () => buildChemical('prop-chemical', 0.12, false),
  'prop-chemical-large': () => buildChemical('prop-chemical-large', 0.145, true),
  'prop-ion': () => buildIon('prop-ion', 0.15, false),
  'prop-ion-large': () => buildIon('prop-ion-large', 0.16, true),
  'radio-uhf': buildUhf,
  'radio-sband': buildSband,
  'radio-xband': buildXband,
}
