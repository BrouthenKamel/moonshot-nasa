import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getPartById } from '../../data/parts'
import type { Budgets } from '../../sim/types'
import { PartSlot, type SlotLive } from '../../scene/factory/PartSlot'
import { DropSlot } from '../../scene/interaction/DropSlot'
import { SnapNudge, SnapPuff, snapEase, SNAP_MS } from '../../scene/interaction/snap'
import { scaleState, springStep } from '../../scene/interaction/reactions'
import { prefersReducedMotion } from '../../scene/space/quality'
import { trackDrag } from '../../ui/interaction/drag'
import { useDragStore } from '../../ui/interaction/dragStore'
import { partFact, type Fact } from './facts'
import {
  COLS, FAMILIES, OPTIONS, ROWS, cellCentre, cellsNeeded, deltaVGauge, slabBox, tryPlace, volumeOf,
  type Choice, type Family, type Placement,
} from './logic'

type Vec3 = [number, number, number]

export const FAMILY_COLOR: Record<Family | 'instrument' | 'solar', string> = {
  battery: '#6faf7a',
  radio: '#5ee6f0',
  computer: '#b9a3e8',
  attitude: '#e8a33d',
  propulsion: '#d0533f',
  instrument: '#ede6d6',
  solar: '#5b7fe0',
}

export interface InspectTarget {
  fact: Fact
  /** Where the camera looks */
  at: Vec3
  /** How far from it the camera stands */
  dist: number
}

/* ---------------- one part, as a slab ---------------- */

function useLive(share: number) {
  const live = useRef<SlotLive>({ height: share, flash: 0, squash: 0 })
  live.current.height = share
  return live
}

/** A part in the frame: drops in with a 120 ms ease-in, flashes, and can be lifted again (unless it is an instrument) */
function Slab({ p, onInspect, budgets }: { p: Placement; onInspect: (t: InspectTarget) => void; budgets: Budgets }) {
  const { centre, size } = slabBox(p)
  const live = useLive(size[1])
  const group = useRef<THREE.Group>(null)
  const born = useRef(performance.now())
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const [hover, setHover] = useState(false)
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const k = reduced ? 1 : snapEase(performance.now() - born.current, SNAP_MS)
    g.position.y = centre[1] + (1 - k) * 0.9
    live.current.flash = Math.max(0, live.current.flash - dt * 2.2)
    if (k >= 1 && live.current.flash === 0 && !reduced && performance.now() - born.current < SNAP_MS + 60) live.current.flash = 1
  })
  const color = FAMILY_COLOR[p.family]
  return (
    <group
      ref={group}
      position={[centre[0], centre[1], centre[2]]}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = p.locked ? 'help' : 'grab'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (p.locked || e.button !== 0) return
        e.stopPropagation()
        trackDrag({ field: p.family, value: p.id, label: getPartById(p.id)?.name ?? p.id, sound: 'sfx.ih-part-click' }, e.nativeEvent)
      }}
      onClick={(e) => {
        e.stopPropagation()
        const f = partFact(p.id, budgets)
        if (f) onInspect({ fact: f, at: [centre[0], centre[1], centre[2]], dist: 2.6 })
      }}
    >
      <PartSlot partId={p.id} width={size[0]} depth={size[2]} height={size[1]} live={live} color={color} accent={color} over={false} reduced={reduced} />
      {hover && (
        <lineSegments renderOrder={6}>
          <edgesGeometry args={[new THREE.BoxGeometry(size[0] + 0.02, size[1] + 0.02, size[2] + 0.02)]} />
          <lineBasicMaterial color="#ede6d6" />
        </lineSegments>
      )}
    </group>
  )
}

/* ---------------- the shelf ---------------- */

const SHELF_SCALE = 0.42

