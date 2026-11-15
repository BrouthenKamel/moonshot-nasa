/**
 * Pure movement logic for the campus astronaut: nav grid, A*, path smoothing, stepping.
 * No React or three imports; coordinates are world X/Z (ground plane), heading is radians
 * about +Y where 0 faces +Z (so dir = (sin h, cos h)).
 */

export interface Vec2 {
  x: number
  z: number
}

export interface NavGrid {
  /** World position of the grid's minimum corner */
  originX: number
  originZ: number
  cell: number
  cols: number
  rows: number
  /** true = walkable; index = row * cols + col */
  walkable: boolean[]
}

export function createNavGrid(minX: number, minZ: number, maxX: number, maxZ: number, cell: number): NavGrid {
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell))
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell))
  return { originX: minX, originZ: minZ, cell, cols, rows, walkable: new Array<boolean>(cols * rows).fill(true) }
}

export function inBounds(g: NavGrid, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < g.cols && r < g.rows
}

export function worldToCell(g: NavGrid, p: Vec2): { c: number; r: number } {
  return { c: Math.floor((p.x - g.originX) / g.cell), r: Math.floor((p.z - g.originZ) / g.cell) }
}

export function cellCenter(g: NavGrid, c: number, r: number): Vec2 {
  return { x: g.originX + (c + 0.5) * g.cell, z: g.originZ + (r + 0.5) * g.cell }
}

export function isWalkable(g: NavGrid, c: number, r: number): boolean {
  return inBounds(g, c, r) && g.walkable[r * g.cols + c]
}

/** Is the world point on a walkable cell? */
export function isWalkableAt(g: NavGrid, p: Vec2): boolean {
  const { c, r } = worldToCell(g, p)
  return isWalkable(g, c, r)
}

/** Block every cell touched by the axis-aligned rectangle (world units), grown by `margin` */
export function blockRect(g: NavGrid, minX: number, minZ: number, maxX: number, maxZ: number, margin = 0) {
  const c0 = Math.floor((minX - margin - g.originX) / g.cell)
  const c1 = Math.floor((maxX + margin - g.originX) / g.cell)
  const r0 = Math.floor((minZ - margin - g.originZ) / g.cell)
  const r1 = Math.floor((maxZ + margin - g.originZ) / g.cell)
  for (let r = Math.max(0, r0); r <= Math.min(g.rows - 1, r1); r++)
    for (let c = Math.max(0, c0); c <= Math.min(g.cols - 1, c1); c++) g.walkable[r * g.cols + c] = false
}

/** Block cells whose centre is within `radius` of a point */
export function blockCircle(g: NavGrid, cx: number, cz: number, radius: number) {
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++) {
      const p = cellCenter(g, c, r)
      if (Math.hypot(p.x - cx, p.z - cz) <= radius) g.walkable[r * g.cols + c] = false
    }
}

/** Nearest walkable cell to (c, r); null when the grid has none. Campus grids are small, so a scan is fine. */
export function nearestWalkable(g: NavGrid, c: number, r: number): { c: number; r: number } | null {
  let best: { c: number; r: number } | null = null
  let bestD = Infinity
  for (let rr = 0; rr < g.rows; rr++)
    for (let cc = 0; cc < g.cols; cc++) {
      if (!g.walkable[rr * g.cols + cc]) continue
      const d = (cc - c) ** 2 + (rr - r) ** 2
      if (d < bestD) {
        bestD = d
        best = { c: cc, r: rr }
      }
    }
  return best
}

const SQRT2 = Math.SQRT2
const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

/** A* over cells, 8-connected, no corner cutting. Returns cell coordinates start..goal, or null. */
export function astar(
  g: NavGrid,
  start: { c: number; r: number },
  goal: { c: number; r: number },
): { c: number; r: number }[] | null {
  if (!isWalkable(g, start.c, start.r) || !isWalkable(g, goal.c, goal.r)) return null
  const n = g.cols * g.rows
  const gs = new Float64Array(n).fill(Infinity)
  const from = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const idx = (c: number, r: number) => r * g.cols + c
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - goal.c)
    const dz = Math.abs(r - goal.r)
    return dx + dz + (SQRT2 - 2) * Math.min(dx, dz)
  }
  const heap: [number, number][] = []
  const push = (f: number, i: number) => {
    heap.push([f, i])
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heap[p][0] <= heap[k][0]) break
      ;[heap[p], heap[k]] = [heap[k], heap[p]]
      k = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const rr = l + 1
        let m = k
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k], heap[m]]
        k = m
      }
    }
    return top
  }
  const s = idx(start.c, start.r)
  const t = idx(goal.c, goal.r)
  gs[s] = 0
  push(h(start.c, start.r), s)
  while (heap.length) {
    const [, cur] = pop()
    if (closed[cur]) continue
    closed[cur] = 1
    if (cur === t) {
      const out: { c: number; r: number }[] = []
      for (let i = t; i !== -1; i = from[i]) out.push({ c: i % g.cols, r: Math.floor(i / g.cols) })
      return out.reverse()
    }
    const cc = cur % g.cols
    const cr = Math.floor(cur / g.cols)
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = cc + dc
      const nr = cr + dr
      if (!isWalkable(g, nc, nr)) continue
      if (dc !== 0 && dr !== 0 && (!isWalkable(g, cc + dc, cr) || !isWalkable(g, cc, cr + dr))) continue
      const ni = idx(nc, nr)
      if (closed[ni]) continue
      const ng = gs[cur] + cost
      if (ng < gs[ni]) {
        gs[ni] = ng
        from[ni] = cur
        push(ng + h(nc, nr), ni)
      }
    }
  }
  return null
}

