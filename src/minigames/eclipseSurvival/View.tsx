import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { audio } from '../../assets/audio'
import { sayRoom } from '../../assets/ihVoice'
import { CubeSat } from '../../scene/space'
import type { MinigameProps } from '../contract'
import {
  LATENT_BUGS,
  buildModel,
  hoursForSeconds,
  initialState,
  phaseAt,
  shortfall,
  socPct,
  stepEnergy,
  testOutcome,
  type EnergyModel,
  type EnergyState,
  type TestOutcome,
} from './logic'
import { turnConstants } from '../../data/brief'

type Phase = 'run' | 'dead' | 'test'

const WARMUP_S = 2.2
const HINT_IDLE_S = 20

class Boundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

interface Live {
  state: EnergyState
  on: Record<string, boolean>
  /** Seconds of play since the run started (warm-up included) */
  t: number
  /** 0..1 how lit the sun lamps are */
  lamp: number
  /** Battery capacity Wh */
  cap: number
}

const socColor = (pct: number, floor: number) =>
  pct <= floor + 5 ? new THREE.Color('#ff3b2f') : pct < 50 ? new THREE.Color('#ffb02e') : new THREE.Color('#3dff9a')

function Chamber({ lamp }: { lamp: React.RefObject<number> }) {
  const bank = useRef<THREE.MeshStandardMaterial>(null)
  const sun = useRef<THREE.SpotLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  useFrame(() => {
    const l = lamp.current
    if (bank.current) bank.current.emissiveIntensity = 0.05 + l * 6
    if (sun.current) sun.current.intensity = l * 900
    if (ambient.current) ambient.current.intensity = 0.25 + l * 0.2
  })
  const ribs = useMemo(() => [-8, -5.5, -3, -0.5, 2, 4.5], [])
  return (
    <group>
      <ambientLight ref={ambient} color="#7a95b8" intensity={0.3} />
      <hemisphereLight args={['#5b7597', '#1a1d22', 0.6]} />
      <pointLight position={[0, 2.5, 4]} intensity={30} color="#9ab4d8" />
      <spotLight ref={sun} position={[0, 0.6, -8.4]} angle={0.7} penumbra={0.6} color="#ffe3b0" intensity={0} target-position={[0, 0, 0]} />
      {/* steel barrel, axis along z */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -3]}>
        <cylinderGeometry args={[4.6, 4.6, 14, 64, 1, true]} />
        <meshStandardMaterial color="#8d97a3" metalness={0.85} roughness={0.42} side={THREE.BackSide} />
      </mesh>
      {ribs.map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <torusGeometry args={[4.55, 0.1, 10, 72]} />
          <meshStandardMaterial color="#5d6772" metalness={0.9} roughness={0.35} />
        </mesh>
      ))}
      {/* back wall + lamp bank */}
      <mesh position={[0, 0, -10]}>
        <circleGeometry args={[4.7, 48]} />
        <meshStandardMaterial color="#2a2f36" metalness={0.7} roughness={0.6} />
      </mesh>
      {[-2.4, -0.8, 0.8, 2.4].map((x) =>
        [1.5, -0.3, -2.1].map((y) => (
          <mesh key={`${x}${y}`} position={[x, y + 0.4, -9.9]}>
            <boxGeometry args={[1.3, 1.4, 0.1]} />
            <meshStandardMaterial
              ref={x === -2.4 && y === 1.5 ? bank : undefined}
              color="#201a10"
              emissive="#ffd48a"
              emissiveIntensity={0.05}
              toneMapped={false}
            />
          </mesh>
        ))
      )}
      {/* viewport on the right wall */}
      <group position={[-4.3, 1.6, -1.5]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <torusGeometry args={[0.8, 0.12, 14, 40]} />
          <meshStandardMaterial color="#b9a36a" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, -0.02]}>
          <circleGeometry args={[0.8, 40]} />
          <meshStandardMaterial color="#0a1a2c" emissive="#12385e" emissiveIntensity={0.5} metalness={0.2} roughness={0.1} />
        </mesh>
      </group>
      {/* floor rail the rig sits on */}
      <mesh position={[0, -2.35, 0]}>
        <boxGeometry args={[5, 0.1, 5]} />
        <meshStandardMaterial color="#444c56" metalness={0.8} roughness={0.5} />
      </mesh>
    </group>
  )
}