/** A part on the shelf: lift it with a drag. A shake means the last drop of it bounced. */
function ShelfBlock({ id, family, position, current, onInspect, budgets }: { id: string; family: Family | 'solar'; position: Vec3; current: boolean; onInspect: (t: InspectTarget) => void; budgets: Budgets }) {
  const part = getPartById(id)
  const vol = volumeOf(id)
  const k = family === 'solar' ? 1 : cellsNeeded(vol)
  // the footprint it will take in the frame: a pair lies across, a column of three lies across too, on the shelf
  const w = family === 'solar' ? 1.4 : k
  const d = family === 'solar' ? 0.9 : 1
  const h = family === 'solar' ? 0.12 : Math.max(0.14, vol / k)
  const live = useLive(h)
  const group = useRef<THREE.Group>(null)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const refusal = useDragStore((s) => s.lastRefusal)
  const shake = useRef(0)
  const seen = useRef<number | null>(null)
  const [hover, setHover] = useState(false)
  useEffect(() => {
    if (refusal && refusal.value === id && refusal.at !== seen.current) {
      seen.current = refusal.at
      shake.current = 1
    }
  }, [refusal, id])
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    shake.current = Math.max(0, shake.current - dt * 2.5)
    const s = reduced ? 0 : shake.current
    // bounce back: a damped hop and a side-to-side shiver
    g.position.set(position[0] + Math.sin(shake.current * 40) * 0.05 * s, position[1] + Math.abs(Math.sin(shake.current * 9)) * 0.25 * s, position[2])
  })
  const color = FAMILY_COLOR[family]
  return (
    <group
      ref={group}
      position={position}
      scale={SHELF_SCALE}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        setHover(false)
        document.body.style.cursor = ''
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0) return
        e.stopPropagation()
        trackDrag({ field: family, value: id, label: part?.name ?? id, sound: 'sfx.ih-part-click' }, e.nativeEvent)
      }}
      onClick={(e) => {
        e.stopPropagation()
        const f = partFact(id, budgets)
        if (f) onInspect({ fact: f, at: [position[0], position[1], position[2]], dist: 2.2 })
      }}
    >
      <PartSlot partId={id} width={w} depth={d} height={h} live={live} color={color} accent={color} over={false} reduced={reduced} />
      {(current || hover) && (
        <lineSegments position={[0, 0, 0]} renderOrder={6}>
          <edgesGeometry args={[new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1)]} />
          <lineBasicMaterial color={current ? '#e8a33d' : '#ede6d6'} />
        </lineSegments>
      )}
    </group>
  )
}

/** The shelf, row by row (the left of the room): the options of each family side by side */
const SHELF_ROWS: Array<{ z: number; ids: string[] }> = [
  { z: -2.1, ids: OPTIONS.battery },
  { z: -1.3, ids: OPTIONS.radio },
  { z: -0.5, ids: [...OPTIONS.computer, ...OPTIONS.attitude] },
  { z: 0.3, ids: ['prop-coldgas', 'prop-ion', 'prop-ion-large'] },
  { z: 1.1, ids: ['prop-chemical', 'prop-chemical-large'] },
]

/** Where each shelf block stands: the options of each family along a row on the left, solar on the right */
export function shelfPosition(family: Family | 'solar', id: string): Vec3 {
  if (family === 'solar') return [4.2, 0.1, -1.4 + OPTIONS.solar.indexOf(id) * 1.15]
  const row = SHELF_ROWS.find((r) => r.ids.includes(id))!
  let x = -2.5
  for (const other of row.ids) {
    const w = cellsNeeded(volumeOf(other)) * SHELF_SCALE + 0.15
    if (other === id) return [x - w / 2, 0.1, row.z]
    x -= w
  }
  return [x, 0.1, row.z]
}

/* ---------------- the scale, the coins, the ruler ---------------- */

const FIXED_FRAME = new THREE.Color('#2a3040')

function Scale({ budgets }: { budgets: Budgets }) {
  const needle = useRef<THREE.Group>(null)
  const state = useMemo(() => scaleState(budgets.totalMass, budgets.massLimit), [budgets.totalMass, budgets.massLimit])
  const sim = useRef({ a: scaleState(0, budgets.massLimit).angle, v: 0 })
  useFrame((st, dt) => {
    const [a, v] = springStep(sim.current.a, sim.current.v, state.angle, dt)
    sim.current = { a, v }
    const shiver = state.over ? Math.sin(st.clock.elapsedTime * 50) * state.shake : 0
    if (needle.current) needle.current.rotation.z = -(a + shiver)
  })
  const redAt = state.redLine
  const over = budgets.massMargin < 0
  return (
    <group position={[0, -0.18, 0]}>
      <mesh receiveShadow>
        <boxGeometry args={[COLS + 0.8, 0.2, ROWS + 0.8]} />
        <meshStandardMaterial color="#1a1f2b" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* the dial on the front edge */}
      <group position={[0, 0.02, ROWS / 2 + 0.55]} rotation={[-0.9, 0, 0]}>
        <mesh>
          <circleGeometry args={[0.52, 40]} />
          <meshStandardMaterial color="#ede6d6" roughness={0.8} />
        </mesh>
        <mesh position={[Math.sin(redAt) * 0.42, Math.cos(redAt) * 0.42, 0.004]} rotation={[0, 0, -redAt]}>
          <boxGeometry args={[0.025, 0.14, 0.004]} />
          <meshBasicMaterial color="#d0533f" />
        </mesh>
        <group ref={needle} position={[0, 0, 0.01]}>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.03, 0.4, 0.006]} />
            <meshBasicMaterial color="#07090d" />
          </mesh>
        </group>
        <mesh position={[0, 0, 0.012]}>
          <circleGeometry args={[0.04, 12]} />
          <meshBasicMaterial color="#07090d" />
        </mesh>
      </group>
      <Html position={[0, -0.05, ROWS / 2 + 1.35]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`fp-data whitespace-nowrap rounded bg-ink-0/80 px-2 py-0.5 text-[13px] ${over ? 'text-nogo' : 'text-paper'}`} data-testid="mass-tag">
          {budgets.totalMass.toFixed(1)} / {budgets.massLimit} kg
        </div>
      </Html>
    </group>
  )
}

