import { Component, Suspense, useLayoutEffect, useMemo, type ReactNode } from 'react'
import { Box3, Mesh, Vector3 } from 'three'
import type { ModelId } from '../../assets/manifest'
import { useModel } from '../../assets/models'
import type { RoomId } from '../rooms/ids'

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** A GLB scaled so its larger ground dimension is `fit` metres, centred, sitting on y = 0 */
function FitModel({ id, fit, yaw = 0 }: { id: ModelId; fit: number; yaw?: number }) {
  const scene = useModel(id)
  const { scale, offset } = useMemo(() => {
    scene.updateMatrixWorld(true)
    const box = new Box3().setFromObject(scene)
    const size = box.getSize(new Vector3())
    const c = box.getCenter(new Vector3())
    const s = fit / Math.max(size.x, size.z, 0.0001)
    return { scale: s, offset: new Vector3(-c.x * s, -box.min.y * s, -c.z * s) }
  }, [scene, fit])
  useLayoutEffect(() => {
    scene.traverse((o) => {
      if (o instanceof Mesh) {
        o.receiveShadow = true
      }
    })
  }, [scene])
  return (
    <group rotation={[0, yaw, 0]}>
      <primitive object={scene} scale={scale} position={offset} />
    </group>
  )
}

interface BoxProps {
  w: number
  d: number
  h: number
  color: string
  roof: string
}

/** The simple stylised block every procedural building starts from: body, roof slab, window band */
function Block({ w, d, h, color, roof }: BoxProps) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.15, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 0.3, d + 0.4]} />
        <meshStandardMaterial color={roof} roughness={0.8} />
      </mesh>
      <mesh position={[0, h * 0.62, d / 2 + 0.01]}>
        <boxGeometry args={[w * 0.8, 0.5, 0.04]} />
        <meshStandardMaterial color="#3a4a5c" emissive="#9fd4ff" emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

function Procedural({ id, w, d }: { id: RoomId; w: number; d: number }) {
  switch (id) {
    case 'briefing':
      return (
        <group>
          <Block w={w} d={d} h={2.8} color="#e9d9b8" roof="#b5533c" />
          <mesh position={[w / 2 - 0.5, 4.3, -d / 2 + 0.5]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
            <meshStandardMaterial color="#d9d9d9" />
          </mesh>
          <mesh position={[w / 2 - 0.1, 5.1, -d / 2 + 0.5]}>
            <boxGeometry args={[0.7, 0.45, 0.03]} />
            <meshStandardMaterial color="#d04a3a" />
          </mesh>
        </group>
      )
    case 'science-lab':
      return (
        <group>
          <Block w={w} d={d} h={3} color="#dfeaf0" roof="#4a8a9a" />
          <mesh position={[-w / 4, 3.6, 0]} castShadow>
            <sphereGeometry args={[1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#f4f7fa" roughness={0.5} />
          </mesh>
        </group>
      )
    case 'thermal-vac':
      return (
        <group>
          <mesh position={[0, 1.7, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[1.7, 1.7, w, 24]} />
            <meshStandardMaterial color="#b9c3cc" metalness={0.4} roughness={0.45} />
          </mesh>
          <mesh position={[0, 1.7, d / 2 - 0.8]} castShadow>
            <cylinderGeometry args={[0.8, 0.8, 0.3, 20]} />
            <meshStandardMaterial color="#5d7a8c" emissive="#62d0ff" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0.3, 0]} receiveShadow>
            <boxGeometry args={[w - 0.4, 0.6, d - 1.6]} />
            <meshStandardMaterial color="#6c737a" />
          </mesh>
        </group>
      )
    case 'flight-dynamics':
      return (
        <group>
          <Block w={w} d={d} h={2.6} color="#d8d4e8" roof="#6a5fa0" />
          <mesh position={[w / 4, 3.4, 0]} rotation={[-0.9, 0, 0]} castShadow>
            <coneGeometry args={[1.1, 0.5, 20]} />
            <meshStandardMaterial color="#f0f0f5" />
          </mesh>
          <mesh position={[w / 4, 3.1, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.8, 6]} />
            <meshStandardMaterial color="#8a8aa0" />
          </mesh>
        </group>
      )
    default:
      return <Block w={w} d={d} h={3} color="#cfcfd2" roof="#777" />
  }
}

interface ModelSpec {
  id: ModelId
  fit: number
  yaw?: number
  base: string
}

const MODEL_FOR: Partial<Record<RoomId, ModelSpec>> = {
  'launch-hangar': { id: 'model.env-vab', fit: 6.2, yaw: Math.PI / 2, base: '#c9c4b8' },
  'ground-station': { id: 'model.env-dsn-34m', fit: 5, base: '#cfd2c4' },
  'mission-control': { id: 'model.env-jsc-mcc', fit: 6.2, base: '#d4d0c6' },
  'clean-room': { id: 'model.env-cleanroom-oru', fit: 5.2, base: '#d8dde0' },
}

const FALLBACK_COLOR: Partial<Record<RoomId, [string, string]>> = {
  'launch-hangar': ['#e8e6e0', '#8a8f99'],
  'ground-station': ['#e6e0d2', '#8a7f6a'],
  'mission-control': ['#d6dce6', '#5a6a86'],
  'clean-room': ['#f0f4f6', '#7aa6b4'],
}

/** Building visual in its local frame: front face toward +z, centred on the footprint */
export function BuildingModel({ id, size }: { id: RoomId; size: [number, number] }) {
  const [w, d] = size
  const spec = MODEL_FOR[id]
  const pad = (
    <mesh position={[0, 0.04, 0]} receiveShadow>
      <boxGeometry args={[w + 0.8, 0.08, d + 0.8]} />
      <meshStandardMaterial color={spec?.base ?? '#c9c6bd'} roughness={1} />
    </mesh>
  )
  if (!spec) {
    return (
      <group>
        {pad}
        <Procedural id={id} w={w} d={d} />
      </group>
    )
  }
  const [c, r] = FALLBACK_COLOR[id] ?? ['#ccc', '#777']
  return (
    <group>
      {pad}
      <group position={[0, 0.08, 0]}>
        <ModelBoundary fallback={<Block w={w} d={d} h={3} color={c} roof={r} />}>
          <Suspense fallback={<Block w={w} d={d} h={3} color={c} roof={r} />}>
            <FitModel id={spec.id} fit={spec.fit} yaw={spec.yaw} />
          </Suspense>
        </ModelBoundary>
      </group>
    </group>
  )
}
