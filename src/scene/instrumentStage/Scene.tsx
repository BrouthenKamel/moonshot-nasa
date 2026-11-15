import { Component, Suspense, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useModel } from '../../assets/models'
import { useGameStore } from '../../state/gameStore'
import { CubeSat, useSpaceTexture } from '../space'
import { TILE_LENGTH, TILE_WIDTH, TRACK_CRATER, bakeGround, groundHeight, shadowAt } from './ground'
import { Beam } from './beams'
import { InstrumentModel } from './InstrumentModel'
import { FAR_PLANE_NEAR_EDGE, SAT_SCALE, TILE_COPIES, advancePass, holdOverCrater, groundAt, lookY, makeGlowTexture, slotX, targetZ, type Pass } from './frame'
import { iceSparkleStrength, type InstrumentView } from './stageModel'
import { useInsidePath } from '../interaction/InsideCam'
import { useInsidePlaying } from '../../ui/interaction/insideStore'

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
  const looking = useInsidePlaying('lab-look-through')
  useFrame((state) => {
    if (looking) {
      cur.current = h
      return
    }
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

/** Cuts the camera under the CubeSat payload aperture looking down across shadowed crater floors. */
function LookThroughRig({ h }: { h: number }) {
  const keys = useMemo(
    () => [
      { t: 0, pos: [0.35, h - 0.65, 0.25] as [number, number, number], target: [0, -0.1, targetZ(h)] as [number, number, number], fov: 48 },
      { t: 0.65, pos: [0, h - 0.9, -0.35] as [number, number, number], target: [0, -0.5, targetZ(h)] as [number, number, number], fov: 42 },
      { t: 18, pos: [0, h - 0.9, -0.35] as [number, number, number], target: [0, -0.5, targetZ(h)] as [number, number, number], fov: 42 },
    ],
    [h],
  )
  useInsidePath('lab-look-through', keys, { still: 1, endAfterS: 18 })
  return null
}

const ICE_SPARKLES: ReadonlyArray<[number, number, number]> = (() => {
  const pts: [number, number, number][] = []
  for (let i = 0; i < 48; i++) {
    const a = i * 2.399963
    const rad = Math.sqrt((i + 0.5) / 48) * (TRACK_CRATER.r * 0.72)
    const x = TRACK_CRATER.x + Math.cos(a) * rad
    const u = TRACK_CRATER.u + Math.sin(a) * rad
    if (shadowAt(x, u) > 0.55) pts.push([x, groundHeight(x, u) + 0.14, -u])
  }
  return pts
})()

function CraterIceSparkles({ strength, still }: { strength: number; still: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const cur = useRef(strength)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock }) => {
    cur.current += (strength - cur.current) * 0.08
    if (mat.current) mat.current.opacity = cur.current * 0.85
    if (!mesh.current) return
    mesh.current.visible = cur.current > 0.015
    if (!mesh.current.visible) return
    const t = clock.elapsedTime
    for (let i = 0; i < ICE_SPARKLES.length; i++) {
      const [x, y, z] = ICE_SPARKLES[i]
      const glint = still ? 0.85 : 0.45 + 0.65 * Math.max(0, Math.sin(t * 2.7 + i * 1.9))
      dummy.position.set(x, y, z)
      dummy.scale.setScalar(glint * (0.09 + 0.05 * cur.current))
      dummy.updateMatrix()
      mesh.current.setMatrixAt(i, dummy.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, ICE_SPARKLES.length]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial ref={mat} color="#5ee6f0" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  )
}

function OpticalBenchPedestal({ h }: { h: number }) {
  const ref = useRef<THREE.Group>(null)
  const cur = useRef(h)
  useFrame(() => {
    cur.current += (h - cur.current) * 0.07
    if (ref.current) ref.current.position.y = cur.current - 1.05
  })
  return (
    <group ref={ref} position={[0, h - 1.05, 0.72]}>
      <mesh>
        <boxGeometry args={[3.4, 0.08, 0.16]} />
        <meshStandardMaterial color="#1f252e" metalness={0.55} roughness={0.45} />
      </mesh>
      {[-1.55, 1.55].map((x) => (
        <group key={x} position={[x, 0.35, 0]}>
          <mesh>
            <boxGeometry args={[0.07, 0.78, 0.08]} />
            <meshStandardMaterial color="#2a313c" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.32, -0.05]}>
            <boxGeometry args={[0.14, 0.04, 0.04]} />
            <meshBasicMaterial color="#e8a33d" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Terrain({ pass, sparkleStrength, still }: { pass: Pass; sparkleStrength: number; still: boolean }) {
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
            <CraterIceSparkles strength={sparkleStrength} still={still} />
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
  const sparkleStrength = useMemo(() => iceSparkleStrength(views), [views])
  return (
    <>
      <color attach="background" args={['#07090d']} />
      <ambientLight intensity={0.07} />
      <directionalLight position={[-34.2, 15.8, -94]} intensity={6.5} color="#fff8ec" />
      <pointLight position={[2.5, h + 2.5, 5]} intensity={45} distance={9} decay={2} color="#e6dccb" />
      <Driver pass={pass} h={h} still={still} onShadow={onShadow} />
      <Rig h={h} />
      <LookThroughRig h={h} />
      <Sky glow={glow} />
      <SceneBoundary>
        <Suspense fallback={null}>
          <OrbitingLro h={h} />
        </Suspense>
      </SceneBoundary>
      <Terrain pass={pass} sparkleStrength={sparkleStrength} still={still} />
      <OpticalBenchPedestal h={h} />
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
