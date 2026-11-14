import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FRAME_HEIGHT, type BayView, type StackBlock, type RowKey } from '../../viz/spacecraft/bayView'
import { CATEGORY_COLORS } from '../../viz/spacecraft/trayOptions'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { CraftModel } from './CraftModel'
import { PartSlot, type SlotLive } from './PartSlot'
import { preloadPartModels } from './partModels'
import { choiceArt } from '../../assets/catalogueArt'
import { audio } from '../../assets/audio'
import type { ModelId } from '../../assets/manifest'
import { useModel } from '../../assets/models'
import {
  paintBoard,
  paintScale,
  wrapText,
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
const PATCH_RADIO = 'radio-sband'
const TAG_Z = D / 2 + 0.4
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

class BayBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

function LoadedBayModel({
  id,
  position,
  rotation,
  scale = 1,
}: {
  id: ModelId
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
}) {
  const scene = useModel(id)
  return <primitive object={scene} position={position} rotation={rotation} scale={scale} />
}

function SafeBayModel({
  id,
  fallback = null,
  ...props
}: {
  id: ModelId
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
  fallback?: ReactNode
}) {
  return (
    <BayBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LoadedBayModel id={id} {...props} />
      </Suspense>
    </BayBoundary>
  )
}

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
      {/* NASA cleanroom props: 1.8m astronaut beside stand, ORU rack, and IceCube 3U reference display */}
      <SafeBayModel id="model.env-astronaut" position={[SAT_X - 2.35, 0, -0.75]} rotation={[0, 0.55, 0]} scale={1} />
      <SafeBayModel id="model.env-cleanroom-oru" position={[5.1, 0, -1.55]} rotation={[0, -0.45, 0]} scale={1.05} />
      <group position={[0.35, 0, -2.1]}>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.32, 0.36, 1.0, 24]} />
          <meshStandardMaterial color="#141d2e" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.02, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.32, 0.015, 8, 32]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <SafeBayModel id="model.nasa-icecube" position={[0, 1.46, 0]} rotation={[0, 0.4, 0]} scale={1.4} />
      </group>
    </group>
  )
}

/* ---------------- labels ---------------- */

/**
 * A name tag, as boardPainter's paintTag draws it (stripe in the category colour, battery cells or
 * computer boards, the sub line), but the full name always fits: it shrinks, then takes two lines,
 * instead of being cut ("Large Battery Pac…").
 */
function paintBayTag(ctx: CanvasRenderingContext2D, block: StackBlock) {
  const color = block.overLimit ? '#ef4444' : (CATEGORY_COLORS[block.category] ?? '#64748b')
  ctx.clearRect(0, 0, TAG_W, TAG_H)
  ctx.fillStyle = 'rgba(2, 6, 23, 0.92)'
  ctx.fillRect(0, 0, TAG_W, TAG_H)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 14, TAG_H)
  let textX = 36
  if (block.detail > 0) {
    for (let i = 0; i < block.detail; i++) {
      if (block.category === 'battery') ctx.fillRect(36 + i * 34, 52, 24, 96)
      else ctx.fillRect(36, 60 + i * 44, 92, 30)
    }
    textX = block.category === 'battery' ? 56 + block.detail * 34 : 150
  }
  const maxW = TAG_W - textX - 20
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  let lines: string[] = []
  for (const size of [44, 40, 36]) {
    ctx.font = `600 ${size}px system-ui, sans-serif`
    if (ctx.measureText(block.name).width <= maxW) {
      lines = [block.name]
      break
    }
  }
  if (lines.length === 0) {
    ctx.font = '600 36px system-ui, sans-serif'
    lines = wrapText(ctx, block.name, maxW, 2)
  }
  const two = lines.length > 1
  const nameY = block.sub ? (two ? [46, 90] : [72]) : two ? [78, 122] : [100]
  lines.forEach((line, i) => ctx.fillText(line, textX, nameY[i]))
  if (block.sub) {
    ctx.fillStyle = block.readOnly ? '#94a3b8' : '#cbd5e1'
    ctx.font = `${two ? 30 : 34}px system-ui, sans-serif`
    ctx.fillText(wrapText(ctx, block.sub, maxW, 1)[0] ?? '', textX, two ? 146 : 134)
  }
}