function BatteryCell({ live, floor, dark }: { live: React.RefObject<Live>; floor: number; dark: boolean }) {
  const fill = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const H = 2.4
  useFrame((st) => {
    const m = live.current.state
    const pct = Math.max(0.001, (m.energyWh / live.current.cap) * 100)
    if (fill.current) {
      fill.current.scale.y = Math.max(0.01, pct / 100)
      fill.current.position.y = -H / 2 + (H * Math.max(0.01, pct / 100)) / 2
    }
    const c = socColor(pct, floor)
    const pulse = dark ? 0 : 0.85 + 0.15 * Math.sin(st.clock.elapsedTime * 3)
    if (mat.current) {
      mat.current.emissive.copy(c)
      mat.current.emissiveIntensity = 2.4 * pulse
    }
    if (light.current) {
      light.current.color.copy(c)
      light.current.intensity = 14 * pulse
    }
  })
  return (
    <group position={[2.6, -1.1, 1.4]}>
      <mesh position={[0, -H / 2 - 0.1, 0]}>
        <cylinderGeometry args={[0.85, 0.95, 0.2, 32]} />
        <meshStandardMaterial color="#2c3138" metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh ref={fill}>
        <cylinderGeometry args={[0.62, 0.62, H, 32]} />
        <meshStandardMaterial ref={mat} color="#0b2a1a" emissive="#3dff9a" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.7, 0.7, H + 0.05, 32, 1, true]} />
        <meshPhysicalMaterial color="#bcd8ff" transparent opacity={0.16} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, H / 2 + 0.12, 0]}>
        <cylinderGeometry args={[0.45, 0.7, 0.24, 32]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, H / 2 + 0.34, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.2, 16]} />
        <meshStandardMaterial color="#d9b25a" metalness={1} roughness={0.25} />
      </mesh>
      {/* the floor: below this line the craft browns out */}
      <mesh position={[0, -H / 2 + (H * floor) / 100, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.73, 0.025, 8, 48]} />
        <meshBasicMaterial color="#ff4a3d" toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[-0.6, 0, 1]} distance={7} intensity={12} />
    </group>
  )
}

