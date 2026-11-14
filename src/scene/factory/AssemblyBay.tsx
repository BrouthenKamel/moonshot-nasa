import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FRAME_HEIGHT, type BayView, type StackBlock, type RowKey } from '../../viz/spacecraft/bayView'
import { CATEGORY_COLORS } from '../../viz/spacecraft/trayOptions'
import {
  paintBoard,
  paintScale,
  paintTag,
  animFromView,
  BOARD_W,
  BOARD_H,
  SCALE_W,
  SCALE_H,
  TAG_W,
  TAG_H,
  TONE_COLORS,
} from '../../viz/spacecraft/boardPainter'

/**
 * Step 3 as an assembly bay in the Factory: the 6U craft stands open on a
 * turntable scale, its parts stacked inside to scale (2 U per unit of height),
 * and the wall board shows the Go / No-Go bars. Everything drawn comes from the
 * BayView, which comes from computeBudgets / goNoGo.
 */

const SAT_X = -2.9
const STAND_Y = 1.25 // top of the stand, bottom of the box
const W = 2 // box width (scene units)
const D = 1 // box depth
const PURPLE = '#8b5cf6'
const ease = (dt: number, k: number) => 1 - Math.exp(-dt * k)

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function makeCanvasTexture(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return { canvas, ctx: canvas.getContext('2d') as CanvasRenderingContext2D, texture }
}

/* ---------------- room ---------------- */

function Room({ alarm, reduced }: { alarm: boolean; reduced: boolean }) {
  const accent = useRef<THREE.PointLight>(null)
  useFrame((state) => {
    const l = accent.current
    if (!l) return
    l.color.set(alarm ? '#ef4444' : PURPLE)
    l.intensity = alarm && !reduced ? 34 + 22 * Math.sin(state.clock.elapsedTime * 5) : 30
  })
  return (
    <group>
      <ambientLight color="#8fa3c8" intensity={0.5} />
      <spotLight position={[-3, 11, 6]} angle={0.5} penumbra={0.5} intensity={260} distance={30} color="#dbeafe" />
      <pointLight ref={accent} position={[-6, 6.5, -3.6]} intensity={30} distance={18} color={PURPLE} />
      <pointLight position={[3, 5, 5]} intensity={22} distance={16} color="#38bdf8" />
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color="#0b1220" roughness={0.35} metalness={0.5} />
      </mesh>
      <gridHelper args={[60, 60, '#2e1f5e', '#101a2e']} position-y={0.01} />
      <mesh position={[0, 8, -5]}>
        <planeGeometry args={[60, 16]} />
        <meshStandardMaterial color="#0a0f1c" />
      </mesh>
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[i * 3.4, 8, -4.85]}>
          <boxGeometry args={[0.25, 16, 0.3]} />
          <meshStandardMaterial color="#111a2c" />
        </mesh>
      ))}
      {[-8, 0, 8].map((x) => (
        <mesh key={x} position={[x, 9.2, 1]}>
          <boxGeometry args={[5, 0.08, 0.5]} />
          <meshBasicMaterial color="#e4dcff" />
        </mesh>
      ))}
      {/* Crane rail over the stand */}
      <mesh position={[SAT_X, 7.2, 0]}>
        <boxGeometry args={[14, 0.3, 0.4]} />
        <meshStandardMaterial color="#1f2a3d" metalness={0.7} />
      </mesh>
      <mesh position={[SAT_X, 6.9, 0]}>
        <boxGeometry args={[0.9, 0.35, 0.7]} />
        <meshStandardMaterial color={PURPLE} emissive={PURPLE} emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

/* ---------------- labels ---------------- */

function useTagTexture(block: StackBlock) {
  const tag = useMemo(() => makeCanvasTexture(TAG_W, TAG_H), [])
  useEffect(() => {
    paintTag(tag.ctx, block)
    tag.texture.needsUpdate = true
  }, [tag, block])
  useEffect(() => () => tag.texture.dispose(), [tag])
  return tag.texture
}

/* ---------------- a part inside the box ---------------- */

interface BlockProps {
  block: StackBlock
  tagY: number // call-out tag height, in box units
  reduced: boolean
}