function useTagTexture(block: StackBlock) {
  const tag = useMemo(() => makeCanvasTexture(TAG_W, TAG_H), [])
  useEffect(() => {
    paintBayTag(tag.ctx, block)
    tag.texture.needsUpdate = true
  }, [tag, block])
  useEffect(() => () => tag.texture.dispose(), [tag])
  return tag.texture
}

/* ---------------- a part inside the box ---------------- */

/** Every name tag sits in one column left of the box, so the hardware inside stays in view. */
const TAG_H3 = 0.5 // tag height, scene units
const TAG_W3 = TAG_H3 * (TAG_W / TAG_H)
const TAG_GAP = 0.56 // centre to centre
const TAG_X = -W / 2 - 0.42 - TAG_W3 / 2
const TAG_BACK = new THREE.MeshBasicMaterial({ color: '#020617' })
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()
const FALL = 0.42 // seconds from the crane to the slot
const DROP = 2.4 // how high a new part starts above its slot

interface BlockProps {
  block: StackBlock
  tagY: number // name tag height, in box units
  delay: number // seconds before the opening drop (staggered by stack order)
  reduced: boolean
}

function Block({ block, tagY, delay, reduced }: BlockProps) {
  const slot = useRef<THREE.Group>(null)
  const tag = useRef<THREE.Group>(null)
  const line = useRef<THREE.BufferGeometry>(null)
  const lineMat = useRef<THREE.LineBasicMaterial>(null)
  const live = useRef<SlotLive>({ height: block.height, flash: 0, squash: 0 })
  // t: seconds since this part was picked (negative while waiting for its turn)
  const state = useRef({ base: block.base, tagY, partId: block.partId, t: reduced ? 99 : -delay, snap: false })
  const texture = useTagTexture(block)
  const color = block.readOnly ? '#64748b' : (CATEGORY_COLORS[block.category] ?? '#64748b')
  const accent = choiceArt(block.partId)?.accent ?? color

  // A newly chosen part drops from the crane and snaps into its slot
  useEffect(() => {
    if (state.current.partId === block.partId) return
    state.current.partId = block.partId
    state.current.t = reduced ? FALL : 0
    // The tray card plays the pick sound; the bay adds the clunk when the part lands
    state.current.snap = true
  }, [block.partId, reduced])

  useFrame(({ camera }, delta) => {
    const s = state.current
    const l = live.current
    const dt = Math.min(delta, 0.1)
    const k = reduced ? 1 : ease(dt, 7)
    s.base += (block.base - s.base) * k
    l.height += (block.height - l.height) * k
    s.tagY += (tagY - s.tagY) * k
    s.t += dt

    // Falling under gravity, then a damped squash on landing and a flash in the part's colour
    const p = Math.min(1, Math.max(0, s.t / FALL))
    const drop = reduced || s.t >= FALL ? 0 : s.t < 0 ? DROP : DROP * (1 - p * p)
    const since = s.t - FALL
    if (s.snap && since >= 0) {
      s.snap = false
      // With reduced motion the part is home at once: the card's pick sound is the only one
      if (!reduced) audio.play('sfx.snap')
    }
    l.squash = reduced || since < 0 ? 0 : 0.16 * Math.exp(-since * 11) * Math.cos(since * 34)
    l.flash = since < 0 ? 0 : Math.exp(-since * 3.2)
    if (slot.current) {
      slot.current.position.y = s.base + l.height / 2 + drop
      slot.current.visible = s.t >= 0
    }
    const t = tag.current
    if (t) {
      t.position.y = s.tagY
      // Face the camera as the turntable turns, so the tags read flat instead of skewed
      if (t.parent) {
        t.parent.getWorldQuaternion(_q)
        t.quaternion.copy(_q.invert().multiply(camera.quaternion))
      }
    }
    if (line.current) {
      const pos = line.current.attributes.position as THREE.BufferAttribute
      pos.setXYZ(0, -W / 2 + 0.06, s.base + l.height / 2, D / 2 - 0.02)
      // The tag's right edge, wherever the billboard has turned it
      _v.set(TAG_W3 / 2, 0, 0)
      if (t) _v.applyQuaternion(t.quaternion)
      pos.setXYZ(1, TAG_X + _v.x, s.tagY + _v.y, TAG_Z + _v.z)
      pos.needsUpdate = true
    }
    if (lineMat.current) lineMat.current.color.set(block.overLimit ? '#ef4444' : color)
  })

  const linePoints = useMemo(() => new Float32Array(6), [])
  return (
    <group>
      <group ref={slot}>
        <PartSlot
          partId={block.partId}
          width={W}
          depth={D}
          height={block.height}
          live={live}
          color={color}
          accent={accent}
          over={block.overLimit}
          reduced={reduced}
        />
      </group>
      <lineSegments>
        <bufferGeometry ref={line}>
          <bufferAttribute attach="attributes-position" args={[linePoints, 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={lineMat} color={color} transparent opacity={0.85} />
      </lineSegments>
      <group ref={tag} position={[TAG_X, tagY, TAG_Z]}>
        {/* Solid backing: the folded-out wing behind must not show through the text */}
        <mesh position-z={-0.004} material={TAG_BACK}>
          <planeGeometry args={[TAG_W3, TAG_H3]} />
        </mesh>
        <mesh>
          <planeGeometry args={[TAG_W3, TAG_H3]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Name tags beside the box, in stack order, spread so they never overlap and centred on the stack. */
function tagHeights(stack: StackBlock[]): Record<string, number> {
  const out: Record<string, number> = {}
  if (stack.length === 0) return out
  const ideal = stack.map((b) => b.base + b.height / 2)
  const ys: number[] = []
  for (let i = 0; i < ideal.length; i++) ys.push(i === 0 ? ideal[0] : Math.max(ideal[i], ys[i - 1] + TAG_GAP))
  // Pull the column down if it runs far above the box, but not below the stand
  const top = Math.max(FRAME_HEIGHT, ...stack.map((b) => b.base + b.height)) + 0.1
  const shift = Math.min(Math.max(0, ys[ys.length - 1] - top), Math.max(0, ys[0] + 0.95))
  stack.forEach((b, i) => {
    out[b.key] = ys[i] - shift
  })
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

const GOLD = new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 1, roughness: 0.3 })

/** The S-band radio's two patch antennas, on the box's top end (see Craft). */
function TopPatches() {
  return (
    <group position-y={FRAME_HEIGHT + 0.025}>
      {[-0.45, 0.45].map((x) => (
        <group key={x} position={[x, 0, 0.12]} rotation-x={0.5}>
          <mesh material={DARK}>
            <boxGeometry args={[0.44, 0.04, 0.44]} />
          </mesh>
          <mesh position-y={0.03} material={GOLD}>
            <boxGeometry args={[0.3, 0.02, 0.3]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** The drawn outside parts: the fallback for the CubeSat model. */
function DrawnOutside({ view, reduced }: { view: BayView; reduced: boolean }) {
  const o = view.outside
  const tracker = useRef<THREE.Group>(null)
  const tk = useRef(o.starTracker ? 1 : 0)
  useFrame((state, dt) => {
    CELL.emissiveIntensity = o.powerShort ? (reduced ? 0.1 : 0.15 + 0.15 * Math.sin(state.clock.elapsedTime * 9)) : 0.5
    tk.current += ((o.starTracker ? 1 : 0) - tk.current) * (reduced ? 1 : ease(dt, 6))
    if (tracker.current) {
      tracker.current.scale.setScalar(Math.max(0.001, tk.current))
      tracker.current.visible = tk.current > 0.02
    }
  })
  return (
    <group>
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

/** Falls back to the drawn parts if the model cannot load. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/* ---------------- the craft ---------------- */

function Craft({ view, reduced }: { view: BayView; reduced: boolean }) {
  const volumeRed = view.rows.find((r) => r.key === 'volume')?.tone === 'red'
  const frameEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(W, FRAME_HEIGHT, D)), [])
  useEffect(() => () => frameEdges.dispose(), [frameEdges])
  const tags = tagHeights(view.stack)
  const top = view.stack.reduce((m, b) => Math.max(m, b.base + b.height), 0)
  const ghost = useRef<THREE.MeshBasicMaterial>(null)
  // The S-band patches sit on the CubeSat model's top face, which the bay turns into the open
  // front: there they would hang in front of the engine slot. The bay shows them on the box's
  // top end instead, where the old drawn bay had its patch antenna.
  const movePatch = view.outside.modelParts.includes(PATCH_RADIO)
  const outsideView = useMemo(
    () => ({ ...view, outside: { ...view.outside, modelParts: view.outside.modelParts.filter((id) => id !== PATCH_RADIO) } }),
    [view]
  )

  useFrame((state) => {
    if (ghost.current) ghost.current.opacity = reduced ? 0.3 : 0.25 + 0.12 * Math.sin(state.clock.elapsedTime * 8)
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
      {view.stack.map((b, i) => (
        <Block key={b.key} block={b} tagY={tags[b.key] ?? 0} delay={0.35 + i * 0.14} reduced={reduced} />
      ))}
      {top > FRAME_HEIGHT + 1e-6 && (
        <mesh position-y={FRAME_HEIGHT + (top - FRAME_HEIGHT) / 2}>
          <boxGeometry args={[W + 0.04, top - FRAME_HEIGHT, D + 0.04]} />
          <meshBasicMaterial ref={ghost} color="#ef4444" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
      {/* Outside parts: Kamel's CubeSat model, or the drawn parts while it loads or if it fails */}
      <ModelBoundary fallback={<DrawnOutside view={view} reduced={reduced} />}>
        <Suspense fallback={<DrawnOutside view={view} reduced={reduced} />}>
          <CraftModel view={outsideView} reduced={reduced} />
          {movePatch && <TopPatches />}
        </Suspense>
      </ModelBoundary>
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
        <SafeBayModel
          id="model.env-support-stand"
          position={[0, 0.5, 0]}
          scale={0.625}
          fallback={
            <>
              {[-0.7, 0.7].map((x) => (
                <mesh key={x} position={[x, (STAND_Y + 0.5) / 2, 0]} material={DARK}>
                  <boxGeometry args={[0.12, STAND_Y - 0.5, 0.12]} />
                </mesh>
              ))}
            </>
          }
        />
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
      <group position={[3.55, 3.25, -3.0]} rotation-y={-0.3}>
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
    // Fit a 13.4 x 6.7 unit window (wing tip to board edge, floor to antenna) at any pane shape
    const aspect = size.width / Math.max(1, size.height)
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 40
    const span = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const back = Math.max(6.7 / span, 13.4 / (span * aspect))
    cam.position.set(0.2, 3.3, back)
    cam.lookAt(0.2, 2.35, 0)
    cam.updateProjectionMatrix()
  }, [camera, size])
  return null
}

export function AssemblyBay({ view }: { view: BayView }) {
  const reduced = useMemo(() => prefersReducedMotion(), [])
  useEffect(() => preloadPartModels(), [])
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 40, position: [0.5, 3.3, 9], near: 0.1, far: 100 }}
      gl={{ antialias: true }}
      onCreated={({ scene, gl }) => {
        scene.background = new THREE.Color('#03050a')
        scene.fog = new THREE.Fog('#03050a', 15, 36)
        // A soft studio reflection so the model's metal and gold read as metal
        const pmrem = new THREE.PMREMGenerator(gl)
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        scene.environmentIntensity = 0.35
        pmrem.dispose()
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
