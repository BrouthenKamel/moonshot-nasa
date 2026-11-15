import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { Astronaut, type AstronautHandle } from '../../world/player/Astronaut'
import type { Role } from '../../viz/gonogo/stations'
import { CONSOLE_X, CONSOLE_Z, SPAWN, consoleAt, roomNavGrid } from './layout'
import { AUTO_SCRUB_AT_S, COUNT_FROM_S, type ConsoleState, type Countdown, type HoldEvent } from './logic'

const GO = '#6faf7a'
const CAUTION = '#d9b23f'
const NOGO = '#d0533f'
const IDLE = '#3a3f4a'
const KAPTON = '#e8a33d'
const TONE = { green: GO, yellow: CAUTION, red: NOGO } as const

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const PX = 160 // canvas pixels per scene unit
const MON_W = 1.68
const MON_H = 0.84

/** A canvas texture redrawn when `deps` change (words on screens, without DOM overlays) */
function useCanvasTexture(
  wUnits: number,
  hUnits: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[],
  px = PX,
): THREE.CanvasTexture {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = Math.round(wUnits * px * 2)
    c.height = Math.round(hUnits * px * 2)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return { canvas: c, texture: tex }
  }, [wUnits, hUnits, px])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    const g = canvas.getContext('2d')
    if (!g) return
    g.save()
    g.scale(2, 2)
    draw(g, canvas.width / 2, canvas.height / 2)
    g.restore()
    texture.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, texture, ...deps])
  return texture
}

/** Centered text wrapped to a width */
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > maxW && line) {
      g.fillText(line, x, y)
      y += lineH
      line = word
    } else line = next
  }
  if (line) g.fillText(line, x, y)
}

export interface SceneProps {
  consoles: ConsoleState[]
  /** Index of the console that has answered the poll so far (-1 none, 4 all) */
  answered: number
  /** The console the poll is asking right now */
  asking: Role | null
  countdown: Countdown
  hold: HoldEvent | null
  /** The hold still waits for the director's call */
  holdOpen: boolean
  walkTo: { x: number; z: number; n: number } | null
  controlsEnabled: boolean
  onNear: (role: Role | null) => void
  onConsoleClick: (role: Role) => void
  onFloorClick: (p: THREE.Vector3) => void
}

function Console({
  c,
  lit,
  asking,
  onClick,
}: {
  c: ConsoleState
  lit: boolean
  asking: boolean
  onClick: (role: Role) => void
}) {
  const color = lit ? TONE[c.status] : IDLE
  const beacon = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (!beacon.current) return
    // A red console blinks; the one being asked pulses
    const k = lit && c.status === 'red' ? 0.6 + 0.6 * Math.sin(clock.elapsedTime * 6) : asking ? 0.8 + 0.5 * Math.sin(clock.elapsedTime * 10) : lit ? 1 : 0.15
    beacon.current.emissiveIntensity = Math.max(0.05, k)
  })
  const worst = c.lines.find((l) => l.check.status !== 'green')
  const texture = useCanvasTexture(MON_W, MON_H, (g, w, h) => {
    g.fillStyle = '#070a0e'
    g.fillRect(0, 0, w, h)
    g.textAlign = 'center'
    g.fillStyle = '#8a909c'
    g.font = `600 30px ${MONO}`
    g.fillText(c.title.toUpperCase().split('').join(' '), w / 2, 58)
    g.fillStyle = color
    const call = lit ? c.call : asking ? '. . .' : 'STANDBY'
    g.font = `700 ${call.length > 12 ? 50 : 66}px ${MONO}`
    g.fillText(call, w / 2, 150)
    if (lit && worst) {
      g.font = `500 26px ${MONO}`
      wrap(g, worst.headline, w / 2, 205, w - 40, 32)
    }
  }, [c, lit, asking, color, worst], 320)
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onClick(c.role)
  }
  return (
    <group position={[CONSOLE_X[c.role], 0, CONSOLE_Z]} onClick={click}>
      {/* desk */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.84, 0.8]} />
        <meshStandardMaterial color="#2b2f38" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.86, 0.12]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[2.0, 0.04, 0.55]} />
        <meshStandardMaterial color="#1c1f26" roughness={0.5} />
      </mesh>
      {/* monitor, tilted toward the player; its words are drawn on the glass */}
      <group position={[0, 1.32, -0.2]} rotation={[-0.18, 0, 0]}>
        <mesh>
          <boxGeometry args={[1.76, 0.91, 0.05]} />
          <meshStandardMaterial color="#0d0f13" emissive={color} emissiveIntensity={lit ? 0.25 : 0.04} />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[MON_W, MON_H]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
      {/* status beacon */}
      <mesh position={[0.95, 1.85, -0.25]}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshStandardMaterial ref={beacon} color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      {/* floor mark where the director stands */}
      <mesh position={[0, 0.01, 1.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.4, 32]} />
        <meshBasicMaterial color={lit ? color : '#555'} transparent opacity={0.6} />
      </mesh>
    </group>
  )
}