/** Straight segment a to b clear of blocked cells (sampled at quarter-cell steps) */
export function lineOfSight(g: NavGrid, a: Vec2, b: Vec2): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.25)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (!isWalkableAt(g, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false
  }
  return true
}

/** Greedy string-pulling: drop waypoints the walker can skip in a straight line */
export function smoothPath(g: NavGrid, path: Vec2[]): Vec2[] {
  if (path.length <= 2) return path.slice()
  const out: Vec2[] = [path[0]]
  let anchor = 0
  for (let i = 2; i < path.length; i++) {
    if (!lineOfSight(g, path[anchor], path[i])) {
      out.push(path[i - 1])
      anchor = i - 1
    }
  }
  out.push(path[path.length - 1])
  return out
}

/**
 * Path from `from` to `to` (world points). A blocked or out-of-grid target snaps to the nearest
 * walkable cell. Returns waypoints (excluding the start) ending at the target when it is
 * walkable, else at the snapped cell centre. Empty when unreachable or already there.
 */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] {
  const sc0 = worldToCell(g, from)
  const start = isWalkable(g, sc0.c, sc0.r) ? sc0 : nearestWalkable(g, sc0.c, sc0.r)
  const tc = worldToCell(g, to)
  const goalExact = isWalkable(g, tc.c, tc.r)
  const goal = goalExact ? tc : nearestWalkable(g, tc.c, tc.r)
  if (!start || !goal) return []
  const cells = astar(g, start, goal)
  if (!cells) return []
  const pts: Vec2[] = cells.map((k) => cellCenter(g, k.c, k.r))
  pts[0] = { x: from.x, z: from.z }
  const end = goalExact ? { x: to.x, z: to.z } : pts[pts.length - 1]
  if (pts.length > 1) pts[pts.length - 1] = end
  else pts.push(end)
  const smooth = smoothPath(g, pts)
  smooth.shift()
  return smooth
}

export interface WalkerState {
  x: number
  z: number
  heading: number
  /** Remaining waypoints; empty when idle */
  path: Vec2[]
  /** Current speed in world units / second */
  speed: number
}

export interface WalkerInput {
  /** WASD vector in world space; any non-zero value cancels the path */
  move?: Vec2
}

export interface WalkerParams {
  maxSpeed: number
  /** radians / second */
  turnRate: number
  /** units / second^2 */
  accel: number
  arriveRadius: number
}

export const DEFAULT_WALKER: WalkerParams = { maxSpeed: 3.2, turnRate: 9, accel: 18, arriveRadius: 0.05 }

export function createWalker(x = 0, z = 0, heading = 0): WalkerState {
  return { x, z, heading, path: [], speed: 0 }
}

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export interface StepResult {
  state: WalkerState
  /** Set on the step in which the final waypoint was reached */
  arrived: Vec2 | null
}

/**
 * Advance one frame. WASD (`input.move`) cancels any path and drives directly, sliding along
 * blocked cells. Otherwise the walker follows `state.path`. Pure: returns a new state.
 */
export function step(
  state: WalkerState,
  input: WalkerInput,
  dt: number,
  grid?: NavGrid,
  params: WalkerParams = DEFAULT_WALKER,
): StepResult {
  let { x, z, heading, path, speed } = state
  let arrived: Vec2 | null = null
  let dir: Vec2 | null = null
  let slowFor = 1

  const mv = input.move
  const manual = !!mv && (mv.x !== 0 || mv.z !== 0)
  if (manual) {
    path = []
    const len = Math.hypot(mv.x, mv.z)
    dir = { x: mv.x / len, z: mv.z / len }
  } else if (path.length > 0) {
    const wp = path[0]
    const dist = Math.hypot(wp.x - x, wp.z - z)
    if (dist <= params.arriveRadius) {
      path = path.slice(1)
      if (path.length === 0) arrived = { x: wp.x, z: wp.z }
    } else {
      dir = { x: (wp.x - x) / dist, z: (wp.z - z) / dist }
      // brake into the final waypoint so we stop without overshoot
      if (path.length === 1) slowFor = Math.min(1, dist / 0.6 + 0.2)
    }
  }

  if (dir) {
    const want = Math.atan2(dir.x, dir.z)
    const diff = angleDiff(heading, want)
    const maxTurn = params.turnRate * dt
    heading += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn
    const align = Math.max(0, Math.cos(angleDiff(heading, want)))
    const target = params.maxSpeed * slowFor * (0.25 + 0.75 * align)
    speed = Math.min(target, speed + params.accel * dt)
    const dist = speed * dt
    let nx = x + dir.x * dist
    let nz = z + dir.z * dist
    if (!manual && path.length > 0) {
      const wp = path[0]
      if (dist >= Math.hypot(wp.x - x, wp.z - z)) {
        nx = wp.x
        nz = wp.z
      }
    }
    if (grid && !isWalkableAt(grid, { x: nx, z: nz })) {
      // slide along an axis if possible, else stay
      if (isWalkableAt(grid, { x: nx, z })) nz = z
      else if (isWalkableAt(grid, { x, z: nz })) nx = x
      else {
        nx = x
        nz = z
        speed = 0
      }
    }
    x = nx
    z = nz
  } else {
    speed = Math.max(0, speed - params.accel * 2 * dt)
  }

  return { state: { x, z, heading, path, speed }, arrived }
}

/** Replace the walker's path with a route to `target` (click-to-move) */
export function setDestination(state: WalkerState, grid: NavGrid, target: Vec2): WalkerState {
  return { ...state, path: findPath(grid, { x: state.x, z: state.z }, target) }
}
