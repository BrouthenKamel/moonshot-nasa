import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useGameStore } from '../state/gameStore'
import {
  getPartById,
  type SolarPart,
  type PropulsionPart,
} from '../data/parts'

function CubeSatBus() {
  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.1, 0.2, 0.3]} />
      <meshStandardMaterial color="#4a5568" />
    </mesh>
  )
}

function SolarPanel({ position, rotation, deployed }: { position: [number, number, number]; rotation: [number, number, number]; deployed: boolean }) {
  const scale = deployed ? 1 : 0.1

  return (
    <mesh position={position} rotation={rotation} scale={[scale, 1, 1]}>
      <boxGeometry args={[0.15, 0.002, 0.08]} />
      <meshStandardMaterial color="#1e40af" />
    </mesh>
  )
}

function Thruster({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.01, 0.015, 0.03, 8]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
  )
}

function Antenna({ position, highGain }: { position: [number, number, number]; highGain: boolean }) {
  if (highGain) {
    return (
      <group position={position}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.005, 16]} />
          <meshStandardMaterial color="#d4d4d4" />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <cylinderGeometry args={[0.003, 0.003, 0.04, 8]} />
          <meshStandardMaterial color="#737373" />
        </mesh>
      </group>
    )
  }

  return (
    <mesh position={position}>
      <cylinderGeometry args={[0.005, 0.005, 0.03, 8]} />
      <meshStandardMaterial color="#737373" />
    </mesh>
  )
}

function Instrument({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.03, 0.03, 0.05]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function SpacecraftModel() {
  const design = useGameStore((s) => s.design)

  const solar = getPartById(design.solar) as SolarPart | undefined
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const isDeployable = solar?.deployable ?? false
  const hasHighGain = design.radio === 'radio-xband'
  const isElectric = propulsion?.type === 'electric'

  const instrumentColors = useMemo(() => {
    const colors: Record<string, string> = {
      'inst-ir-spec': '#dc2626',
      'inst-laser': '#16a34a',
      'inst-camera': '#2563eb',
      'inst-neutron': '#9333ea',
    }
    return design.instruments.map((id) => colors[id] ?? '#737373')
  }, [design.instruments])

  return (
    <group>
      {/* Main bus */}
      <CubeSatBus />

      {/* Solar panels */}
      {isDeployable ? (
        <>
          <SolarPanel position={[0.12, 0, 0]} rotation={[0, 0, 0]} deployed={true} />
          <SolarPanel position={[-0.12, 0, 0]} rotation={[0, 0, 0]} deployed={true} />
        </>
      ) : (
        <>
          <mesh position={[0.051, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.19, 0.002, 0.09]} />
            <meshStandardMaterial color="#1e40af" />
          </mesh>
          <mesh position={[-0.051, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.19, 0.002, 0.09]} />
            <meshStandardMaterial color="#1e40af" />
          </mesh>
        </>
      )}

      {/* Thruster */}
      <Thruster position={[0, -0.11, 0]} />
      {isElectric && (
        <mesh position={[0, -0.13, 0]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial color="#60a5fa" emissive="#60a5fa" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* Antenna */}
      <Antenna position={[0, 0.11, 0]} highGain={hasHighGain} />

      {/* Instruments */}
      {instrumentColors.map((color, i) => (
        <Instrument
          key={i}
          position={[0, 0, 0.15 + i * 0.04]}
          color={color}
        />
      ))}
    </group>
  )
}

export function SpacecraftView() {
  return (
    <div className="h-64 w-full rounded-lg bg-slate-900">
      <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-500">Loading 3D view...</div>}>
        <Canvas camera={{ position: [0.4, 0.3, 0.4], fov: 50 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <SpacecraftModel />
          <OrbitControls enableZoom={true} enablePan={false} />
        </Canvas>
      </Suspense>
    </div>
  )
}