const SCREEN_W = 7.6
const SCREEN_H = 3.4

/** Draw the front wall's picture: the count on the left, the wind or range gauge on the right */
function drawScreen(g: CanvasRenderingContext2D, w: number, h: number, countdown: Countdown, hold: HoldEvent | null, holdOpen: boolean) {
  g.fillStyle = '#05080c'
  g.fillRect(0, 0, w, h)
  const t = Math.ceil(countdown.t)
  const clock =
    countdown.phase === 'liftoff' ? 'LIFTOFF' : countdown.phase === 'scrubbed' ? 'SCRUB' : `T-${String(countdown.phase === 'counting' ? t : COUNT_FROM_S).padStart(2, '0')}`
  const tone = countdown.phase === 'liftoff' ? GO : countdown.phase === 'scrubbed' ? NOGO : countdown.phase === 'counting' ? KAPTON : '#a9b0bd'
  g.textBaseline = 'alphabetic'
  g.fillStyle = '#7d8592'
  g.font = `600 34px ${MONO}`
  g.fillText('LUNAR ICE MAPPER  ·  COUNT', 60, 110)
  g.fillStyle = tone
  g.font = `700 ${clock.length > 5 ? 190 : 250}px ${MONO}`
  g.fillText(clock, 52, 360)
  if (!hold) return
  const x = w * 0.6
  g.fillStyle = holdOpen ? CAUTION : '#7d8592'
  g.font = `600 34px ${MONO}`
  g.fillText(hold.kind === 'wind' ? 'PAD WIND' : 'RANGE SAFETY', x, 110)
  const bad = hold.kind === 'wind' ? hold.value > hold.limit : true
  g.fillStyle = bad ? NOGO : CAUTION
  g.font = `700 110px ${MONO}`
  g.fillText(hold.kind === 'wind' ? `${hold.value} kn` : `BOAT ${hold.value} km`, x, 230)
  g.fillStyle = '#a9b0bd'
  g.font = `500 32px ${MONO}`
  if (hold.kind === 'wind') {
    g.fillText(`gust limit ${hold.limit} kn`, x, 280)
    // the gauge: a bar to 40 kn with the limit marked
    const bw = w - x - 70
    g.strokeStyle = '#3a404b'
    g.lineWidth = 3
    g.strokeRect(x, 305, bw, 34)
    g.fillStyle = bad ? NOGO : CAUTION
    g.fillRect(x + 3, 308, Math.min(1, hold.value / 40) * (bw - 6), 28)
    g.fillStyle = '#f2efe6'
    g.fillRect(x + (hold.limit / 40) * bw - 2, 292, 5, 60)
  } else {
    g.fillText('inside the danger zone', x, 280)
  }
  g.fillStyle = CAUTION
  g.font = `500 30px ${MONO}`
  g.fillText(`press on: ${Math.round(hold.scrubChance * 100)}% chance of`, x, 400)
  g.fillText(`a scrub at T-${AUTO_SCRUB_AT_S}`, x, 440)
}

