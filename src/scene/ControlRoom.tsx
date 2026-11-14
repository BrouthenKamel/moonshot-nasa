import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../state/gameStore'
import { buildPlanningView, type PlanningView } from '../viz/planning/planningView'
import { paintScreen, SCREEN_W, SCREEN_H, type ScreenAnim } from '../viz/planning/screenPainter'
import { paintConsole, CONSOLE, STEP_LAMPS } from '../viz/planning/consolePainter'
import {
  KNOB_VALUES,
  FADER_VALUES,
  knobAngle,
  knobValueFromPoint,
  faderX,
  faderValueFromX,
  stepValue,
} from '../viz/planning/controlMath'

/**
 * Step 1 as a mission control room (the Comms Center): the player sits at the
 * back console, turns the test-time knob and slides the reserve fader, and the
 * big screen shows the budget tank, the road to launch and the flight risk.
 * Every number comes from computeBudgets / goNoGo through the store.
 */

export type ControlFocus = 'test' | 'reserve' | null

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

/** Live view of the planning numbers, recomputed when the design or difficulty changes. */
function usePlanningView(): PlanningView {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  return useMemo(
    () => buildPlanningView(design, getBudgets(), getGoNoGo().checks),
    // getBudgets / getGoNoGo read design and difficulty from the store
    [design, difficulty, getBudgets, getGoNoGo]
  )
}

function setPlanning(patch: { testTurns?: number; reservePercent?: number }) {
  const { design, updateDesign } = useGameStore.getState()
  const next = { ...design.planning, ...patch }
  if (next.testTurns === design.planning.testTurns && next.reservePercent === design.planning.reservePercent) return
  updateDesign({ planning: next })
}

/* ---------------- scenery ---------------- */

function monitorMaterial(kind: number) {
  const { ctx, texture } = makeCanvasTexture(256, 148)
  ctx.fillStyle = '#04101f'
  ctx.fillRect(0, 0, 256, 148)
  const col = ['#38bdf8', '#4ade80', '#fbbf24', '#a78bfa'][kind % 4]
  ctx.strokeStyle = col
  ctx.fillStyle = col
  ctx.lineWidth = 2
  // Deterministic pseudo-random so the room looks the same every time
  let seed = kind * 9301 + 49297
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  if (kind % 5 === 0) {
    ctx.beginPath()
    for (let x = 8; x < 248; x += 8) ctx.lineTo(x, 74 + Math.sin(x / 18 + kind) * 34 + rnd() * 10)
    ctx.stroke()
  } else if (kind % 5 === 1) {
    for (let i = 0; i < 12; i++) ctx.fillRect(12 + i * 20, 130 - rnd() * 100, 12, 200)
  } else if (kind % 5 === 2) {
    for (let i = 0; i < 9; i++) ctx.fillRect(12, 12 + i * 14, 40 + rnd() * 180, 5)
  } else if (kind % 5 === 3) {
    ctx.beginPath(); ctx.ellipse(128, 74, 96, 44, 0.3, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(128, 74, 14, 0, Math.PI * 2); ctx.fill()
  } else {
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 4; j++) {
        ctx.globalAlpha = 0.25 + rnd() * 0.75
        ctx.fillRect(14 + i * 39, 12 + j * 32, 30, 22)
      }
    ctx.globalAlpha = 1
  }
  texture.needsUpdate = true
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: 0xb9c4d6 })
}

const ROW_FRONT = [-10.2, -6.8, -3.4, 0, 3.4, 6.8, 10.2]
const ROW_BACK = [-8.5, -5.1, -1.7, 1.7, 5.1, 8.5]

