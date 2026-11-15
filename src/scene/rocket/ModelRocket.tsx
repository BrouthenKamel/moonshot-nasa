import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { useModel } from '../../assets/models'
import type { RocketConfig } from '../../data/rocket'
import type { Vec3 } from '../../data/craftKit'
import { layoutRocket, type PlacedPart } from '../../viz/rocket/rocketView'

/**
 * The launch rocket as a scale model on a plinth: context in the clean room while the craft is
 * built, so the player sees what it will ride in. Static: no picking, no tags. Built from the same
 * kit parts and layoutRocket() as the rocket hall, shrunk to `heightM` metres tall.
 */
/** Render order of a model drawn over the scene: after everything else that is opaque */
const ON_TOP = 999

function Part({ placed, onTop }: { placed: PlacedPart; onTop: boolean }) {
  const root = useModel(placed.part.model!)
  useMemo(() => {
    root.traverse((o) => {
      o.renderOrder = onTop ? ON_TOP : 0
    })
  }, [root, onTop])
  return (
    <group position-y={placed.y}>
      <primitive object={root} />
    </group>
  )
}

/** An invisible speck that wipes the depth buffer just before the on-top model draws, so nothing in the room hides it */
function DepthWipe() {
  const geo = useMemo(() => new THREE.PlaneGeometry(1e-4, 1e-4), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), [])
  return (
    <mesh
      geometry={geo}
      material={mat}
      renderOrder={ON_TOP - 1}
      frustumCulled={false}
      onBeforeRender={(renderer) => renderer.clearDepth()}
    />
  )
}

export function ModelRocket({
  config,
  position,
  heightM = 1.5,
  onTop = false,
}: {
  config: RocketConfig
  position: Vec3
  heightM?: number
  /** Draw over everything else in the scene (for a model held in front of the camera) */
  onTop?: boolean
}) {
  const layout = useMemo(() => layoutRocket(config), [config])
  const plinth = heightM * 0.07
  const k = heightM / layout.heightUnits
  return (
    <group position={position}>
      {onTop && <DepthWipe />}
      <mesh position-y={plinth / 2} castShadow receiveShadow renderOrder={onTop ? ON_TOP : 0}>
        <cylinderGeometry args={[heightM * 0.15, heightM * 0.17, plinth, 32]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.6} metalness={0.3} />
      </mesh>
      <group position-y={plinth - layout.bottom * k} scale={k}>
        {layout.placed.map((p) => (
          <Suspense key={`${p.slot}:${p.part.id}`} fallback={null}>
            <Part placed={p} onTop={onTop} />
          </Suspense>
        ))}
      </group>
    </group>
  )
}