function Switch({
  index,
  label,
  watts,
  on,
  onToggle,
  dim,
}: {
  index: number
  label: string
  watts: number
  on: boolean
  onToggle: () => void
  dim: boolean
}) {
  const lever = useRef<THREE.Group>(null)
  const [hover, setHover] = useState(false)
  useFrame(() => {
    if (!lever.current) return
    const target = on ? -0.55 : 0.55
    lever.current.rotation.x += (target - lever.current.rotation.x) * 0.3
  })
  return (
    <group
      position={[0, 1 - index * 1.15, 0]}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onPointerOver={() => {
        setHover(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
    >
      <mesh>
        <boxGeometry args={[1.5, 0.95, 0.18]} />
        <meshStandardMaterial color={hover ? '#4a525c' : '#383e46'} metalness={0.7} roughness={0.5} />
      </mesh>
      <group ref={lever} position={[0.35, 0, 0.12]}>
        <mesh position={[0, 0, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.5, 12]} />
          <meshStandardMaterial color="#c8ccd2" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0, 0.5]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#d34b3b" roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[-0.5, 0.2, 0.1]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial
          color={on ? '#6dff9e' : '#2a2a2a'}
          emissive={on ? '#3dff7a' : '#000'}
          emissiveIntensity={on && !dim ? 2.2 : 0}
          toneMapped={false}
        />
      </mesh>
      <Html position={[-0.05, -0.34, 0.14]} center distanceFactor={7} pointerEvents="none" zIndexRange={[5, 0]}>
        <div className="whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-paper">
          {label} · {watts} W
        </div>
      </Html>
    </group>
  )
}

function Rig({ design, powered, shake }: { design: MinigameProps['design']; powered: boolean; shake: React.RefObject<number> }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((st, dt) => {
    if (!ref.current) return
    ref.current.rotation.y += dt * 0.25
    const s = shake.current
    ref.current.position.x = s > 0 ? Math.sin(st.clock.elapsedTime * 60) * 0.04 * s : 0
    shake.current = Math.max(0, s - dt * 2.5)
  })
  return (
    <group>
      <mesh position={[0, -1.7, 0]}>
        <cylinderGeometry args={[0.35, 0.8, 1.3, 24]} />
        <meshStandardMaterial color="#555d68" metalness={0.8} roughness={0.4} />
      </mesh>
      <group ref={ref} position={[0, 0.2, 0]} rotation={[0.3, 0, 0.2]}>
        <Boundary
          fallback={
            <mesh>
              <boxGeometry args={[0.8, 1.2, 0.8]} />
              <meshStandardMaterial color="#aab" />
            </mesh>
          }
        >
          <Suspense fallback={null}>
            <group scale={powered ? 1 : 1}>
              <CubeSat design={design} deploy={1} scale={4.2} />
            </group>
          </Suspense>
        </Boundary>
      </group>
    </group>
  )
}

/** Wall clock: the hand points to the month the craft is ready, the red tick is the month the ride leaves. */
function WallClock({ outcome }: { outcome: TestOutcome }) {
  const hand = useRef<THREE.Group>(null)
  const target = (outcome.readyMonths / 12) * Math.PI * 2
  useFrame(() => {
    if (!hand.current) return
    const cur = -hand.current.rotation.z
    hand.current.rotation.z = -(cur + (target - cur) * 0.2)
  })
  const late = outcome.marginMonths < 0
  return (
    <group position={[-2.6, 2.2, -2.4]} rotation={[0, 0.5, 0]}>
      <mesh>
        <cylinderGeometry args={[1.1, 1.1, 0.12, 40]} />
        <meshStandardMaterial color="#e9e4d6" roughness={0.6} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.1, 0.07, 10, 48]} />
        <meshStandardMaterial color="#2a2f36" metalness={0.8} roughness={0.4} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.sin(a) * 0.9, Math.cos(a) * 0.9, 0.08]} rotation={[0, 0, -a]}>
            <boxGeometry args={[0.04, 0.14, 0.02]} />
            <meshBasicMaterial color="#222" />
          </mesh>
        )
      })}
      {(() => {
        const a = (outcome.rideMonths / 12) * Math.PI * 2
        return (
          <mesh position={[Math.sin(a) * 0.9, Math.cos(a) * 0.9, 0.1]} rotation={[0, 0, -a]}>
            <boxGeometry args={[0.09, 0.24, 0.02]} />
            <meshBasicMaterial color="#ff4a3d" toneMapped={false} />
          </mesh>
        )
      })()}
      <group ref={hand} position={[0, 0, 0.12]}>
        <mesh position={[0, 0.38, 0]}>
          <boxGeometry args={[0.07, 0.8, 0.03]} />
          <meshBasicMaterial color={late ? '#d6281c' : '#111'} />
        </mesh>
      </group>
      <Html position={[0, -1.45, 0.1]} center distanceFactor={9} pointerEvents="none">
        <div
          className="whitespace-nowrap rounded bg-black/60 px-2 py-1 text-xs font-semibold"
          style={{ color: late ? '#ff8a80' : '#e8e4d6' }}
        >
          Ready in month {outcome.readyMonths} · ride leaves month {outcome.rideMonths}
          {late ? ' · LATE' : ''}
        </div>
      </Html>
    </group>
  )
}

function BugJar({ found, success }: { found: number; success: number | null }) {
  return (
    <group position={[2.6, 1.9, 0.6]}>
      <mesh>
        <cylinderGeometry args={[0.8, 0.8, 1.5, 24, 1, true]} />
        <meshPhysicalMaterial color="#cfe6ff" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.76, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.06, 24]} />
        <meshStandardMaterial color="#555d68" metalness={0.8} roughness={0.4} />
      </mesh>
      {Array.from({ length: LATENT_BUGS }, (_, i) => {
        const a = i * 2.4
        const lit = i < found
        return (
          <mesh key={i} position={[Math.cos(a) * 0.42, -0.5 + (i % 5) * 0.28, Math.sin(a) * 0.42]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial
              color={lit ? '#7dff6a' : '#33402f'}
              emissive={lit ? '#58ff3d' : '#000'}
              emissiveIntensity={lit ? 2.5 : 0}
              toneMapped={false}
            />
          </mesh>
        )
      })}
      <Html position={[0, -1.15, 0.2]} center distanceFactor={9} pointerEvents="none">
        <div className="whitespace-nowrap rounded bg-black/60 px-2 py-1 text-xs font-semibold text-paper">
          {found} of {LATENT_BUGS} bugs found{success !== null ? ` · ${Math.round(success * 100)}% mission success` : ''}
        </div>
      </Html>
    </group>
  )
}