function OperatorRows() {
  const m = useMemo(() => {
    const desk = new THREE.MeshStandardMaterial({ color: 0x1c2638, roughness: 0.5, metalness: 0.4 })
    const bezel = new THREE.MeshStandardMaterial({ color: 0x05080f })
    const body = new THREE.MeshStandardMaterial({ color: 0x0d1526, roughness: 0.9 })
    const monitors = Array.from({ length: 10 }, (_, i) => monitorMaterial(i))
    return { desk, bezel, body, monitors }
  }, [])
  const g = useMemo(
    () => ({
      top: new THREE.BoxGeometry(2.7, 0.08, 0.9),
      front: new THREE.BoxGeometry(2.7, 0.85, 0.06),
      bezel: new THREE.BoxGeometry(1.0, 0.6, 0.05),
      screen: new THREE.PlaneGeometry(0.9, 0.52),
      torso: new THREE.BoxGeometry(0.52, 0.66, 0.28),
      head: new THREE.SphereGeometry(0.15, 14, 14),
      chair: new THREE.BoxGeometry(0.6, 0.8, 0.08),
    }),
    []
  )
  const desks = [...ROW_FRONT.map((x) => ({ x, z: -5.4, fy: 0 })), ...ROW_BACK.map((x) => ({ x, z: -1.7, fy: 0.6 }))]
  return (
    <group>
      {desks.map(({ x, z, fy }, i) => {
        const lean = ((i * 37) % 10) / 20 - 0.25
        return (
          <group key={i}>
            <mesh geometry={g.top} material={m.desk} position={[x, fy + 0.85, z]} />
            <mesh geometry={g.front} material={m.desk} position={[x, fy + 0.425, z - 0.42]} />
            {[-0.6, 0.6].map((dx, j) => (
              <group key={j}>
                <mesh geometry={g.bezel} material={m.bezel} position={[x + dx, fy + 1.22, z - 0.26]} />
                <mesh geometry={g.screen} material={m.monitors[(i * 2 + j) % m.monitors.length]} position={[x + dx, fy + 1.22, z - 0.23]} />
              </group>
            ))}
            <mesh geometry={g.torso} material={m.body} position={[x + lean, fy + 0.98, z + 0.78]} />
            <mesh geometry={g.head} material={m.body} position={[x + lean, fy + 1.48, z + 0.76]} />
            <mesh geometry={g.chair} material={m.bezel} position={[x + lean, fy + 0.75, z + 0.98]} />
          </group>
        )
      })}
    </group>
  )
}

function Room() {
  const floor = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x0b1322, roughness: 0.9 }), [])
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x0a1120, roughness: 1 }), [])
  const strip = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x1d4ed8, toneMapped: false }), [])
  const box = (args: [number, number, number], pos: [number, number, number], mat: THREE.Material, key: string) => (
    <mesh key={key} position={pos} material={mat}>
      <boxGeometry args={args} />
    </mesh>
  )
  return (
    <group>
      {box([34, 0.2, 6], [0, -0.1, -6.2], floor, 'tier0')}
      {box([34, 0.6, 3.8], [0, 0.3, -1.5], floor, 'tier1')}
      {box([34, 1.2, 8], [0, 0.6, 4.3], floor, 'tier2')}
      {box([34, 16, 0.3], [0, 7, -8.9], wall, 'front')}
      {box([0.3, 16, 22], [-15, 7, 0], wall, 'left')}
      {box([0.3, 16, 22], [15, 7, 0], wall, 'right')}
      {box([34, 0.3, 22], [0, 11.5, 0], wall, 'ceiling')}
      {box([34, 0.04, 0.05], [0, 0.6, -3.38], strip, 'strip1')}
      {box([34, 0.04, 0.05], [0, 1.2, 0.32], strip, 'strip2')}
    </group>
  )
}

/* ---------------- big screen + room mood ---------------- */

const ALERT_LEVEL = { nominal: 0, caution: 1, alert: 2 } as const