/** The front wall: countdown clock, and the wind or range gauge while a hold is on (drawn on a texture) */
function BigScreen({ countdown, hold, holdOpen }: { countdown: Countdown; hold: HoldEvent | null; holdOpen: boolean }) {
  const second = countdown.phase === 'counting' ? Math.ceil(countdown.t) : -1
  // redrawn on each new second and each phase change, not every frame
  const texture = useCanvasTexture(SCREEN_W, SCREEN_H, (g, w, h) => drawScreen(g, w, h, countdown, hold, holdOpen), [
    countdown.phase,
    second,
    hold,
    holdOpen,
  ])
  return (
    <group position={[0, 2.6, -3.9]}>
      <mesh position={[0, 0, -0.06]}>
        <boxGeometry args={[SCREEN_W + 0.2, SCREEN_H + 0.2, 0.08]} />
        <meshStandardMaterial color="#1a1e25" />
      </mesh>
      <mesh>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Room({ onFloorClick }: { onFloorClick: (p: THREE.Vector3) => void }) {
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0.5]}
        receiveShadow
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.stopPropagation()
          onFloorClick(e.point.clone())
        }}
      >
        <planeGeometry args={[15, 10]} />
        <meshStandardMaterial color="#1d2129" roughness={0.9} />
      </mesh>
      {/* raised floor tiles */}
      <gridHelper args={[15, 30, '#2a303b', '#252a33']} position={[0, 0.005, 0.5]} />
      {/* back wall and side walls (low, diorama style) */}
      <mesh position={[0, 2.5, -4.5]}>
        <boxGeometry args={[15, 5, 0.2]} />
        <meshStandardMaterial color="#14171d" />
      </mesh>
      <mesh position={[-7.5, 0.6, 0.5]}>
        <boxGeometry args={[0.2, 1.2, 10]} />
        <meshStandardMaterial color="#14171d" />
      </mesh>
      <mesh position={[7.5, 0.6, 0.5]}>
        <boxGeometry args={[0.2, 1.2, 10]} />
        <meshStandardMaterial color="#14171d" />
      </mesh>
    </>
  )
}

/** Reports which console the astronaut is standing at */
function Proximity({ astro, onNear }: { astro: React.RefObject<AstronautHandle | null>; onNear: (r: Role | null) => void }) {
  const last = useRef<Role | null>(null)
  useFrame(() => {
    const p = astro.current?.getPosition()
    if (!p) return
    const near = consoleAt(p.x, p.z)
    if (near !== last.current) {
      last.current = near
      onNear(near)
    }
  })
  return null
}

function SceneInner(props: SceneProps) {
  const grid = useMemo(() => roomNavGrid(), [])
  const astro = useRef<AstronautHandle>(null)
  const target = useMemo(
    () => (props.walkTo ? new THREE.Vector3(props.walkTo.x, 0, props.walkTo.z) : null),
    // a new Vector3 per request re-routes the astronaut
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.walkTo?.n],
  )
  return (
    <>
      <color attach="background" args={['#0a0c10']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 9, 6]} intensity={1.1} castShadow />
      <pointLight position={[0, 3, -3]} intensity={6} distance={9} color="#5ea4ff" />
      <Room onFloorClick={props.onFloorClick} />
      <BigScreen countdown={props.countdown} hold={props.hold} holdOpen={props.holdOpen} />
      {props.consoles.map((c, i) => (
        <Console key={c.role} c={c} lit={i <= props.answered} asking={props.asking === c.role} onClick={props.onConsoleClick} />
      ))}
      <Suspense fallback={null}>
        <Astronaut
          ref={astro}
          navGrid={grid}
          clickTarget={target}
          start={SPAWN}
          height={1.05}
          controlsEnabled={props.controlsEnabled}
        />
      </Suspense>
      <Proximity astro={astro} onNear={props.onNear} />
    </>
  )
}

export function MissionControlScene(props: SceneProps) {
  return (
    <Canvas shadows camera={{ position: [0, 8.2, 9.6], fov: 42, near: 0.1, far: 80 }} dpr={[1, 1.5]} onCreated={({ camera }) => camera.lookAt(0, 0.8, -1.2)}>
      <SceneInner {...props} />
    </Canvas>
  )
}
