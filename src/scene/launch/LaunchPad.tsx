import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useRideView, chooseRide, chooseTransfer } from '../../viz/ride/useRideView'
import type { DropKind, RideView } from '../../viz/ride/rideView'
import {
  CAPTURE,
  GROUND_Y,
  NOSE,
  ROCKET_X,
  SIGN_RECT,
  SKY_H,
  SKY_W,
  craftLeg,
  pointAlong,
  rideLeg,
  type Rect,
} from '../../viz/ride/skyPath'
import { paintSky, SKY_CANVAS_SCALE, type Hover } from '../../viz/ride/skyPainter'
import { paintBoard, rowRect, BOARD_W, BOARD_H } from '../../viz/ride/boardPainter'
import { paintTank, tankTargets, TANK_W, TANK_H } from '../../viz/ride/tankPainter'

/**
 * Step 5 as a launch pad at night (the Launch Site): the chosen rocket on the
 * pad, the departures board and the propellant tank in 3D, in front of a painted
 * sky with the path to the Moon. The player picks the ride on the board and the
 * transfer on the two signs in the sky. Every number comes from computeBudgets /
 * goNoGo through useRideView.
 *
 * Layout: at the neutral camera and a 16:9 canvas the scene matches the approved
 * mockup's 1600 × 900 "sky" space. A point (x, y) of that space at depth d is
 * placed with at(x, y, d), so the pad (depth 20) and the sky (depth 60) line up
 * and the camera's sway gives parallax between them.
 */

export type RideFocus = Hover

const FOV = 50
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180)
const BASE_ASPECT = SKY_W / SKY_H
const D_SKY = 60
const D_PAD = 20

/** The board and the tank in sky coordinates (canvas aspect ratios kept) */
const BOARD_RECT: Rect = { x: 920, y: 460, w: 660, h: (660 * BOARD_H) / BOARD_W }
const TANK_RECT: Rect = { x: 30, y: 310, w: 300, h: (300 * TANK_H) / TANK_W }

/** World units per sky unit at a depth */
const unit = (depth: number) => (2 * depth * TAN) / SKY_H
/** World position of a sky point at a depth, for the neutral camera at the origin */
const at = (x: number, y: number, depth: number): [number, number, number] => {
  const u = unit(depth)
  return [(x - SKY_W / 2) * u, (SKY_H / 2 - y) * u, -depth]
}
const centre = (r: Rect, depth: number) => at(r.x + r.w / 2, r.y + r.h / 2, depth)

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


/* ---------------- sky ---------------- */

function Sky({ view, hover }: { view: RideView; hover: Hover }) {
  const sky = useMemo(() => makeCanvasTexture(SKY_W * SKY_CANVAS_SCALE, SKY_H * SKY_CANVAS_SCALE), [])
  // A wide backdrop with the same horizon gradient, so the sway never shows an edge
  const backdrop = useMemo(() => {
    const t = makeCanvasTexture(4, 256)
    const g = t.ctx.createLinearGradient(0, 0, 0, 256)
    const h = GROUND_Y / SKY_H
    g.addColorStop(0, '#03050a')
    g.addColorStop(0.7 * h, '#071022')
    g.addColorStop(h, '#16233f')
    g.addColorStop(Math.min(1, h + 0.001), '#070b14')
    g.addColorStop(1, '#070b14')
    t.ctx.fillStyle = g
    t.ctx.fillRect(0, 0, 4, 256)
    t.texture.needsUpdate = true
    return t
  }, [])
  useEffect(() => {
    const { ctx } = sky
    ctx.setTransform(SKY_CANVAS_SCALE, 0, 0, SKY_CANVAS_SCALE, 0, 0)
    paintSky(ctx, view, hover)
    ctx.fillStyle = '#070b14'
    ctx.fillRect(0, GROUND_Y, SKY_W, SKY_H - GROUND_Y)
    sky.texture.needsUpdate = true
  }, [sky, view, hover])
  useEffect(
    () => () => {
      sky.texture.dispose()
      backdrop.texture.dispose()
    },
    [sky, backdrop]
  )
  const u = unit(D_SKY)
  const ub = unit(D_SKY + 1)
  return (
    <>
      <mesh position={at(SKY_W / 2, SKY_H / 2, D_SKY + 1)}>
        <planeGeometry args={[SKY_W * ub * 4, SKY_H * ub]} />
        <meshBasicMaterial map={backdrop.texture} toneMapped={false} />
      </mesh>
      <mesh position={at(SKY_W / 2, SKY_H / 2, D_SKY)}>
        <planeGeometry args={[SKY_W * u, SKY_H * u]} />
        <meshBasicMaterial map={sky.texture} toneMapped={false} />
      </mesh>
    </>
  )
}

