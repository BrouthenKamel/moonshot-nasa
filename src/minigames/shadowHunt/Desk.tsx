import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { audio } from '../../assets/audio'
import { difficultyPresets, type Difficulty } from '../../data/brief'
import { RESERVE_COINS, RESERVE_STEP, reserveAmountM, spendableM } from './logic'
import { ICE, KAPTON } from './MoonTable'

const DESK_POSE = { pos: new THREE.Vector3(0, 7.4, 5.4), look: new THREE.Vector3(0, 0, 0.5) }

function DeskCamera() {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3(0, 0, 0))
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 2.4)
    camera.position.lerp(DESK_POSE.pos, k)
    look.current.lerp(DESK_POSE.look, k)
    camera.lookAt(look.current)
  })
  return null
}

function DeskTop() {
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 8, 4]} intensity={2.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#1a1f2b" roughness={0.9} />
      </mesh>
    </>
  )
}

/* -------------------------------- envelopes -------------------------------- */

const ENVELOPE_COLORS: Record<Difficulty, string> = { cadet: '#6faf7a', engineer: '#e8a33d', 'flight-director': '#d0533f' }
const ENVELOPES: Difficulty[] = ['cadet', 'engineer', 'flight-director']

interface EnvelopeProps {
  index: number
  id: Difficulty
  openable: boolean
  open: boolean
  onPick: (id: Difficulty) => void
}

function Envelope({ index, id, openable, open, onPick }: EnvelopeProps) {
  const root = useRef<THREE.Group>(null)
  const flap = useRef<THREE.Group>(null)
  const [hover, setHover] = useState(false)
  const shake = useRef(0)
  const start = useRef<number | null>(null)
  const x = (index - 1) * 2.7
  const preset = difficultyPresets[id]

  useFrame((s, dt) => {
    const g = root.current
    if (!g) return
    if (start.current === null) start.current = s.clock.elapsedTime
    // Reyes slides them across the desk one after another
    const t = Math.max(0, Math.min(1, (s.clock.elapsedTime - start.current - 0.5 - index * 0.28) / 0.7))
    const ease = 1 - Math.pow(1 - t, 3)
    shake.current = Math.max(0, shake.current - dt * 3)
    g.position.x = x + (1 - ease) * 9 + Math.sin(shake.current * 30) * 0.06 * shake.current
    const lift = open ? 0.35 : hover && openable ? 0.2 : 0
    g.position.y += (lift - g.position.y) * (1 - Math.exp(-dt * 10))
    if (flap.current) flap.current.rotation.x += ((open ? -Math.PI * 0.92 : 0) - flap.current.rotation.x) * (1 - Math.exp(-dt * 7))
  })

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (openable) onPick(id)
    else {
      shake.current = 1
      onPick(id)
    }
  }
  return (
    <group ref={root} position={[x + 9, 0, 0]}>
      <mesh
        position={[0, 0.04, 0]}
        onClick={click}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
      >
        <boxGeometry args={[2.1, 0.08, 1.4]} />
        <meshStandardMaterial color="#ede6d6" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.09, 0.05]}>
        <boxGeometry args={[1.5, 0.02, 0.5]} />
        <meshStandardMaterial color={ENVELOPE_COLORS[id]} roughness={0.8} />
      </mesh>
      <group ref={flap} position={[0, 0.08, -0.7]}>
        <mesh position={[0, 0.0, 0.35]} onClick={click}>
          <boxGeometry args={[2.1, 0.04, 0.7]} />
          <meshStandardMaterial color="#ddd5c4" roughness={0.9} />
        </mesh>
      </group>
      <Html center position={[0, 0.2, 0.15]} style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
        <div className="select-none text-center font-mono text-[12px] text-ink-0">
          <div className="font-bold">{preset.name}</div>
          {!openable && <div className="text-[10px] opacity-70">coming soon</div>}
        </div>
      </Html>
    </group>
  )
}

export function Envelopes({ opened, onPick }: { opened: Difficulty | null; onPick: (id: Difficulty) => void }) {
  return (
    <>
      <DeskCamera />
      <DeskTop />
      {ENVELOPES.map((id, i) => (
        <Envelope key={id} index={i} id={id} openable={id === 'engineer'} open={opened === id} onPick={onPick} />
      ))}
    </>
  )
}