function PressButton({
  position,
  color,
  label,
  onPress,
  disabled,
  size = 0.5,
}: {
  position: [number, number, number]
  color: string
  label: string
  onPress: () => void
  disabled?: boolean
  size?: number
}) {
  const cap = useRef<THREE.Mesh>(null)
  const down = useRef(0)
  useFrame((_, dt) => {
    down.current = Math.max(0, down.current - dt * 6)
    if (cap.current) cap.current.position.y = 0.16 - down.current * 0.1
  })
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation()
        if (disabled) return
        down.current = 1
        onPress()
      }}
      onPointerOver={() => {
        if (!disabled) document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = ''
      }}
    >
      <mesh>
        <cylinderGeometry args={[size * 1.3, size * 1.4, 0.16, 28]} />
        <meshStandardMaterial color="#30353c" metalness={0.8} roughness={0.5} />
      </mesh>
      <mesh ref={cap} position={[0, 0.16, 0]}>
        <cylinderGeometry args={[size, size, 0.2, 28]} />
        <meshStandardMaterial color={disabled ? '#3a3f46' : color} emissive={disabled ? '#000' : color} emissiveIntensity={disabled ? 0 : 0.7} roughness={0.35} />
      </mesh>
      <Html position={[0, -size * 1.3 - 0.2, 0.2]} center distanceFactor={7} pointerEvents="none">
        <div className="whitespace-nowrap rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-paper">{label}</div>
      </Html>
    </group>
  )
}

interface SceneProps {
  design: MinigameProps['design']
  model: EnergyModel
  phase: Phase
  live: React.RefObject<Live>
  on: Record<string, boolean>
  toggle: (id: string) => void
  testTurns: number
  outcome: TestOutcome
  odds: number | null
  setTestTurns: (n: number) => void
  signOff: () => void
  shake: React.RefObject<number>
  onTick: (hud: Hud) => void
  onDead: () => void
  onPassed: () => void
}

export interface Hud {
  orbit: number
  eclipse: boolean
  pct: number
}

function Sim({ model, phase, live, onTick, onDead, onPassed, lamp }: Pick<SceneProps, 'model' | 'phase' | 'live' | 'onTick' | 'onDead' | 'onPassed'> & { lamp: React.RefObject<number> }) {
  const last = useRef(0)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.5)
    const lv = live.current
    if (phase === 'run') {
      lv.t += dt
      if (lv.t > WARMUP_S && !lv.state.dead && !lv.state.done) {
        const ph = phaseAt(model, lv.state.tH)
        lv.state = stepEnergy(model, lv.state, hoursForSeconds(ph.eclipse, dt), lv.on)
        if (lv.state.dead) onDead()
        else if (lv.state.done) onPassed()
      }
    }
    const ph = phaseAt(model, lv.state.tH)
    const target = phase === 'dead' ? 0 : phase === 'test' ? 1 : lv.t <= WARMUP_S ? 1 : ph.eclipse ? 0 : 1
    lamp.current += (target - lamp.current) * Math.min(1, dt * 5)
    lv.lamp = lamp.current
    last.current += dt
    if (last.current > 0.1) {
      last.current = 0
      onTick({ orbit: Math.min(model.orbits, ph.orbit + 1), eclipse: ph.eclipse && lv.t > WARMUP_S, pct: socPct(model, lv.state) })
    }
  })
  return null
}

function Scene(p: SceneProps) {
  const lamp = useRef(1)
  const dark = p.phase === 'dead'
  return (
    <>
      <color attach="background" args={['#05070a']} />
      <Chamber lamp={lamp} />
      <Sim {...p} lamp={lamp} />
      <Rig design={p.design} powered={!dark} shake={p.shake} />
      <BatteryCell live={p.live} floor={p.model.floorPct} dark={dark} />
      {p.phase !== 'test' && (
        <group position={[-2.6, -0.3, 1.5]} rotation={[0, 0.35, 0]}>
          {p.model.loads.map((l, i) => (
            <Switch
              key={l.id}
              index={i}
              label={l.label}
              watts={l.watts}
              on={!!p.on[l.id]}
              dim={dark}
              onToggle={() => p.toggle(l.id)}
            />
          ))}
        </group>
      )}
      {p.phase === 'test' && (
        <>
          <WallClock outcome={p.outcome} />
          <BugJar found={p.outcome.bugs} success={p.odds} />
          <group position={[-2.5, -1.2, 1.6]} rotation={[0, 0.35, 0]}>
            <PressButton
              position={[-0.7, 0, 0]}
              color="#c0c6cf"
              label="fewer"
              disabled={p.testTurns <= turnConstants.minTestTurns}
              onPress={() => p.setTestTurns(p.testTurns - 1)}
            />
            <PressButton
              position={[0.75, 0, 0]}
              color="#2fd16b"
              label="run a test campaign"
              disabled={p.testTurns >= turnConstants.maxTestTurns}
              onPress={() => p.setTestTurns(p.testTurns + 1)}
            />
            <PressButton position={[2.2, 0, 0]} color="#ffb02e" label="sign off" onPress={p.signOff} size={0.4} />
          </group>
        </>
      )}
    </>
  )
}