function Block({ block, tagY, reduced }: BlockProps) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const label = useRef<THREE.Mesh>(null)
  const tag = useRef<THREE.Group>(null)
  const line = useRef<THREE.BufferGeometry>(null)
  const state = useRef({ base: block.base, height: block.height, drop: 0, tagY, partId: block.partId })
  const texture = useTagTexture(block)
  const color = block.readOnly ? '#475569' : (CATEGORY_COLORS[block.category] ?? '#64748b')
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3, emissive: color, emissiveIntensity: 0.12 }),
    [color]
  )
  useEffect(() => () => material.dispose(), [material])

  // A newly chosen part is lowered in from the crane
  useEffect(() => {
    if (state.current.partId === block.partId) return
    state.current.partId = block.partId
    if (!reduced) state.current.drop = 2.6
  }, [block.partId, reduced])

  useFrame((frame, dt) => {
    const s = state.current
    const k = reduced ? 1 : ease(dt, 7)
    s.base += (block.base - s.base) * k
    s.height += (block.height - s.height) * k
    s.tagY += (tagY - s.tagY) * k
    s.drop += (0 - s.drop) * (reduced ? 1 : ease(dt, 4))
    const h = Math.max(0.01, s.height - 0.02)
    if (group.current) group.current.position.y = s.base + s.height / 2 + s.drop
    if (body.current) body.current.scale.y = h
    if (label.current) {
      const lh = Math.min(0.56, h * 0.9)
      label.current.scale.set(lh * (TAG_W / TAG_H), lh, 1)
    }
    if (tag.current) tag.current.position.y = s.tagY - (s.base + s.height / 2)
    if (line.current) {
      const p = line.current.attributes.position as THREE.BufferAttribute
      p.setXYZ(0, -W / 2, 0, D / 2)
      p.setXYZ(1, -W / 2 - 0.34, s.tagY - (s.base + s.height / 2), D / 2 + 0.05)
      p.needsUpdate = true
    }
    const over = block.overLimit
    material.emissive.set(over ? '#ef4444' : color)
    material.emissiveIntensity = over ? (reduced ? 0.8 : 0.65 + 0.3 * Math.sin(frame.clock.elapsedTime * 8)) : 0.12
  })

  const linePoints = useMemo(() => new Float32Array(6), [])
  return (
    <group ref={group}>
      <mesh ref={body} material={material}>
        <boxGeometry args={[W - 0.1, 1, D - 0.1]} />
      </mesh>
      {block.callout ? (
        <>
          <lineSegments>
            <bufferGeometry ref={line}>
              <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={block.overLimit ? '#ef4444' : color} />
          </lineSegments>
          <group ref={tag} position={[-W / 2 - 1.4, 0, D / 2 + 0.05]}>
            <mesh>
              <planeGeometry args={[2.1, 0.66]} />
              <meshBasicMaterial map={texture} transparent toneMapped={false} />
            </mesh>
          </group>
        </>
      ) : (
        <mesh ref={label} position={[0, 0, D / 2 - 0.04]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** Call-out tags beside the box, spread so they never overlap. */
function calloutHeights(stack: StackBlock[]): Record<string, number> {
  const out: Record<string, number> = {}
  let floor = -Infinity
  for (const b of stack) {
    if (!b.callout) continue
    const y = Math.max(b.base + b.height / 2, floor + 0.72)
    out[b.key] = y
    floor = y
  }
  return out
}

/* ---------------- outside parts ---------------- */

const CELL = new THREE.MeshStandardMaterial({ color: '#1d4ed8', emissive: '#1e40af', emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.3 })
const METAL = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide })
const DARK = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.7, roughness: 0.4 })

