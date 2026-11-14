import { Blinker, Flag, Spin } from './Animated'

/**
 * Agency Headquarters: an office block with a glass tower, a rooftop radar, a beacon
 * and a flag. Same palette as the other base buildings (BaseMap.tsx).
 */

const WALL = '#eef1f6'
const ROOF = '#2c3e6b'
const GLASS = '#5aa9e6'
const ACCENT = '#f28c28'
const CONCRETE = '#c9ccd1'

/** Footprint on the map grid: first tile and size */
export const HQ_TILE: [number, number] = [15, 10]
export const HQ_SIZE: [number, number] = [4, 4]
/** How tall the model is, so its label floats above it */
export const HQ_LABEL_HEIGHT = 3.6

export function Headquarters() {
  return (
    <group>
      {/* Plaza */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[3.8, 0.1, 3.8]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>

      {/* Low wing */}
      <mesh position={[0.3, 0.6, 0.5]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 0.9, 1.9]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[0.3, 1.09, 0.5]} castShadow>
        <boxGeometry args={[2.95, 0.08, 2.05]} />
        <meshStandardMaterial color={ROOF} />
      </mesh>
      <mesh position={[0.3, 0.62, 1.46]}>
        <boxGeometry args={[2.5, 0.42, 0.02]} />
        <meshStandardMaterial color={GLASS} emissive={GLASS} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[1.71, 0.62, 0.5]}>
        <boxGeometry args={[0.02, 0.42, 1.5]} />
        <meshStandardMaterial color={GLASS} emissive={GLASS} emissiveIntensity={0.18} />
      </mesh>
      {/* Entrance canopy */}
      <mesh position={[0.3, 0.42, 1.75]} castShadow>
        <boxGeometry args={[0.9, 0.05, 0.5]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>

      {/* Glass tower */}
      <group position={[-0.7, 0, -0.7]}>
        <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.4, 2.7, 1.4]} />
          <meshStandardMaterial color="#cfe3f5" metalness={0.2} roughness={0.25} />
        </mesh>
        {/* Floor lines */}
        {[0.75, 1.3, 1.85, 2.4].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[1.43, 0.05, 1.43]} />
            <meshStandardMaterial color={WALL} />
          </mesh>
        ))}
        <mesh position={[0, 2.85, 0]} castShadow>
          <boxGeometry args={[1.5, 0.1, 1.5]} />
          <meshStandardMaterial color={ROOF} />
        </mesh>
        {/* Rooftop radar, turning */}
        <mesh position={[0.35, 3.0, 0.35]}>
          <cylinderGeometry args={[0.05, 0.07, 0.25, 8]} />
          <meshStandardMaterial color="#6b717a" />
        </mesh>
        <Spin position={[0.35, 3.15, 0.35]} rpm={10}>
          <mesh>
            <boxGeometry args={[0.6, 0.12, 0.04]} />
            <meshStandardMaterial color="#e8ebef" />
          </mesh>
        </Spin>
        {/* Antenna with a beacon */}
        <mesh position={[-0.4, 3.25, -0.4]}>
          <cylinderGeometry args={[0.02, 0.02, 0.8, 6]} />
          <meshStandardMaterial color="#6b717a" />
        </mesh>
        <Blinker position={[-0.4, 3.68, -0.4]} phase={0.4} />
      </group>

      {/* Flags in front */}
      <Flag position={[1.5, 0.15, 1.6]} />
      <Flag position={[1.1, 0.15, 1.6]} color="#14213d" />

      {/* Planters */}
      {[
        [-1.5, 1.4],
        [-0.9, 1.6],
      ].map(([x, z]) => (
        <group key={x} position={[x, 0.15, z]}>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.35, 0.2, 0.35]} />
            <meshStandardMaterial color="#a7aeb8" />
          </mesh>
          <mesh position={[0, 0.38, 0]} castShadow>
            <icosahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial color="#4ea644" flatShading />
          </mesh>
        </group>
      ))}
    </group>
  )
}