/* ----------------------------------- jar ----------------------------------- */

const COIN_R = 0.2
const COIN_T = 0.07
const JAR = new THREE.Vector3(3.0, 0, 0.9)
const JAR_R = 1.0
const SHELF = new THREE.Vector3(-1.4, 0, -2.0)
const TRAY_COINS = 100 / RESERVE_STEP

/** Slot in the budget tray for coin number i (0..19); the last four are the reserve-able gold ones */
const traySlot = (i: number) => new THREE.Vector3(-4.5 + Math.floor(i / 2) * 0.46, COIN_T / 2, 1.5 + (i % 2) * 0.46)
const jarSlot = (n: number) => new THREE.Vector3(JAR.x + ((n % 2) - 0.5) * 0.08, COIN_T / 2 + 0.01 + n * (COIN_T + 0.012), JAR.z)

export interface JarState {
  /** Coin ids (0..3) in the order they went into the jar */
  inJar: number[]
}

interface CoinProps {
  id: number
  jarIndex: number
  dragging: boolean
  dragPos: MutableRefObject<THREE.Vector3>
  bounceAt: number
  onDown: (id: number) => void
}

function GoldCoin({ id, jarIndex, dragging, dragPos, bounceAt, onDown }: CoinProps) {
  const ref = useRef<THREE.Mesh>(null)
  const settled = useRef(true)
  const prevJar = useRef(jarIndex)
  const home = jarIndex >= 0 ? jarSlot(jarIndex) : traySlot(TRAY_COINS - RESERVE_COINS + id)
  const [hover, setHover] = useState(false)

  useEffect(() => {
    // dropped into the jar: start above it and fall
    if (prevJar.current < 0 && jarIndex >= 0 && ref.current) {
      ref.current.position.set(home.x, 1.4, home.z)
      settled.current = false
    }
    prevJar.current = jarIndex
  }, [jarIndex, home])

  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    const want = dragging ? new THREE.Vector3(dragPos.current.x, 0.5, dragPos.current.z) : home.clone()
    if (!dragging && bounceAt > 0 && performance.now() - bounceAt < 260) want.y += 0.5
    const k = 1 - Math.exp(-dt * (dragging ? 22 : 11))
    const before = m.position.y
    m.position.lerp(want, k)
    m.rotation.z += ((dragging ? 0.4 : 0) - m.rotation.z) * k
    if (!settled.current && !dragging && before > home.y + 0.06 && m.position.y <= home.y + 0.06) {
      settled.current = true
      audio.play('sfx.ih-coin-drop')
    }
    m.scale.setScalar(m.scale.x + ((hover || dragging ? 1.15 : 1) - m.scale.x) * k)
  })

  return (
    <mesh
      ref={ref}
      position={home}
      onPointerDown={(e) => {
        e.stopPropagation()
        onDown(id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
    >
      <cylinderGeometry args={[COIN_R, COIN_R, COIN_T, 28]} />
      <meshStandardMaterial color={KAPTON} metalness={0.85} roughness={0.28} emissive={KAPTON} emissiveIntensity={hover || dragging ? 0.5 : 0.18} />
    </mesh>
  )
}

interface JarProps {
  budgetCap: number
  inJar: number[]
  onJarChange: (next: number[]) => void
  onNote: (text: string) => void
}

export function JarScene({ budgetCap, inJar, onJarChange, onNote }: JarProps) {
  const [dragId, setDragId] = useState<number | null>(null)
  const [bounce, setBounce] = useState<{ id: number; at: number } | null>(null)
  const dragPos = useRef(new THREE.Vector3())
  const latest = useRef({ dragId, inJar })
  useEffect(() => {
    latest.current = { dragId, inJar }
  })
  const percent = inJar.length * RESERVE_STEP
  const lock = useRef<THREE.Group>(null)

  useEffect(() => {
    const up = () => {
      const { dragId: d, inJar: j } = latest.current
      if (d === null) return
      setDragId(null)
      document.body.style.cursor = ''
      const p = dragPos.current
      const nearJar = Math.hypot(p.x - JAR.x, p.z - JAR.z) < JAR_R + 0.5
      const nearShelf = Math.hypot(p.x - SHELF.x, p.z - SHELF.z) < 1.5
      const without = j.filter((c) => c !== d)
      if (nearJar) {
        if (!j.includes(d)) {
          onJarChange([...j, d])
          audio.play('sfx.ih-part-click')
        }
      } else if (nearShelf) {
        if (j.includes(d)) onJarChange(without)
        setBounce({ id: d, at: performance.now() })
        onNote('The reserve cannot buy parts. It only pays for fixes after launch.')
      } else if (j.includes(d)) onJarChange(without)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [onJarChange, onNote])

  useFrame((_, dt) => {
    const g = lock.current
    if (g) g.scale.setScalar(g.scale.x + ((inJar.length > 0 ? 1 : 0.001) - g.scale.x) * (1 - Math.exp(-dt * 9)))
  })

  const goldIds = useMemo(() => Array.from({ length: RESERVE_COINS }, (_, i) => i), [])
  const reserveM = reserveAmountM(budgetCap, percent)
  const lockedLabel = percent === 0 ? 'Reserve: nothing yet' : `Reserve ${percent}% · $${reserveM.toFixed(2)}M locked`

  return (
    <>
      <DeskCamera />
      <DeskTop />
      {/* drag plane for the pointer */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.3, 0]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => dragPos.current.copy(e.point)}
      >
        <planeGeometry args={[40, 30]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* the budget tray: every coin is 5% of the budget */}
      {Array.from({ length: TRAY_COINS - RESERVE_COINS }, (_, i) => (
        <mesh key={i} position={traySlot(i)}>
          <cylinderGeometry args={[COIN_R, COIN_R, COIN_T, 24]} />
          <meshStandardMaterial color="#b9b2a3" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {goldIds.map((id) => (
        <GoldCoin
          key={id}
          id={id}
          jarIndex={inJar.indexOf(id)}
          dragging={dragId === id}
          dragPos={dragPos}
          bounceAt={bounce?.id === id ? bounce.at : 0}
          onDown={(c) => {
            const e = latest.current
            if (e.dragId !== null) return
            setDragId(c)
            document.body.style.cursor = 'grabbing'
          }}
        />
      ))}
      <Html position={[-2.3, 0.05, 2.45]} center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
        <span className="whitespace-nowrap font-mono text-[12px] text-paper-dim">
          Parts budget ${spendableM(budgetCap, percent).toFixed(2)}M
        </span>
      </Html>

      {/* the parts shelf: reserve coins bounce off it */}
      <group position={SHELF}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[2.2, 0.4, 0.9]} />
          <meshStandardMaterial color="#2a3040" roughness={0.7} />
        </mesh>
        <mesh position={[-0.5, 0.65, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.75]} />
          <meshStandardMaterial color="#3a4254" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.4, 0.55, 0]}>
          <boxGeometry args={[0.7, 0.3, 0.5]} />
          <meshStandardMaterial color="#e8a33d" metalness={0.4} roughness={0.5} />
        </mesh>
        <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
          <span className="whitespace-nowrap font-mono text-[12px] text-paper-dim">Parts</span>
        </Html>
      </group>

      {/* the jar */}
      <group position={[JAR.x, 0, JAR.z]}>
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[JAR_R, JAR_R, 1.8, 40, 1, true]} />
          <meshPhysicalMaterial color="#9fe9f0" transparent opacity={0.16} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[JAR_R, JAR_R, 0.04, 40]} />
          <meshStandardMaterial color="#5ee6f0" transparent opacity={0.35} />
        </mesh>
        <mesh position={[0, 1.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[JAR_R, 0.04, 8, 48]} />
          <meshStandardMaterial color="#9fe9f0" metalness={0.6} roughness={0.2} />
        </mesh>
        <group ref={lock} position={[0, 1.0, JAR_R + 0.03]} scale={0.001}>
          <mesh position={[0, -0.08, 0]}>
            <boxGeometry args={[0.34, 0.26, 0.1]} />
            <meshStandardMaterial color={ICE} metalness={0.7} roughness={0.3} emissive={ICE} emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <torusGeometry args={[0.1, 0.03, 8, 20, Math.PI]} />
            <meshStandardMaterial color={ICE} metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
        <Html position={[0, 2.25, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
          <span className="whitespace-nowrap font-mono text-[12px] text-paper">{lockedLabel}</span>
        </Html>
      </group>
    </>
  )
}