function Wing({ side, segments, reduced }: { side: 1 | -1; segments: number; reduced: boolean }) {
  const root = useRef<THREE.Group>(null)
  const segs = useRef<Array<THREE.Group | null>>([])
  const k = useRef([segments >= 1 ? 1 : 0, segments >= 2 ? 1 : 0])
  useFrame((_, dt) => {
    for (let i = 0; i < 2; i++) {
      const target = segments > i ? 1 : 0
      k.current[i] += (target - k.current[i]) * (reduced ? 1 : ease(dt, i ? 3 : 4))
      const g = segs.current[i]
      if (g) {
        g.scale.x = Math.max(0.001, k.current[i])
        g.visible = k.current[i] > 0.01
      }
    }
    if (root.current) root.current.rotation.y = side * (1 - k.current[0]) * 1.4
  })
  return (
    <group ref={root} position={[(side * W) / 2, FRAME_HEIGHT / 2, -0.3]}>
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => {
            segs.current[i] = g
          }} position-x={side * i * 1.2}>
          <mesh position-x={side * 0.6} material={CELL}>
            <boxGeometry args={[1.14, 2.7, 0.04]} />
          </mesh>
          {[-0.9, 0, 0.9].map((dy) => (
            <lineSegments key={dy} position={[side * 0.6, dy, 0]}>
              <edgesGeometry args={[new THREE.BoxGeometry(1.14, 0.9, 0.05)]} />
              <lineBasicMaterial color="#93c5fd" />
            </lineSegments>
          ))}
        </group>
      ))}
    </group>
  )
}

function Antenna({ kind }: { kind: BayView['outside']['radio'] }) {
  const dish = useMemo(() => {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 12; i++) {
      const r = (i / 12) * 0.75
      pts.push(new THREE.Vector2(r, r * r * 0.5))
    }
    return new THREE.LatheGeometry(pts, 32)
  }, [])
  useEffect(() => () => dish.dispose(), [dish])
  if (kind === 'whip')
    return (
      <mesh position={[0.6, FRAME_HEIGHT + 0.45, 0.2]} material={METAL}>
        <cylinderGeometry args={[0.02, 0.02, 0.9, 6]} />
      </mesh>
    )
  if (kind === 'patch')
    return (
      <mesh position={[0.45, FRAME_HEIGHT + 0.05, 0]} material={METAL}>
        <boxGeometry args={[0.7, 0.05, 0.7]} />
      </mesh>
    )
  if (kind === 'dish')
    return (
      <group position={[0.35, FRAME_HEIGHT, 0]}>
        <mesh position-y={0.25} material={DARK}>
          <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
        </mesh>
        <mesh position-y={0.5} rotation-x={-0.5} geometry={dish} material={METAL} />
      </group>
    )
  return null
}

