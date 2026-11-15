import { Component, Suspense, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useModel } from '../../assets/models'
import { useGameStore } from '../../state/gameStore'
import { CubeSat, useSpaceTexture } from '../space'
import { TILE_LENGTH, TILE_WIDTH, bakeGround } from './ground'
import { Beam } from './beams'
import { InstrumentModel } from './InstrumentModel'
import { FAR_PLANE_NEAR_EDGE, SAT_SCALE, TILE_COPIES, advancePass, holdOverCrater, groundAt, lookY, makeGlowTexture, slotX, targetZ, type Pass } from './frame'
import type { InstrumentView } from './stageModel'

const TAU = Math.PI * 2

class SceneBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

function CraterTileMaterial() {
  const baseTex = useSpaceTexture('texture.lunar-crater-closeup')
  const map = useMemo(() => {
    const t = baseTex.clone()
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.repeat.set(6, 3)
    t.needsUpdate = true
    return t
  }, [baseTex])
  return <meshStandardMaterial map={map} vertexColors roughness={0.96} metalness={0} />
}

function AristarchusFlank({ position, rotationY = 0, scale = 1.6 }: { position: [number, number, number]; rotationY?: number; scale?: number }) {
  const scene = useModel('model.env-lunar-crater')
  useLayoutEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.color.set('#90939b')
        obj.material.roughness = 0.96
      }
    })
  }, [scene])
  return <primitive object={scene} position={position} rotation={[0, rotationY, 0]} scale={scale} />
}

function OrbitingLro({ h }: { h: number }) {
  const scene = useModel('model.env-lro')
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    const t = clock.elapsedTime * 0.08
    group.current.position.x = Math.sin(t) * 26 - 10
    group.current.position.y = h + 11 + Math.cos(t * 1.4) * 1.2
    group.current.position.z = -58 + Math.cos(t) * 10
    group.current.rotation.y = Math.PI * 0.4 + t * 0.25
  })
  return (
    <group ref={group} position={[-10, h + 11, -58]} scale={0.75}>
      <primitive object={scene} />
    </group>
  )
}

function buildTile(): THREE.BufferGeometry {
  const { nx, nu, height, shadow } = bakeGround()
  const dx = TILE_WIDTH / (nx - 1)
  const du = TILE_LENGTH / (nu - 1)
  const g = new THREE.PlaneGeometry(TILE_WIDTH, TILE_LENGTH, nx - 1, nu - 1)
  g.rotateX(-Math.PI / 2)
  g.translate(0, 0, -TILE_LENGTH / 2) // local z runs from 0 back to -TILE_LENGTH; u = -z
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k)
    const u = -pos.getZ(k)
    const i = Math.round((x + TILE_WIDTH / 2) / dx)
    const j = Math.min(nu - 1, Math.round(u / du))
    pos.setY(k, height[j * nx + i])
    const tone = 0.6 + 0.06 * Math.sin(x * 1.7) * Math.cos((TAU * 5 * u) / TILE_LENGTH)
    const v = tone * (1 - 0.975 * shadow[j * nx + i])
    col[k * 3] = v
    col[k * 3 + 1] = v
    col[k * 3 + 2] = v * 1.03
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/** Slides the ground and reports when the landing point crosses into or out of shadow. */
function Driver({ pass, h, still, onShadow }: { pass: Pass; h: number; still: boolean; onShadow: (s: boolean) => void }) {
  const last = useRef<boolean | null>(null)
  useFrame((_, dt) => {
    if (still) holdOverCrater(pass, h)
    else advancePass(pass, dt)
    const s = groundAt(pass, 0, targetZ(h)).shadow > 0.5
    if (s !== last.current) {
      last.current = s
      onShadow(s)
    }
  })
  return null
}

/** Moves camera and look-at point with the satellite when the altitude changes. */
function Rig({ h }: { h: number }) {
  const cur = useRef(h)
  useFrame((state) => {
    const d = (h - cur.current) * 0.07
    if (Math.abs(d) < 1e-4) return
    cur.current += d
    state.camera.position.y += d
    const controls = state.controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (controls) {
      controls.target.y += d * 0.7
      controls.update()
    }
  })
  return null
}

function Terrain({ pass }: { pass: Pass }) {
  const geo = useMemo(() => buildTile(), [])
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (group.current) group.current.position.z = pass.offset
  })
  const plainMat = <meshStandardMaterial vertexColors roughness={1} metalness={0} />
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} rotation={[-Math.PI / 2, 0, 0]} position={[side * (TILE_WIDTH / 2 + 1500), -0.05, -1000]}>
          <planeGeometry args={[3000, 4000]} />
          <meshStandardMaterial color="#99999c" roughness={1} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, FAR_PLANE_NEAR_EDGE - 1500]}>
        <planeGeometry args={[TILE_WIDTH, 3000]} />
        <meshStandardMaterial color="#99999c" roughness={1} />
      </mesh>
      <group ref={group}>
        {TILE_COPIES.map((i) => (
          <group key={i} position={[0, 0, -i * TILE_LENGTH]}>
            <mesh geometry={geo}>
              <SceneBoundary fallback={plainMat}>
                <Suspense fallback={plainMat}>
                  <CraterTileMaterial />
                </Suspense>
              </SceneBoundary>
            </mesh>
            {/* Flank the crater corridor with NASA Aristarchus relief terrain outside the central scan track */}
            <SceneBoundary>
              <Suspense fallback={null}>
                <AristarchusFlank position={[-38, -0.25, -TILE_LENGTH * 0.45]} rotationY={0.2} scale={1.6} />
                <AristarchusFlank position={[38, -0.25, -TILE_LENGTH * 0.55]} rotationY={Math.PI - 0.15} scale={1.6} />
              </Suspense>
            </SceneBoundary>
          </group>
        ))}
      </group>
    </>
  )
}