/** Parts cost as a pile of coins: one coin is $0.25 M */
function Coins({ budgets }: { budgets: Budgets }) {
  const n = Math.min(48, Math.max(1, Math.round(budgets.partsCost / 0.25)))
  const coins = useMemo(() => Array.from({ length: n }, (_, i) => ({ x: Math.floor(i / 8) * 0.34, y: (i % 8) * 0.05 })), [n])
  const broke = budgets.budgetMargin < 0
  return (
    <group position={[1.4, -0.05, 3.1]}>
      {coins.map((c, i) => (
        <mesh key={i} position={[c.x, c.y + 0.03, ((i * 7) % 3) * 0.02]} rotation={[0, i * 0.7, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.04, 16]} />
          <meshStandardMaterial color={broke ? '#d0533f' : '#e8a33d'} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <Html position={[0.5, 0.6, 0]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`fp-data whitespace-nowrap rounded bg-ink-0/80 px-2 py-0.5 text-[13px] ${broke ? 'text-nogo' : 'text-kapton'}`} data-testid="cost-tag">
          ${budgets.partsCost.toFixed(1)} M of parts
        </div>
      </Html>
    </group>
  )
}

/** The Δv ruler on the wall: Earth to Moon, the fuel the tank gives as a bar, the trip's need as a tick */
function DeltaVRuler({ budgets }: { budgets: Budgets }) {
  const g = deltaVGauge(budgets)
  const span = 8
  const max = Math.max(g.need, g.have, 1) * 1.25
  const haveLen = Math.max(0.02, (g.have / max) * span)
  const needX = -span / 2 + (g.need / max) * span
  const color = g.status === 'short' || g.status === 'noroute' ? '#d0533f' : g.status === 'tight' ? '#d9b23f' : '#6faf7a'
  const ticks = Array.from({ length: 11 }, (_, i) => i)
  return (
    <group position={[0, 2.5, -3.6]}>
      <mesh position={[0, -0.12, -0.05]}>
        <planeGeometry args={[11, 3.6]} />
        <meshStandardMaterial color="#121620" roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[span, 0.04, 0.02]} />
        <meshBasicMaterial color="#948d7f" />
      </mesh>
      {ticks.map((i) => (
        <mesh key={i} position={[-span / 2 + (i / 10) * span, 0.07, 0]}>
          <boxGeometry args={[0.015, i % 5 === 0 ? 0.2 : 0.1, 0.02]} />
          <meshBasicMaterial color="#948d7f" />
        </mesh>
      ))}
      <mesh position={[-span / 2 + haveLen / 2, -0.13, 0.01]}>
        <boxGeometry args={[haveLen, 0.12, 0.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      {g.status !== 'noroute' && (
        <mesh position={[needX, 0.02, 0.02]}>
          <boxGeometry args={[0.05, 0.6, 0.03]} />
          <meshBasicMaterial color="#ede6d6" />
        </mesh>
      )}
      <mesh position={[-span / 2 - 0.55, 0, 0]}>
        <sphereGeometry args={[0.38, 24, 16]} />
        <meshStandardMaterial color="#3d7bd8" roughness={0.7} />
      </mesh>
      <mesh position={[span / 2 + 0.5, 0, 0]}>
        <sphereGeometry args={[0.2, 24, 16]} />
        <meshStandardMaterial color="#b9b2a3" roughness={1} />
      </mesh>
      <Html position={[0, 0.62, 0]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="fp-data whitespace-nowrap rounded bg-ink-0/80 px-2 py-0.5 text-[13px]" style={{ color }} data-testid="dv-tag">
          {g.status === 'noroute' ? 'This engine cannot reach that orbit' : `Tank ${g.have.toFixed(0)} m/s | trip needs ${g.need.toFixed(0)} m/s`}
        </div>
      </Html>
    </group>
  )
}

/* ---------------- the frame ---------------- */

function Frame({ flash }: { flash: number }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(COLS, 1, ROWS)), [])
  const mat = useRef<THREE.LineBasicMaterial>(null)
  useFrame(() => {
    mat.current?.color.set('#ede6d6').lerp(new THREE.Color('#d0533f'), flash)
  })
  return (
    <group>
      <lineSegments geometry={edges} position={[0, 0.5, 0]}>
        <lineBasicMaterial ref={mat} color="#ede6d6" />
      </lineSegments>
      {/* the 1 U cells on the floor */}
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const c = cellCentre(i % COLS, Math.floor(i / COLS))
        return (
          <mesh key={i} position={[c[0], 0.003, c[2]]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.96, 0.96]} />
            <meshStandardMaterial color={FIXED_FRAME} roughness={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

/* ---------------- the whole pack scene ---------------- */

export interface PackSceneProps {
  choice: Choice
  placements: Placement[]
  budgets: Budgets
  onDropPart: (family: Family, id: string, cell: { col: number; row: number }) => void
  onDropSolar: (id: string) => void
  onInspect: (t: InspectTarget) => void
}

export function PackScene({ choice, placements, budgets, onDropPart, onDropSolar, onInspect }: PackSceneProps) {
  const placementsRef = useRef(placements)
  placementsRef.current = placements
  const refusal = useDragStore((s) => s.lastRefusal)
  const [flash, setFlash] = useState(0)
  const flashRef = useRef(0)
  useEffect(() => {
    if (refusal) flashRef.current = 1
  }, [refusal])
  useFrame((_, dt) => {
    if (flashRef.current <= 0 && flash === 0) return
    flashRef.current = Math.max(0, flashRef.current - dt * 2.5)
    setFlash(flashRef.current)
  })

  const cells = useMemo(() => Array.from({ length: COLS * ROWS }, (_, i) => ({ col: i % COLS, row: Math.floor(i / COLS) })), [])
  return (
    <group>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 7, 5]} intensity={1.6} />
      <directionalLight position={[-4, 3, 2]} intensity={0.5} color="#9fb4ff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#0b0e14" roughness={1} />
      </mesh>
      <Scale budgets={budgets} />
      <Frame flash={flash} />
      {placements.map((p) => (
        <Slab key={`${p.id}-${p.col}-${p.row}-${p.off.toFixed(2)}`} p={p} onInspect={onInspect} budgets={budgets} />
      ))}
      {cells.map(({ col, row }) => (
        <DropSlot
          key={`${col}-${row}`}
          id={`cell-${col}-${row}`}
          accepts={FAMILIES}
          position={cellCentre(col, row)}
          size={[0.96, 1, 0.96]}
          preview={false}
          refuse={(p) => {
            const r = tryPlace(placementsRef.current, { id: p.value, family: p.field as Family }, { col, row })
            return r.ok ? null : r.reason
          }}
          onDrop={(p) => onDropPart(p.field as Family, p.value, { col, row })}
        />
      ))}
      <DropSlot
        id="solar-rail"
        accepts={['solar']}
        position={[2.1, 0.5, 0]}
        size={[0.5, 1, 3]}
        preview={false}
        idleVisible
        onDrop={(p) => onDropSolar(p.value)}
      />
      {/* the array on its rail, so the choice reads even though solar takes no volume */}
      <SolarPanel id={choice.solar} />
      {FAMILIES.map((f) => OPTIONS[f].map((id) => <ShelfBlock key={id} id={id} family={f} position={shelfPosition(f, id)} current={choice[f] === id} onInspect={onInspect} budgets={budgets} />))}
      {OPTIONS.solar.map((id) => (
        <ShelfBlock key={id} id={id} family="solar" position={shelfPosition('solar', id)} current={choice.solar === id} onInspect={onInspect} budgets={budgets} />
      ))}
      <DeltaVRuler budgets={budgets} />
      <Coins budgets={budgets} />
      <SnapNudge target={new THREE.Vector3(0, 0.5, 0)} />
      <SnapPuff at={[0, 0.9, 0]} scale={2.5} />
    </group>
  )
}

/** Solar panels clipped to the frame's right side: one small plate for the body cells, a wing or two when deployable */
function SolarPanel({ id }: { id: string }) {
  const wings = id === 'solar-2wing' ? 2 : id === 'solar-1wing' ? 1 : 0
  return (
    <group position={[1.12, 0.5, 0]}>
      <mesh position={[0.02, 0, 0]}>
        <boxGeometry args={[0.04, 1.02, ROWS + 0.02]} />
        <meshStandardMaterial color="#27418c" emissive="#1e3a8a" emissiveIntensity={0.4} roughness={0.5} />
      </mesh>
      {Array.from({ length: wings }, (_, i) => (
        <mesh key={i} position={[0.55, 0.52 + i * 0.03, (i - (wings - 1) / 2) * 1.55]}>
          <boxGeometry args={[1, 0.03, 1.4]} />
          <meshStandardMaterial color="#27418c" emissive="#1e3a8a" emissiveIntensity={0.45} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}