function Engine({ kind, starved, reduced }: { kind: BayView['outside']['engine']; starved: boolean; reduced: boolean }) {
  const glow = useRef<THREE.PointLight>(null)
  const grid = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const on = kind === 'ion' ? (starved ? (reduced ? 0.15 : Math.sin(t * 14) > 0.6 ? 0.8 : 0.05) : reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 5)) : 0
    if (glow.current) glow.current.intensity = on * 7
    if (grid.current) grid.current.color.setRGB(0.25 + 0.2 * on, 0.5 + 0.35 * on, 0.7 + 0.3 * on)
  })
  if (kind === 'none') return null
  if (kind === 'ion')
    return (
      <group>
        <mesh position-y={-0.15} material={DARK}>
          <cylinderGeometry args={[0.42, 0.5, 0.3, 32]} />
        </mesh>
        <mesh position-y={-0.31} rotation-x={Math.PI / 2}>
          <circleGeometry args={[0.4, 32]} />
          <meshBasicMaterial ref={grid} color="#7dd3fc" side={THREE.DoubleSide} />
        </mesh>
        <pointLight ref={glow} position-y={-0.6} color="#60a5fa" distance={4} intensity={6} />
      </group>
    )
  const r = kind === 'chemical' ? 0.2 : 0.09
  const h = kind === 'chemical' ? 0.4 : 0.18
  return (
    <group>
      {[
        [-0.6, -0.25],
        [0.6, -0.25],
        [-0.6, 0.25],
        [0.6, 0.25],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, -h / 2, z]} material={METAL}>
          <coneGeometry args={[r, h, 16, 1, true]} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- the craft ---------------- */

function Craft({ view, reduced }: { view: BayView; reduced: boolean }) {
  const o = view.outside
  const volumeRed = view.rows.find((r) => r.key === 'volume')?.tone === 'red'
  const frameEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(W, FRAME_HEIGHT, D)), [])
  useEffect(() => () => frameEdges.dispose(), [frameEdges])
  const tags = calloutHeights(view.stack)
  const top = view.stack.reduce((m, b) => Math.max(m, b.base + b.height), 0)
  const ghost = useRef<THREE.MeshBasicMaterial>(null)
  const tracker = useRef<THREE.Group>(null)
  const tk = useRef(o.starTracker ? 1 : 0)

  useFrame((state, dt) => {
    CELL.emissiveIntensity = o.powerShort ? (reduced ? 0.1 : 0.15 + 0.15 * Math.sin(state.clock.elapsedTime * 9)) : 0.5
    if (ghost.current) ghost.current.opacity = reduced ? 0.3 : 0.25 + 0.12 * Math.sin(state.clock.elapsedTime * 8)
    tk.current += ((o.starTracker ? 1 : 0) - tk.current) * (reduced ? 1 : ease(dt, 6))
    if (tracker.current) {
      tracker.current.scale.setScalar(Math.max(0.001, tk.current))
      tracker.current.visible = tk.current > 0.02
    }
  })

  return (
    <group position-y={STAND_Y}>
      <lineSegments geometry={frameEdges} position-y={FRAME_HEIGHT / 2}>
        <lineBasicMaterial color={volumeRed ? '#ef4444' : '#c4b5fd'} />
      </lineSegments>
      {/* Back plate and end caps */}
      <mesh position={[0, FRAME_HEIGHT / 2, -D / 2]} material={DARK}>
        <boxGeometry args={[W, FRAME_HEIGHT, 0.04]} />
      </mesh>
      {[0, FRAME_HEIGHT].map((y) => (
        <mesh key={y} position-y={y}>
          <boxGeometry args={[W + 0.06, 0.05, D + 0.06]} />
          <meshStandardMaterial color="#475569" metalness={0.7} />
        </mesh>
      ))}
      {view.stack.map((b) => (
        <Block key={b.key} block={b} tagY={tags[b.key] ?? 0} reduced={reduced} />
      ))}
      {top > FRAME_HEIGHT + 1e-6 && (
        <mesh position-y={FRAME_HEIGHT + (top - FRAME_HEIGHT) / 2}>
          <boxGeometry args={[W + 0.04, top - FRAME_HEIGHT, D + 0.04]} />
          <meshBasicMaterial ref={ghost} color="#ef4444" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
      {/* Solar: cells on the box, or wings that unfold */}
      {o.solar === 'body' &&
        ([-1, 1] as const).map((s) => (
          <mesh key={s} position={[(s * (W + 0.05)) / 2, FRAME_HEIGHT / 2, 0]} material={CELL}>
            <boxGeometry args={[0.04, FRAME_HEIGHT - 0.2, D - 0.1]} />
          </mesh>
        ))}
      {([-1, 1] as const).map((s) => (
        <Wing key={s} side={s} segments={o.solar === 'array' ? 2 : o.solar === 'wings' ? 1 : 0} reduced={reduced} />
      ))}
      <group ref={tracker} position={[W / 2, FRAME_HEIGHT - 0.5, 0.2]}>
        <mesh position-x={0.2} rotation-z={-Math.PI / 2.6} material={DARK}>
          <cylinderGeometry args={[0.13, 0.16, 0.5, 16]} />
        </mesh>
        <mesh position={[0.42, 0.12, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial color="#67e8f9" />
        </mesh>
      </group>
      <Antenna kind={o.radio} />
      <Engine kind={o.engine} starved={o.engineStarved} reduced={reduced} />
    </group>
  )
}

/* ---------------- turntable, board, scale ---------------- */

function Turntable({ view, reduced, children }: { view: BayView; reduced: boolean; children: React.ReactNode }) {
  const turn = useRef<THREE.Group>(null)
  const spin = useRef(-0.45)
  const drag = useRef<{ x: number; s: number } | null>(null)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, s: spin.current }
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      if (drag.current) spin.current = drag.current.s + (e.clientX - drag.current.x) * 0.008
    }
    const up = () => {
      drag.current = null
      el.style.cursor = 'grab'
    }
    el.style.cursor = 'grab'
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl])
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state, dt) => {
    if (!drag.current && !reduced) spin.current += (Math.sin(state.clock.elapsedTime * 0.25) * 0.1 - 0.45 - spin.current) * dt * 0.3
    if (turn.current) turn.current.rotation.y = spin.current
    if (ring.current) ring.current.color.set(TONE_COLORS[view.massTone])
  })
  return (
    <group position-x={SAT_X}>
      <mesh position-y={0.25}>
        <cylinderGeometry args={[2.1, 2.3, 0.5, 48]} />
        <meshStandardMaterial color="#141d2e" metalness={0.6} />
      </mesh>
      <mesh position-y={0.52} rotation-x={Math.PI / 2}>
        <torusGeometry args={[2.12, 0.04, 8, 64]} />
        <meshBasicMaterial ref={ring} color={TONE_COLORS[view.massTone]} />
      </mesh>
      <group ref={turn}>
        {[-0.7, 0.7].map((x) => (
          <mesh key={x} position={[x, (STAND_Y + 0.5) / 2, 0]} material={DARK}>
            <boxGeometry args={[0.12, STAND_Y - 0.5, 0.12]} />
          </mesh>
        ))}
        {children}
      </group>
    </group>
  )
}

