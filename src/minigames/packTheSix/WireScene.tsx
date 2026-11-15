import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Budgets } from '../../sim/types'
import { brownout, ledBrightness } from '../../scene/interaction/reactions'
import { prefersReducedMotion } from '../../scene/space/quality'
import { audio } from '../../assets/audio'
import { loadFact, nodeFact } from './facts'
import { FAMILY_COLOR, type InspectTarget } from './PackScene'
import { wireValid, type Load, type Wire, type WiringState } from './logic'

type Vec3 = [number, number, number]

export const SOLAR_POS: Vec3 = [-4.4, 1.9, 0]
export const BATTERY_POS: Vec3 = [-1.4, 1.9, 0]
export const loadPos = (i: number): Vec3 => [2.9, 3.7 - i * 0.55, 0]

const nodePos = (id: string, loads: Load[]): Vec3 => {
  if (id === 'solar') return SOLAR_POS
  if (id === 'battery') return BATTERY_POS
  return loadPos(loads.findIndex((l) => l.id === id))
}

const curve = (a: Vec3, b: Vec3) => {
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.35]
  return new THREE.QuadraticBezierCurve3(new THREE.Vector3(a[0] + 0.45, a[1], 0.12), new THREE.Vector3(...mid), new THREE.Vector3(b[0] - 0.45, b[1], 0.12))
}