export default function EclipseSurvival({ design, difficulty, onComplete, onExit, replay }: MinigameProps) {
  const model = useMemo(() => buildModel(design, difficulty), [design, difficulty])
  const initialOn = useMemo(() => Object.fromEntries(model.loads.map((l) => [l.id, l.startsOn])), [model])
  const [on, setOn] = useState<Record<string, boolean>>(initialOn)
  const [phase, setPhase] = useState<Phase>('run')
  const [attempt, setAttempt] = useState(0)
  const [hud, setHud] = useState<Hud>({ orbit: 1, eclipse: false, pct: 100 })
  const [testTurns, setTestTurns] = useState(design.planning.testTurns)
  const [odds, setOdds] = useState<Record<number, number>>({})
  const [deadInfo, setDeadInfo] = useState<ReturnType<typeof shortfall> | null>(null)
  const startMs = useRef(Date.now())
  const minPct = useRef(100)
  const lastTouch = useRef(performance.now())
  const hinted = useRef(false)
  const shake = useRef(0)
  const live = useRef<Live>({
    state: initialState(model),
    on: initialOn,
    t: 0,
    lamp: 1,
    cap: model.capacityWh,
  })

  // Intro line on mount, hint after 20 s without a touch
  useEffect(() => {
    sayRoom('thermal-vac', 'intro')
    audio.play('sfx.ih-power-hum')
    const timer = window.setInterval(() => {
      if (!hinted.current && performance.now() - lastTouch.current > HINT_IDLE_S * 1000) {
        hinted.current = true
        sayRoom('thermal-vac', 'hint')
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const toggle = useCallback((id: string) => {
    lastTouch.current = performance.now()
    audio.play('sfx.ih-part-click')
    setOn((cur) => {
      const next = { ...cur, [id]: !cur[id] }
      live.current.on = next
      return next
    })
  }, [])

  // keys 1-4 toggle the switches
  useEffect(() => {
    if (phase !== 'run') return
    const h = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1
      if (i >= 0 && i < model.loads.length) toggle(model.loads[i].id)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [phase, model, toggle])

  const onTick = useCallback((h: Hud) => {
    minPct.current = Math.min(minPct.current, live.current.state.minPct)
    setHud((cur) => (cur.orbit === h.orbit && cur.eclipse === h.eclipse && Math.abs(cur.pct - h.pct) < 0.4 ? cur : h))
  }, [])

  const onDead = useCallback(() => {
    setDeadInfo(shortfall(model, live.current.on))
    setPhase('dead')
    audio.play('sfx.ih-vacuum-pump')
  }, [model])

  const onPassed = useCallback(() => {
    setPhase('test')
    lastTouch.current = performance.now()
    sayRoom('thermal-vac', 'success')
    audio.play('sfx.ih-power-hum')
  }, [])

  const retry = () => {
    live.current.state = initialState(model)
    live.current.t = 0
    const fresh = Object.fromEntries(model.loads.map((l) => [l.id, l.startsOn]))
    live.current.on = fresh
    setOn(fresh)
    minPct.current = 100
    setDeadInfo(null)
    setAttempt((a) => a + 1)
    setPhase('run')
  }

  // odds for every campaign count, worked out once the test choice shows (kept off the first frame)
  useEffect(() => {
    if (phase !== 'test') return
    const id = window.setTimeout(() => {
      const next: Record<number, number> = {}
      for (let t = turnConstants.minTestTurns; t <= turnConstants.maxTestTurns; t++) {
        next[t] = testOutcome(design, difficulty, t).success
      }
      setOdds(next)
    }, 50)
    return () => window.clearTimeout(id)
  }, [phase, design, difficulty])

  const outcome = useMemo(() => testOutcome(design, difficulty, testTurns, false), [design, difficulty, testTurns])

  const changeTests = (n: number) => {
    lastTouch.current = performance.now()
    shake.current = 1
    audio.play('sfx.ih-vacuum-pump')
    setTestTurns(n)
  }

  const finish = (skipped = false) => {
    const pct = Math.round(Math.max(model.floorPct, Math.min(100, minPct.current)))
    const tt = skipped ? design.planning.testTurns : testTurns
    const o = testOutcome(design, difficulty, tt, false)
    const success = odds[tt]
    const insights = [
      ...(skipped
        ? []
        : [
            {
              id: 'eclipse-min-charge',
              room: 'thermal-vac' as const,
              text: `Survived the eclipse with ${pct}% minimum charge.`,
              metric: { label: 'min charge', value: pct, unit: '%' },
            },
          ]),
      {
        id: 'test-campaigns',
        room: 'thermal-vac' as const,
        text: `${tt} test campaign${tt === 1 ? '' : 's'} found ${o.bugs} of ${LATENT_BUGS} bugs${
          success !== undefined ? ` and put the mission-success odds at ${Math.round(success * 100)}%` : ''
        }; the craft is ready in month ${o.readyMonths}.`,
        metric: { label: 'known bugs found', value: o.bugs, unit: `of ${LATENT_BUGS}` },
      },
    ]
    onComplete({
      patch: { planning: { ...design.planning, testTurns: tt } },
      insights,
      durationS: Math.round((Date.now() - startMs.current) / 1000),
    })
  }

  return (
    <div className="relative h-full w-full bg-black" data-room="thermal-vac" data-phase={phase} data-testid="eclipse-survival">
      <Canvas key={attempt} camera={{ position: [0, 0.6, 6.6], fov: 52 }} dpr={[1, 1.5]} onCreated={({ camera }) => camera.lookAt(0, -0.2, 0)}>
        <Scene
          design={design}
          model={model}
          phase={phase}
          live={live}
          on={on}
          toggle={toggle}
          testTurns={testTurns}
          outcome={outcome}
          odds={odds[testTurns] ?? null}
          setTestTurns={changeTests}
          signOff={() => finish(false)}
          shake={shake}
          onTick={onTick}
          onDead={onDead}
          onPassed={onPassed}
        />
      </Canvas>

      {/* HUD 1: the one readout */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/55 px-4 py-1.5 text-sm font-semibold text-paper" data-testid="eclipse-hud">
        {phase === 'test'
          ? `Orbit test passed · ${testTurns} test campaign${testTurns === 1 ? '' : 's'}`
          : `${model.orbitName.split(' (')[0]} · orbit ${hud.orbit}/${model.orbits} · ${hud.eclipse ? 'ECLIPSE' : 'sunlit'} · battery ${Math.round(hud.pct)}%`}
      </div>

      {/* HUD 2: leave / skip */}
      <div className="absolute right-4 top-4 flex gap-2">
        {replay && (
          <button type="button" className="fp-btn-secondary" data-testid="room-skip" onClick={() => finish(true)}>
            Skip
          </button>
        )}
        <button type="button" className="fp-btn-secondary" onClick={onExit}>
          Leave
        </button>
      </div>

      {phase === 'run' && model.eclipseH === 0 && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded bg-black/55 px-3 py-1 text-xs text-paper">
          This orbit never enters the Moon&apos;s shadow, so the lamps stay on.
        </div>
      )}

      {phase === 'dead' && deadInfo && (
        <div
          className="absolute left-1/2 top-1/2 w-[min(26rem,86vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/80 p-5 text-paper"
          data-testid="eclipse-dead"
        >
          <div className="fp-label mb-2">Your craft went dark</div>
          <p className="mb-4 text-sm leading-relaxed">
            Reyes: &quot;The eclipse lasts {Math.round(model.eclipseH * 60)} minutes. With {Math.round(deadInfo.loadW)} W switched on
            the dark needs {Math.round(deadInfo.needWh)} Wh, and this battery can give only {Math.round(deadInfo.usableWh)} Wh before
            it hits its {Math.round(model.floorPct)}% floor. Switch off what you don&apos;t need in the shadow, or build a bigger
            battery.&quot;
          </p>
          <div className="flex gap-3">
            <button type="button" className="fp-btn-primary" data-testid="eclipse-retry" onClick={retry}>
              Try again
            </button>
            <button type="button" className="fp-btn-secondary" data-testid="eclipse-back" onClick={onExit}>
              Back to Clean Room
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