/** The craft travelling along its path, and the pulsing capture marker */
function SkySprites({ view, reduced }: { view: RideView; reduced: boolean }) {
  const dot = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const route = useMemo(
    () => rideLeg(view.path.drop).concat(craftLeg(view.path.drop, view.path.transferType)),
    [view.path.drop, view.path.transferType]
  )
  const ok = view.reach === 'ok'
  const u = unit(D_SKY)
  const colour = useMemo(() => new THREE.Color(view.orbit.colour), [view.orbit.colour])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (dot.current) {
      dot.current.visible = ok && !reduced
      if (dot.current.visible) {
        const p = pointAlong(route, (t / 8) % 1)
        dot.current.position.set(...at(p.x, p.y, D_SKY - 0.2))
      }
    }
    if (ring.current) {
      ring.current.visible = ok
      const s = reduced ? 1 : 1 + 0.18 * Math.sin(t * 4)
      ring.current.scale.set(s, s, 1)
    }
  })
  return (
    <>
      <group ref={dot}>
        <mesh>
          <circleGeometry args={[6 * u, 20]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <circleGeometry args={[16 * u, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.18} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={ring} position={at(CAPTURE.x, CAPTURE.y, D_SKY - 0.2)}>
        <ringGeometry args={[11 * u, 15 * u, 32]} />
        <meshBasicMaterial color={colour} toneMapped={false} />
      </mesh>
    </>
  )
}

/* ---------------- pad ---------------- */

const WHITE = '#f1f5f9'
const DARK = '#0f172a'

function Cyl({ r, h, y, colour, x = 0, top }: { r: number; h: number; y: number; colour: string; x?: number; top?: number }) {
  return (
    <mesh position={[x, y, 0]}>
      <cylinderGeometry args={[top ?? r, r, h, 32]} />
      <meshStandardMaterial color={colour} roughness={0.45} metalness={0.15} />
    </mesh>
  )
}

/** Three rockets, clearly different in silhouette; sizes in sky units, y up from the pad */
function Rocket({ drop }: { drop: DropKind }) {
  const payloadY = GROUND_Y - NOSE[drop].y
  let parts: React.ReactNode
  let payloadZ: number
  if (drop === 'trans-lunar') {
    payloadZ = 14
    parts = (
      <>
        <Cyl r={28} h={270} y={135} colour="#ea580c" />
        <Cyl r={22} h={40} y={290} colour={WHITE} />
        <Cyl r={22} top={0.5} h={36} y={328} colour={WHITE} />
        {[-40, 40].map((x) => (
          <group key={x}>
            <Cyl x={x} r={9} h={210} y={105} colour={WHITE} />
            <Cyl x={x} r={9} top={0.5} h={30} y={225} colour={WHITE} />
          </group>
        ))}
      </>
    )
  } else if (drop === 'gto') {
    payloadZ = 11
    parts = (
      <>
        <Cyl r={17} h={220} y={110} colour={WHITE} />
        <Cyl r={17.6} h={8} y={150} colour={DARK} />
        <Cyl r={20} h={6} y={222} colour="#334155" />
        <Cyl r={20} top={0.5} h={48} y={249} colour={WHITE} />
      </>
    )
  } else {
    payloadZ = 20
    parts = (
      <>
        <Cyl r={22} h={225} y={112.5} colour={WHITE} />
        <Cyl r={22.6} h={60} y={90} colour={DARK} />
        <Cyl r={32} h={52} y={249} colour={WHITE} />
        <Cyl r={32} top={0.5} h={44} y={297} colour={WHITE} />
      </>
    )
  }
  return (
    <group>
      {parts}
      {/* The CubeSat in the nose: where the path starts */}
      <mesh position={[0, payloadY, payloadZ]}>
        <boxGeometry args={[10, 14, 4]} />
        <meshBasicMaterial color="#e0f2fe" toneMapped={false} />
      </mesh>
      <mesh position={[0, payloadY, payloadZ - 1]}>
        <circleGeometry args={[18, 24]} />
        <meshBasicMaterial color="#bfdbfe" transparent opacity={0.22} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Gantry({ beacon }: { beacon: React.RefObject<THREE.MeshBasicMaterial | null> }) {
  const bars = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number]; r?: number }[] = []
    for (const x of [62, 96]) for (const z of [-17, 17]) out.push({ p: [x, 167, z], s: [3, 335, 3] })
    for (let y = 0; y <= 335; y += 34) for (const z of [-17, 17]) out.push({ p: [79, y, z], s: [34, 3, 3] })
    for (let y = 17; y < 335; y += 34) out.push({ p: [79, y, 17], s: [48, 2.5, 2.5], r: Math.PI / 4 })
    return out
  }, [])
  return (
    <group>
      {bars.map((b, i) => (
        <mesh key={i} position={b.p} rotation={[0, 0, b.r ?? 0]}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color="#475569" roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[79, 342, 0]}>
        <sphereGeometry args={[6, 16, 12]} />
        <meshBasicMaterial ref={beacon} color="#7f1d1d" toneMapped={false} />
      </mesh>
    </group>
  )
}

const VAPOUR = [-60, -30, 0, 30, 60, 90].map((x, i) => ({ x, r: 26 + i * 3, phase: i * 1.3 }))

function Vapour({ reduced, puff }: { reduced: boolean; puff: React.RefObject<number> }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    if (puff.current > 0) puff.current = Math.max(0, puff.current - delta * 1.6)
    VAPOUR.forEach((v, i) => {
      const m = refs.current[i]
      if (!m) return
      const p = puff.current
      m.position.x = v.x + (reduced ? 0 : Math.sin(t * 0.6 + v.phase) * 8)
      const s = 1 + p * 1.6
      m.scale.set(s, s, s)
      ;(m.material as THREE.MeshBasicMaterial).opacity = 0.07 + 0.03 * (reduced ? 0 : Math.sin(t + v.phase)) + p * 0.35
    })
  })
  return (
    <>
      {VAPOUR.map((v, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} position={[v.x, 8, 30]}>
          <sphereGeometry args={[v.r, 16, 12]} />
          <meshBasicMaterial color="#cbd5e1" transparent opacity={0.08} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}

/** Light shafts from the two floodlight towers, aimed at the rocket */
function Floods({ colour }: { colour: THREE.Color }) {
  const shapes = useMemo(
    () =>
      [-210, 230].map((x0) => {
        const s = new THREE.Shape()
        s.moveTo(x0, 110)
        s.lineTo(-90, 435)
        s.lineTo(90, 435)
        s.closePath()
        return { x0, geo: new THREE.ShapeGeometry(s) }
      }),
    []
  )
  useEffect(() => () => shapes.forEach((s) => s.geo.dispose()), [shapes])
  return (
    <>
      {shapes.map(({ x0, geo }) => (
        <group key={x0}>
          <mesh position={[x0, 55, -30]}>
            <boxGeometry args={[5, 110, 5]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
          <mesh position={[x0, 112, -28]}>
            <boxGeometry args={[22, 10, 8]} />
            <meshBasicMaterial color={colour} toneMapped={false} />
          </mesh>
          <mesh geometry={geo} position={[0, 0, -40]}>
            <meshBasicMaterial
              color={colour}
              transparent
              opacity={0.1}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}

const FLOOD = { go: new THREE.Color('#dbeafe'), caution: new THREE.Color('#fcd34d'), nogo: new THREE.Color('#dbeafe') }

function Pad({ view, reduced }: { view: RideView; reduced: boolean }) {
  const u = unit(D_PAD)
  const beacon = useRef<THREE.MeshBasicMaterial>(null)
  const alarm = useRef<THREE.PointLight>(null)
  const puff = useRef(0)
  const drop = view.path.drop
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!reduced) puff.current = 1
  }, [drop, reduced])
  const nogo = view.status === 'nogo'
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const pulse = nogo ? (reduced ? 1 : 0.5 + 0.5 * Math.sin(t * 5)) : 0
    beacon.current?.color.set(nogo ? '#ef4444' : '#7f1d1d').multiplyScalar(nogo ? 0.6 + 0.6 * pulse : 1)
    if (alarm.current) alarm.current.intensity = nogo ? 0.4 + 1.4 * pulse : 0
  })
  const flood = FLOOD[view.status]
  const base = at(ROCKET_X, GROUND_Y, D_PAD)
  const groundY = base[1]
  return (
    <>
      {/* Ground, from just in front of the camera to a little behind the pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.01, -(D_PAD + 4) / 2]}>
        <planeGeometry args={[400, D_PAD + 4]} />
        <meshStandardMaterial color="#070b14" roughness={1} />
      </mesh>
      <group position={base} scale={u}>
        <mesh position={[0, -6, 0]}>
          <boxGeometry args={[320, 12, 140]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
        <Rocket drop={drop} />
        <Gantry beacon={beacon} />
        <Vapour reduced={reduced} puff={puff} />
        <Floods colour={flood} />
        <pointLight ref={alarm} position={[79, 360, 40]} color="#ff3b3b" intensity={0} distance={0} decay={0} />
        <spotLight
          position={[-210, 130, 120]}
          target-position={[base[0], base[1] + 4, base[2]]}
          color={flood}
          intensity={1.4}
          angle={0.5}
          penumbra={0.6}
          decay={0}
        />
      </group>
    </>
  )
}

/* ---------------- board and tank ---------------- */

function HitPlane({ rect, depth, onClick, onOver, onOut }: { rect: Rect; depth: number; onClick: () => void; onOver: () => void; onOut: () => void }) {
  const u = unit(depth)
  return (
    <mesh
      position={centre(rect, depth)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onOver()
      }}
      onPointerOut={onOut}
    >
      <planeGeometry args={[rect.w * u, rect.h * u]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

function Board({ view, hover, setHover }: { view: RideView; hover: Hover; setHover: (h: Hover) => void }) {
  const board = useMemo(() => makeCanvasTexture(BOARD_W, BOARD_H), [])
  const { gl } = useThree()
  useEffect(() => {
    paintBoard(board.ctx, view, hover)
    board.texture.needsUpdate = true
  }, [board, view, hover])
  useEffect(() => () => board.texture.dispose(), [board])
  const u = unit(D_PAD)
  const k = BOARD_RECT.w / BOARD_W
  const bottom = BOARD_RECT.y + BOARD_RECT.h
  return (
    <>
      <mesh position={centre(BOARD_RECT, D_PAD)}>
        <planeGeometry args={[BOARD_RECT.w * u, BOARD_RECT.h * u]} />
        <meshBasicMaterial map={board.texture} toneMapped={false} />
      </mesh>
      {[BOARD_RECT.x + 60, BOARD_RECT.x + BOARD_RECT.w - 60].map((x) => (
        <mesh key={x} position={at(x, (bottom + GROUND_Y) / 2, D_PAD + 0.05)}>
          <boxGeometry args={[10 * u, (GROUND_Y - bottom) * u, 10 * u]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}
      {view.rows.map((r, i) => {
        const rr = rowRect(i)
        const rect = { x: BOARD_RECT.x + rr.x * k, y: BOARD_RECT.y + rr.y * k, w: rr.w * k, h: rr.h * k }
        return (
          <HitPlane
            key={r.id}
            rect={rect}
            depth={D_PAD - 0.05}
            onClick={() => chooseRide(r.id)}
            onOver={() => {
              gl.domElement.style.cursor = 'pointer'
              setHover({ kind: 'ride', id: r.id })
            }}
            onOut={() => {
              gl.domElement.style.cursor = 'default'
              setHover(null)
            }}
          />
        )
      })}
    </>
  )
}

function Signs({ view, setHover }: { view: RideView; setHover: (h: Hover) => void }) {
  const { gl } = useThree()
  return (
    <>
      {view.signs.map((s) => (
        <HitPlane
          key={s.id}
          rect={SIGN_RECT[s.type]}
          depth={D_SKY - 0.3}
          onClick={() => chooseTransfer(s.id)}
          onOver={() => {
            gl.domElement.style.cursor = s.selectable ? 'pointer' : 'not-allowed'
            setHover({ kind: 'transfer', id: s.id })
          }}
          onOut={() => {
            gl.domElement.style.cursor = 'default'
            setHover(null)
          }}
        />
      ))}
    </>
  )
}

function Tank({ view, reduced }: { view: RideView; reduced: boolean }) {
  const tank = useMemo(() => makeCanvasTexture(TANK_W, TANK_H), [])
  const levels = useRef<number[]>([])
  const dirty = useRef(true)
  useEffect(() => {
    dirty.current = true
  }, [view])
  useEffect(() => () => tank.texture.dispose(), [tank])
  useFrame((_, delta) => {
    const target = tankTargets(view)
    if (levels.current.length !== target.length) levels.current = target.map(() => 0)
    const k = reduced ? 1 : Math.min(1, delta * 6)
    let moving = false
    levels.current = levels.current.map((l, i) => {
      const d = target[i] - l
      if (Math.abs(d) < 0.001) return target[i]
      moving = true
      return l + d * k
    })
    if (moving || dirty.current) {
      paintTank(tank.ctx, view, levels.current)
      tank.texture.needsUpdate = true
      dirty.current = false
    }
  })
  const u = unit(D_PAD)
  return (
    <mesh position={centre(TANK_RECT, D_PAD)}>
      <planeGeometry args={[TANK_RECT.w * u, TANK_RECT.h * u]} />
      <meshBasicMaterial map={tank.texture} transparent toneMapped={false} />
    </mesh>
  )
}

/* ---------------- camera ---------------- */

function PadCamera({ reduced }: { reduced: boolean }) {
  const { camera, size, pointer } = useThree()
  const sway = useRef({ x: 0, y: 0 })
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    // Narrower than 16:9: widen the view so the board and the tank stay in frame
    const tanV = aspect < BASE_ASPECT ? (TAN * BASE_ASPECT) / aspect : TAN
    const fov = (2 * Math.atan(tanV) * 180) / Math.PI
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    if (!reduced) {
      sway.current.x += (pointer.x - sway.current.x) * 0.04
      sway.current.y += (pointer.y - sway.current.y) * 0.04
    }
    const s = reduced ? { x: 0, y: 0 } : sway.current
    cam.position.set(s.x * 0.45, s.y * 0.2, 0)
    cam.lookAt(s.x * 0.45, s.y * 0.2, -D_SKY)
  })
  return null
}

/* ---------------- the scene ---------------- */

export function LaunchPad({ focus }: { focus: RideFocus }) {
  const view = useRideView()
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const [pointerHover, setPointerHover] = useState<Hover>(null)
  const hover = pointerHover ?? focus
  // Keep the hover object stable so the canvases do not repaint on every render
  const hoverKind = hover?.kind
  const hoverId = hover?.id
  const stableHover = useMemo<Hover>(() => (hoverKind && hoverId ? { kind: hoverKind, id: hoverId } : null), [hoverKind, hoverId])

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 0], fov: FOV, near: 0.1, far: 200 }}
      gl={{ antialias: true }}
      aria-hidden
    >
      <color attach="background" args={[0x03050a]} />
      <ambientLight intensity={0.55} color="#9fb4e0" />
      <directionalLight position={[20, 30, 10]} intensity={0.9} color="#c7d2fe" />
      <PadCamera reduced={reduced} />
      <Sky view={view} hover={stableHover} />
      <SkySprites view={view} reduced={reduced} />
      <Signs view={view} setHover={setPointerHover} />
      <Pad view={view} reduced={reduced} />
      <Tank view={view} reduced={reduced} />
      <Board view={view} hover={stableHover} setHover={setPointerHover} />
    </Canvas>
  )
}