/** Glowing power particles running along a cable; they stutter when the bus is short */
function Flow({ curve: c, count, speed, bus, seed }: { curve: THREE.QuadraticBezierCurve3; count: number; speed: number; bus: ReturnType<typeof brownout>; seed: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    return g
  }, [count])
  const mat = useMemo(() => new THREE.PointsMaterial({ color: '#ffd27a', size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame((st) => {
    const t = st.clock.elapsedTime
    const arr = geo.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      const u = reduced ? (i + 0.5) / count : (((i / count + t * speed) % 1) + 1) % 1
      c.getPoint(u, tmp)
      arr[i * 3] = tmp.x
      arr[i * 3 + 1] = tmp.y
      arr[i * 3 + 2] = tmp.z
    }
    geo.attributes.position.needsUpdate = true
    mat.opacity = ledBrightness(bus, t + seed) * (bus.steady ? 1 : 0.8)
  })
  return <points geometry={geo} material={mat} />
}

function Cable({ curve: c, lit, bus, seed, speed, count }: { curve: THREE.QuadraticBezierCurve3; lit: boolean; bus: ReturnType<typeof brownout>; seed: number; speed: number; count: number }) {
  const pts = useMemo(() => c.getPoints(24), [c])
  return (
    <group>
      <Line points={pts} color={lit ? '#e8a33d' : '#948d7f'} lineWidth={lit ? 2.5 : 1.5} />
      {lit && <Flow curve={c} count={count} speed={speed} bus={bus} seed={seed} />}
    </group>
  )
}

interface NodeProps {
  id: string
  position: Vec3
  color: string
  label: string
  tag?: string
  tagTone?: 'ok' | 'warn' | 'bad'
  size?: [number, number]
  fed: boolean
  flicker: ReturnType<typeof brownout>
  onDown?: (e: ThreeEvent<PointerEvent>) => void
  onUp?: () => void
  onClick: () => void
  testId: string
}

function Node({ id, position, color, label, tag, tagTone = 'ok', size = [0.9, 0.42], fed, flicker, onDown, onUp, onClick, testId }: NodeProps) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const [hover, setHover] = useState(false)
  useFrame((st) => {
    if (!mat.current) return
    const b = fed ? ledBrightness(flicker, st.clock.elapsedTime) : 0.25
    mat.current.emissiveIntensity = (hover ? 0.2 : 0) + b * (fed ? 0.9 : 0.15)
  })
  const tone = tagTone === 'bad' ? 'text-nogo' : tagTone === 'warn' ? 'text-caution' : 'text-paper-dim'
  return (
    <group position={position}>
      <mesh
        name={id}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <boxGeometry args={[size[0], size[1], 0.25]} />
        <meshStandardMaterial ref={mat} color="#1a1f2b" emissive={color} emissiveIntensity={0.3} roughness={0.5} metalness={0.4} />
      </mesh>
      <Html position={[0, 0, 0.2]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="fp-data whitespace-nowrap text-center text-[12px] leading-tight text-paper" data-testid={testId}>
          {label}
          {tag && <div className={`text-[12px] ${tone}`}>{tag}</div>}
        </div>
      </Html>
    </group>
  )
}

export interface WireSceneProps {
  loads: Load[]
  wires: Wire[]
  state: WiringState
  budgets: Budgets
  onWire: (from: string, to: string) => void
  onUnwire: (from: string, to: string) => void
  onInspect: (t: InspectTarget) => void
}

export function WireScene({ loads, wires, state, budgets, onWire, onUnwire, onInspect }: WireSceneProps) {
  const loadIds = useMemo(() => loads.map((l) => l.id), [loads])
  const margin = state.generated - state.load
  const bus = useMemo(() => (state.solarLinked ? brownout(margin, Math.max(1, state.generated)) : brownout(1, 1)), [margin, state.generated, state.solarLinked])
  const [cable, setCable] = useState<{ from: string; x: number; y: number } | null>(null)
  const cableRef = useRef(cable)
  cableRef.current = cable

  // a drag that lets go anywhere else drops the loose end
  useEffect(() => {
    const up = () => setCable(null)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const connect = (from: string, to: string) => {
    if (!wireValid(from, to, loadIds)) return
    onWire(from, to)
    audio.play('sfx.ih-part-click')
  }
  const wired = (from: string, to: string) => wires.some((w) => w.from === from && w.to === to)

  const curves = useMemo(
    () => wires.map((w) => ({ w, c: curve(nodePos(w.from, loads), nodePos(w.to, loads)) })),
    [wires, loads],
  )
  const live = cable ? curve(nodePos(cable.from, loads), [cable.x, cable.y, 0]) : null
  const livePts = useMemo(() => (live ? live.getPoints(16) : null), [cable?.x, cable?.y, cable?.from]) // eslint-disable-line react-hooks/exhaustive-deps

  const short = state.shortfall > 0
  const batteryTag = !state.solarLinked ? 'no power in' : short ? `-${state.shortfall.toFixed(0)} W short` : `+${margin.toFixed(0)} W spare`

  return (
    <group>
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 5, 6]} intensity={1.4} />
      {/* the back wall the cables are pinned to; it also catches the loose cable end */}
      <mesh
        position={[0, 2.4, -0.2]}
        onPointerMove={(e) => {
          if (cableRef.current) setCable({ from: cableRef.current.from, x: e.point.x, y: e.point.y })
        }}
      >
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial color="#121620" roughness={1} />
      </mesh>

      {curves.map(({ w, c }, i) => {
        const lit = state.solarLinked && (w.from === 'solar' || state.powered.includes(w.to))
        return <Cable key={`${w.from}-${w.to}`} curve={c} lit={lit} bus={bus} seed={i * 1.7} speed={0.35} count={w.from === 'solar' ? 14 : 8} />
      })}
      {livePts && <Line points={livePts} color="#e8a33d" lineWidth={2.5} />}

      <Node
        id="solar"
        position={SOLAR_POS}
        color={FAMILY_COLOR.solar}
        label="Solar"
        tag={`${budgets.powerGenerated.toFixed(0)} W`}
        size={[1.0, 0.9]}
        fed
        flicker={brownout(1, 1)}
        testId="node-solar"
        onDown={(e) => {
          e.stopPropagation()
          setCable({ from: 'solar', x: e.point.x, y: e.point.y })
        }}
        onClick={() => {
          const f = nodeFact('solar', budgets, 0)
          onInspect({ fact: f, at: SOLAR_POS, dist: 3.2 })
        }}
      />
      <Node
        id="battery"
        position={BATTERY_POS}
        color={FAMILY_COLOR.battery}
        label="Battery"
        tag={batteryTag}
        tagTone={!state.solarLinked ? 'warn' : short ? 'bad' : 'ok'}
        size={[1.0, 1.2]}
        fed={state.solarLinked}
        flicker={bus}
        testId="node-battery"
        onDown={(e) => {
          e.stopPropagation()
          setCable({ from: 'battery', x: e.point.x, y: e.point.y })
        }}
        onUp={() => {
          if (cableRef.current) connect(cableRef.current.from, 'battery')
        }}
        onClick={() => {
          if (!wired('solar', 'battery')) return connect('solar', 'battery')
          onInspect({ fact: nodeFact('battery', budgets, state.shortfall), at: BATTERY_POS, dist: 3.2 })
        }}
      />
      {loads.map((l, i) => {
        const on = state.powered.includes(l.id)
        const fam = l.id === 'radio' || l.id === 'computer' || l.id === 'attitude' || l.id === 'propulsion' ? l.id : l.id === 'bus' ? 'battery' : 'instrument'
        return (
          <Node
            key={l.id}
            id={l.id}
            position={loadPos(i)}
            color={FAMILY_COLOR[fam]}
            label={l.label}
            tag={on ? `${l.draw.toFixed(l.draw % 1 ? 1 : 0)} W` : 'unplugged'}
            tagTone={on ? 'ok' : 'warn'}
            fed={on}
            flicker={bus}
            testId={`node-${l.id}`}
            onUp={() => {
              if (cableRef.current) connect(cableRef.current.from, l.id)
            }}
            onClick={() => {
              if (!wired('battery', l.id)) return connect('battery', l.id)
              onInspect({ fact: loadFact(l), at: loadPos(i), dist: 2.8 })
            }}
          />
        )
      })}
      {/* a second tap on a plugged load pulls its cable: shown as a tiny handle on the plug */}
      {loads.map((l, i) =>
        wired('battery', l.id) ? (
          <mesh
            key={`pull-${l.id}`}
            position={[loadPos(i)[0] - 0.55, loadPos(i)[1], 0.14]}
            onClick={(e) => {
              e.stopPropagation()
              onUnwire('battery', l.id)
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshBasicMaterial color="#e8a33d" />
          </mesh>
        ) : null,
      )}
    </group>
  )
}