function WallBoard({ view, reduced }: { view: BayView; reduced: boolean }) {
  const board = useMemo(() => makeCanvasTexture(BOARD_W, BOARD_H), [])
  const scale = useMemo(() => makeCanvasTexture(SCALE_W, SCALE_H), [])
  useEffect(
    () => () => {
      board.texture.dispose()
      scale.texture.dispose()
    },
    [board, scale]
  )
  const anim = useRef(animFromView(view))
  const last = useRef({ phase: -1, dirty: true })
  useEffect(() => {
    last.current.dirty = true
  }, [view])
  useFrame((state, dt) => {
    const a = anim.current
    a.t = state.clock.elapsedTime
    a.reduced = reduced
    let moving = false
    for (const r of view.rows) {
      const cur = a.shown[r.key as RowKey] ?? r.value
      const next = reduced ? r.value : cur + (r.value - cur) * ease(dt, 7)
      if (Math.abs(next - r.value) > 1e-3) moving = true
      a.shown[r.key as RowKey] = Math.abs(next - r.value) > 1e-3 ? next : r.value
    }
    const phase = view.status.tone === 'red' && !reduced ? Math.floor(a.t * 1.5) % 2 : 0
    if (!moving && !last.current.dirty && phase === last.current.phase) return
    last.current = { phase, dirty: moving }
    paintBoard(board.ctx, view, a)
    board.texture.needsUpdate = true
    paintScale(scale.ctx, view, a.shown.mass)
    scale.texture.needsUpdate = true
  })
  return (
    <group>
      <group position={[4.0, 3.25, -3.0]} rotation-y={-0.3}>
        <mesh position-z={-0.09}>
          <boxGeometry args={[6.3, 4.8, 0.15]} />
          <meshStandardMaterial color="#0f172a" metalness={0.6} />
        </mesh>
        <mesh>
          <planeGeometry args={[6, 4.5]} />
          <meshBasicMaterial map={board.texture} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[SAT_X, 0.32, 2.36]} rotation-x={-0.35}>
        <planeGeometry args={[2.0, 0.42]} />
        <meshBasicMaterial map={scale.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Camera that keeps the craft and the board in view on narrow and wide panes. */
function BayCamera() {
  const { camera, size } = useThree()
  useEffect(() => {
    // Fit a 15 x 6.6 unit window (wing tip to board edge, floor to antenna) at any pane shape
    const aspect = size.width / Math.max(1, size.height)
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 40
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const back = Math.max(6.6 / span, 15 / (span * aspect))
    cam.position.set(0.5, 3.3, back)
    cam.lookAt(0.5, 2.45, 0)
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export function AssemblyBay({ view }: { view: BayView }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 40, position: [0.5, 3.3, 9], near: 0.1, far: 100 }}
      gl={{ antialias: true }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#03050a')
        scene.fog = new THREE.Fog('#03050a', 15, 36)
      }}
    >
      <BayCamera />
      <Room alarm={view.worst === 'red'} reduced={reduced} />
      <Turntable view={view} reduced={reduced}>
        <Craft view={view} reduced={reduced} />
      </Turntable>
      <WallBoard view={view} reduced={reduced} />
    </Canvas>
  )
}