function PrimitiveSatelliteFallback() {
  return (
    <>
      <mesh>
        <boxGeometry args={[0.8, 0.5, 1.4]} />
        <meshStandardMaterial color="#c9a25a" metalness={0.45} roughness={0.5} emissive="#1a1206" emissiveIntensity={0.5} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.45, 0.12, 0]}>
          <mesh>
            <boxGeometry args={[2.0, 0.04, 1.05]} />
            <meshStandardMaterial color="#1c2230" metalness={0.6} roughness={0.35} emissive="#0b0e14" emissiveIntensity={0.4} />
          </mesh>
          {[-0.5, 0, 0.5].map((x) => (
            <mesh key={x} position={[x, 0.025, 0]}>
              <boxGeometry args={[0.02, 0.01, 1.05]} />
              <meshBasicMaterial color="#3a4254" transparent opacity={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 0.33, 0.35]}>
        <cylinderGeometry args={[0.22, 0.08, 0.12, 20]} />
        <meshStandardMaterial color="#ddd5c4" metalness={0.2} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.76]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 0.14, 16]} />
        <meshStandardMaterial color="#5a5650" />
      </mesh>
    </>
  )
}

function Satellite({ h, views }: { h: number; views: InstrumentView[] }) {
  const design = useGameStore((s) => s.design)
  const group = useRef<THREE.Group>(null)
  const cur = useRef(h)
  useFrame(({ clock }) => {
    if (!group.current) return
    cur.current += (h - cur.current) * 0.07
    group.current.position.y = cur.current + Math.sin(clock.elapsedTime * 0.8) * 0.04
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.5) * 0.025
  })
  return (
    <group ref={group} position={[0, h, 0]} scale={SAT_SCALE}>
      <SceneBoundary fallback={<PrimitiveSatelliteFallback />}>
        <Suspense fallback={<PrimitiveSatelliteFallback />}>
          <group rotation={[0, Math.PI, 0]}>
            <CubeSat design={design} deploy={1} scale={4.0} />
          </group>
        </Suspense>
      </SceneBoundary>
      {views.map((v, i) => (
        <group key={v.id} position={[slotX(i, views.length), -0.05, -0.25]}>
          <InstrumentModel id={v.id} color={v.color} />
        </group>
      ))}
    </group>
  )
}

function Sky({ glow }: { glow: THREE.Texture }) {
  return (
    <>
      <Stars radius={500} depth={60} count={3500} factor={7} fade speed={0} />
      <sprite position={[-270, 125, -742]} scale={[420, 420, 1]}>
        <spriteMaterial map={glow} color="#fff3c4" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <sprite position={[-270, 125, -742]} scale={[80, 80, 1]}>
        <spriteMaterial map={glow} color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <mesh position={[135, 180, -768]}>
        <sphereGeometry args={[20, 32, 32]} />
        <meshStandardMaterial color="#4f6f9a" emissive="#1f2c40" emissiveIntensity={0.25} roughness={0.9} />
      </mesh>
    </>
  )
}

export interface SceneProps {
  pass: Pass
  h: number
  views: InstrumentView[]
  still: boolean
  onShadow: (overShadow: boolean) => void
}

export function Scene({ pass, h, views, still, onShadow }: SceneProps) {
  const glow = useMemo(() => makeGlowTexture(), [])
  const [startTarget] = useState<[number, number, number]>(() => [0, lookY(h), -4])
  return (
    <>
      <color attach="background" args={['#07090d']} />
      <ambientLight intensity={0.07} />
      <directionalLight position={[-34.2, 15.8, -94]} intensity={6.5} color="#fff8ec" />
      <pointLight position={[2.5, h + 2.5, 5]} intensity={45} distance={9} decay={2} color="#e6dccb" />
      <Driver pass={pass} h={h} still={still} onShadow={onShadow} />
      <Rig h={h} />
      <Sky glow={glow} />
      <SceneBoundary>
        <Suspense fallback={null}>
          <OrbitingLro h={h} />
        </Suspense>
      </SceneBoundary>
      <Terrain pass={pass} />
      <Satellite h={h} views={views} />
      {views.map((v, i) => (
        <Beam key={v.id} pass={pass} h={h} x={slotX(i, views.length)} view={v} glow={glow} calm={still} />
      ))}
      <OrbitControls
        makeDefault
        target={startTarget}
        enablePan={false}
        enableZoom={false}
        enableDamping
        minPolarAngle={1.1}
        maxPolarAngle={1.5}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={1.1}
      />
    </>
  )
}