function BigScreen({ view, reduced }: { view: PlanningView; reduced: boolean }) {
  const screen = useMemo(() => makeCanvasTexture(SCREEN_W, SCREEN_H), [])
  const anim = useRef<ScreenAnim>({
    time: 0,
    test: view.testTurns,
    testing: view.testCost,
    reserve: view.reserve,
    build: view.buildTurns,
    risk: view.riskFactor,
    launchT: -1,
    reducedMotion: reduced,
  })
  const dirty = useRef(true)
  const ambient = useRef<THREE.AmbientLight>(null)
  const alertLight = useRef<THREE.PointLight>(null)
  const glows = useRef<(THREE.PointLight | null)[]>([])
  const halo = useRef<THREE.MeshBasicMaterial>(null)
  const beaconMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x3f0d0d, toneMapped: false }), [])
  const beacons = useRef<(THREE.Mesh | null)[]>([])
  const mood = useRef({ alert: 0, caution: 0 })
  const calm = useMemo(() => new THREE.Color(0x9fb4e0), [])
  const red = useMemo(() => new THREE.Color(0xff5a5a), [])
  const amber = useMemo(() => new THREE.Color(0xffc978), [])

  useEffect(() => {
    dirty.current = true
  }, [view])
  useEffect(() => () => screen.texture.dispose(), [screen])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const a = anim.current
    a.time = state.clock.elapsedTime
    a.reducedMotion = reduced
    const k = reduced ? 1 : Math.min(1, dt * 7)
    let moving = false
    const ease = (key: 'test' | 'testing' | 'reserve' | 'build' | 'risk', target: number) => {
      const d = target - a[key]
      if (Math.abs(d) < 0.001) a[key] = target
      else {
        a[key] += d * k
        moving = true
      }
    }
    ease('test', view.testTurns)
    ease('testing', view.testCost)
    ease('reserve', view.reserve)
    ease('build', view.buildTurns)
    ease('risk', view.riskFactor)

    const missed = view.marginMonths < 0
    if (missed && a.launchT < 0) a.launchT = 0
    if (!missed) a.launchT = -1
    if (a.launchT >= 0 && a.launchT < 6) {
      a.launchT += dt
      moving = true
    }
    const level = ALERT_LEVEL[view.status.level]
    const blinking = level === 2 && !reduced

    // Repaint only while something on the screen changes
    if (moving || blinking || dirty.current) {
      paintScreen(screen.ctx, view, a)
      screen.texture.needsUpdate = true
      dirty.current = false
    }

    // Room mood follows the status
    const m = mood.current
    const mk = reduced ? 1 : Math.min(1, dt * 4)
    m.alert += ((level === 2 ? 1 : 0) - m.alert) * mk
    m.caution += ((level === 1 ? 1 : 0) - m.caution) * mk
    const pulse = reduced ? 1 : 0.5 + 0.5 * Math.sin(a.time * 7)
    ambient.current?.color.copy(calm).lerp(amber, m.caution * 0.35).lerp(red, m.alert * (0.45 + 0.4 * pulse))
    if (alertLight.current) alertLight.current.intensity = m.alert * (120 + 260 * pulse)
    glows.current.forEach((l) => l && (l.intensity = 90 * (1 - 0.55 * m.alert)))
    beaconMat.color.setRGB(0.25 + 0.75 * m.alert * pulse, 0.05, 0.05)
    beacons.current.forEach((b) => b?.scale.setScalar(1 + 0.35 * m.alert * pulse))
    halo.current?.color.setRGB(0.11 + 0.6 * m.alert, 0.31 * (1 - m.alert), 0.85 * (1 - m.alert))
  })

  // Narrower than the wall so the taller screen (with its Go / No-Go strip) clears the rows in front
  const w = 20.5, h = (20.5 * SCREEN_H) / SCREEN_W
  return (
    <group>
      <ambientLight ref={ambient} intensity={0.8} color={0x9fb4e0} />
      {[-8, 0, 8].map((x, i) => (
        <pointLight key={x} ref={(l) => { glows.current[i] = l }} position={[x, 5.5, -5.5]} intensity={90} distance={30} color={0x4f8df7} />
      ))}
      <pointLight ref={alertLight} position={[0, 7.5, -1]} intensity={0} distance={40} color={0xff2a2a} />
      <mesh position={[0, 5.25, -8.7]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={screen.texture} toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, 5.25, -8.82]}>
        <boxGeometry args={[w + 0.5, h + 0.5, 0.1]} />
        <meshStandardMaterial color={0x05080f} />
      </mesh>
      <mesh position={[0, 5.25, -8.76]}>
        <planeGeometry args={[w + 3, h + 2.4]} />
        <meshBasicMaterial ref={halo} color={0x1d4ed8} transparent opacity={0.1} fog={false} />
      </mesh>
      {[-13.2, 13.2].map((x, i) => (
        <mesh key={x} ref={(b) => { beacons.current[i] = b }} position={[x, 9.6, -8.5]} material={beaconMat}>
          <sphereGeometry args={[0.28, 16, 16]} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- the player's console ---------------- */

const PANEL_POS = new THREE.Vector3(0, 2.05, 2.3)
const PANEL_TILT = 0.6

function Console({ view, focus, onDragChange }: { view: PlanningView; focus: ControlFocus; onDragChange: (dragging: boolean) => void }) {
  const panel = useRef<THREE.Group>(null)
  const knob = useRef<THREE.Group>(null)
  const faderCap = useRef<THREE.Group>(null)
  const focusRing = useRef<THREE.MeshBasicMaterial>(null)
  const focusBar = useRef<THREE.LineBasicMaterial>(null)
  const focusOutline = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.5, 0.62)), [])
  const drag = useRef<ControlFocus>(null)
  const { gl } = useThree()
  const surface = useMemo(() => makeCanvasTexture(CONSOLE.canvasW, CONSOLE.canvasH), [])

  useEffect(() => {
    paintConsole(surface.ctx, view)
    surface.texture.needsUpdate = true
  }, [view, surface])
  useEffect(() => () => surface.texture.dispose(), [surface])

  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.6, roughness: 0.35 }), [])
  const knobLeds = useMemo(() => KNOB_VALUES.map(() => new THREE.MeshBasicMaterial({ color: 0x1e1b4b, toneMapped: false })), [])
  const faderLeds = useMemo(() => FADER_VALUES.map(() => new THREE.MeshBasicMaterial({ color: 0x422006, toneMapped: false })), [])
  useEffect(() => {
    knobLeds.forEach((m, v) => m.color.setHex(v === view.testTurns ? 0xc4b5fd : v < view.testTurns ? 0x6d28d9 : 0x1e1b4b))
    faderLeds.forEach((m, i) =>
      m.color.setHex(view.reservePercent === 0 ? 0x7f1d1d : FADER_VALUES[i] <= view.reservePercent ? 0xfbbf24 : 0x422006)
    )
  }, [view, knobLeds, faderLeds])

  const reduced = useMemo(() => prefersReducedMotion(), [])
  useFrame((state, delta) => {
    const k = reduced ? 1 : Math.min(1, delta * 14)
    if (knob.current) knob.current.rotation.y += (knobAngle(view.testTurns) - knob.current.rotation.y) * k
    if (faderCap.current) {
      const x = faderX(view.reservePercent, CONSOLE.fader.x0, CONSOLE.fader.x1)
      faderCap.current.position.x += (x - faderCap.current.position.x) * Math.min(1, k * 1.3)
    }
    const glow = reduced ? 0.9 : 0.55 + 0.4 * Math.sin(state.clock.elapsedTime * 5)
    if (focusRing.current) focusRing.current.opacity = focus === 'test' ? glow : 0
    if (focusBar.current) focusBar.current.opacity = focus === 'reserve' ? glow : 0
  })

  // Pointer handling: map the pointer ray onto the panel's plane, in panel-local units
  const plane = useMemo(() => new THREE.Plane(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const localPoint = (e: ThreeEvent<PointerEvent | WheelEvent>) => {
    const p = panel.current
    if (!p) return null
    const n = new THREE.Vector3(0, 1, 0).transformDirection(p.matrixWorld)
    plane.setFromNormalAndCoplanarPoint(n, p.getWorldPosition(new THREE.Vector3()))
    if (!e.ray.intersectPlane(plane, hit)) return null
    return p.worldToLocal(hit.clone())
  }
  const drive = (ctrl: ControlFocus, e: ThreeEvent<PointerEvent>) => {
    const p = localPoint(e)
    if (!p) return
    if (ctrl === 'test') {
      const v = knobValueFromPoint(p.x - CONSOLE.knob.x, p.z - CONSOLE.knob.z)
      if (v !== null) setPlanning({ testTurns: v })
    } else if (ctrl === 'reserve') {
      setPlanning({ reservePercent: faderValueFromX(p.x, CONSOLE.fader.x0, CONSOLE.fader.x1) })
    }
  }
  const handlers = (ctrl: Exclude<ControlFocus, null>) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      drag.current = ctrl
      onDragChange(true)
      ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
      gl.domElement.style.cursor = 'grabbing'
      drive(ctrl, e)
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      if (drag.current === ctrl) drive(ctrl, e)
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (drag.current !== ctrl) return
      drag.current = null
      onDragChange(false)
      ;(e.target as Element | null)?.releasePointerCapture?.(e.pointerId)
      gl.domElement.style.cursor = 'grab'
    },
    onPointerOver: () => {
      if (!drag.current) gl.domElement.style.cursor = 'grab'
    },
    onPointerOut: () => {
      if (!drag.current) gl.domElement.style.cursor = 'default'
    },
    onWheel: (e: ThreeEvent<WheelEvent>) => {
      e.stopPropagation()
      const dir = e.deltaY < 0 ? 1 : -1
      if (ctrl === 'test') setPlanning({ testTurns: stepValue(KNOB_VALUES, view.testTurns, dir) })
      else setPlanning({ reservePercent: stepValue(FADER_VALUES, view.reservePercent, dir) })
    },
  })

  const { knob: K, fader: F } = CONSOLE
  const faderMid = (F.x0 + F.x1) / 2
  return (
    <group>
      <mesh position={[0, 1.45, 2.4]}>
        <boxGeometry args={[5.6, 0.5, 1.0]} />
        <meshStandardMaterial color={0x1c2638} roughness={0.5} metalness={0.4} />
      </mesh>
      <pointLight position={[0, 3.9, 3.4]} intensity={26} distance={6.5} color={0xfff1dc} />
      <group ref={panel} position={PANEL_POS} rotation={[PANEL_TILT, 0, 0]}>
        <mesh position={[0, -0.045, 0]} material={metal}>
          <boxGeometry args={[CONSOLE.width + 0.2, 0.08, CONSOLE.depth + 0.12]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
          <planeGeometry args={[CONSOLE.width, CONSOLE.depth]} />
          <meshStandardMaterial map={surface.texture} roughness={0.55} metalness={0.2} />
        </mesh>

        {/* Test time knob */}
        <group ref={knob} position={[K.x, 0, K.z]} rotation={[0, knobAngle(view.testTurns), 0]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.17, 0.2, 0.1, 40]} />
            <meshStandardMaterial color={0x64748b} metalness={0.75} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.02, 40]} />
            <meshStandardMaterial color={0x1e293b} metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.125, -0.08]}>
            <boxGeometry args={[0.04, 0.022, 0.13]} />
            <meshBasicMaterial color={0xc4b5fd} toneMapped={false} />
          </mesh>
        </group>
        {KNOB_VALUES.map((v, i) => {
          const a = knobAngle(v)
          return (
            <mesh key={v} position={[K.x - Math.sin(a) * 0.27, 0.02, K.z - Math.cos(a) * 0.27]} material={knobLeds[i]}>
              <sphereGeometry args={[0.028, 10, 10]} />
            </mesh>
          )
        })}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[K.x, 0.004, K.z]}>
          <ringGeometry args={[0.46, 0.5, 48]} />
          <meshBasicMaterial ref={focusRing} color={0xc4b5fd} transparent opacity={0} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[K.x, 0.05, K.z]} {...handlers('test')}>
          <circleGeometry args={[0.52, 24]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        {/* Reserve fader */}
        <mesh position={[faderMid, 0.011, F.z]}>
          <boxGeometry args={[F.x1 - F.x0 + 0.12, 0.02, 0.07]} />
          <meshStandardMaterial color={0x05080f} />
        </mesh>
        <group ref={faderCap} position={[faderX(view.reservePercent, F.x0, F.x1), 0, F.z]}>
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.14, 0.1, 0.28]} />
            <meshStandardMaterial color={0x94a3b8} metalness={0.75} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.051, 0]}>
            <boxGeometry args={[0.025, 0.104, 0.284]} />
            <meshBasicMaterial color={0xfbbf24} toneMapped={false} />
          </mesh>
        </group>
        {FADER_VALUES.map((v, i) => (
          <mesh key={v} position={[faderX(v, F.x0, F.x1), 0.02, F.z + 0.2]} material={faderLeds[i]}>
            <sphereGeometry args={[0.026, 10, 10]} />
          </mesh>
        ))}
        <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[faderMid, 0.006, F.z + 0.03]} geometry={focusOutline}>
          <lineBasicMaterial ref={focusBar} color={0xfbbf24} transparent opacity={0} toneMapped={false} />
        </lineSegments>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[faderMid, 0.05, F.z + 0.03]} {...handlers('reserve')}>
          <planeGeometry args={[1.5, 0.62]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        {/* Step lamps: decoration, lamp 1 lit */}
        {STEP_LAMPS.map((label, i) => (
          <mesh key={label} position={[CONSOLE.lampX0 + i * CONSOLE.lampStep, 0.02, CONSOLE.lampZ]}>
            <sphereGeometry args={[0.03, 10, 10]} />
            <meshBasicMaterial color={i === 0 ? 0x38bdf8 : 0x172033} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ---------------- camera ---------------- */

const CAM = new THREE.Vector3(0, 3.2, 5.0)
const TARGET = new THREE.Vector3(0, 2.0, -8.5)

function SeatCamera({ dragging, reduced }: { dragging: { current: boolean }; reduced: boolean }) {
  const { camera, size, pointer } = useThree()
  const sway = useRef({ x: 0, y: 0 })
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    // Fit the full width of the big screen and the console: wider fov for narrower windows
    const fov = aspect < 1.25 ? 80 : aspect < 1.5 ? 72 : 60
    if (cam.fov !== fov) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
    if (!dragging.current && !reduced) {
      sway.current.x += (pointer.x - sway.current.x) * 0.05
      sway.current.y += (-pointer.y - sway.current.y) * 0.05
    }
    const s = reduced ? { x: 0, y: 0 } : sway.current
    // Small sway for depth; kept small so the big screen stays fully in frame
    cam.position.set(CAM.x + s.x * 0.35, CAM.y - s.y * 0.1, CAM.z)
    cam.lookAt(TARGET.x + s.x * 0.5, TARGET.y, TARGET.z)
  })
  return null
}

/* ---------------- the room ---------------- */

export function ControlRoom({ focus }: { focus: ControlFocus }) {
  const view = usePlanningView()
  const dragging = useRef(false)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      camera={{ position: CAM.toArray(), fov: 60, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
      aria-hidden
    >
      <color attach="background" args={[0x03050a]} />
      <fog attach="fog" args={[0x03050a, 14, 46]} />
      <SeatCamera dragging={dragging} reduced={reduced} />
      <Room />
      <OperatorRows />
      <BigScreen view={view} reduced={reduced} />
      <Console view={view} focus={focus} onDragChange={(d) => (dragging.current = d)} />
    </Canvas>
  )
}

