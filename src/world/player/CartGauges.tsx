import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ResourceId, ResourcePip, ResourceTone } from '../hud/resources'
import { useResourcePips } from '../hud/useResourcePips'

/** Same tones as the strip (index.css --color-go / caution / nogo) */
const TONE_HEX: Record<ResourceTone, string> = { go: '#6faf7a', caution: '#d9b23f', nogo: '#d0533f' }

type Unlocked = Extract<ResourcePip, { unlocked: true }>

/**
 * The craft-status strip made physical on the cart: a mass scale, a power glow, a coin stack,
 * a data tape reel, an antenna and an hourglass. Each one appears when its pip unlocks.
 * They stand on a small shelf at the cart's front, in two rows of three, because the CubeSat's
 * deployed solar wings cover the deck itself. Cart-local coordinates: the deck top is y ≈ 0.19,
 * the deck is 0.46 wide and ends at z = 0.39; the shelf runs from there to z ≈ 0.7.
 */
export function CartGauges() {
  const pips = useResourcePips()
  const on = (id: ResourceId) => pips.find((p): p is Unlocked => p.id === id && p.unlocked)
  const mass = on('mass')
  const power = on('power')
  const budget = on('budget')
  const data = on('data')
  const comms = on('comms')
  const time = on('time')
  return (
    <group>
      <mesh position={[0, 0.165, 0.545]} castShadow>
        <boxGeometry args={[0.48, 0.04, 0.3]} />
        <meshStandardMaterial color="#3a4254" metalness={0.4} roughness={0.5} />
      </mesh>
      {mass && <MassScale pip={mass} />}
      {power && <PowerGlow pip={power} />}
      {budget && <CoinStack pip={budget} />}
      {data && <TapeReel pip={data} />}
      {comms && <Antenna pip={comms} />}
      {time && <Hourglass pip={time} />}
    </group>
  )
}

const DECK = 0.185
/** Toy scale: at campus camera distance the cart is ~25 px wide, so true-size gauges would vanish */
const TOY = 1.8

/** Front of the cart: a little dial whose needle swings with mass against the ride limit */
function MassScale({ pip }: { pip: Unlocked }) {
  const angle = (0.5 - pip.level) * Math.PI * 0.9
  return (
    <group position={[-0.15, DECK, 0.62]} name="gauge-mass" scale={TOY}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.09, 0.06, 0.04]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.035, 0.021]} rotation={[0, 0, angle]}>
        <boxGeometry args={[0.006, 0.05, 0.004]} />
        <meshStandardMaterial color={TONE_HEX[pip.tone]} />
      </mesh>
    </group>
  )
}

/** A glowing bulb on the right rail: steady when there is margin, flickering when not */
function PowerGlow({ pip }: { pip: Unlocked }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (!mat.current) return
    const t = clock.elapsedTime
    const flicker = pip.tone === 'go' ? 0.15 * Math.sin(t * 2) : 0.6 * Math.abs(Math.sin(t * 11))
    mat.current.emissiveIntensity = 0.8 + flicker + pip.level
  })
  return (
    <mesh position={[0, DECK + 0.06, 0.62]} name="gauge-power" scale={TOY}>
      <sphereGeometry args={[0.03, 16, 12]} />
      <meshStandardMaterial ref={mat} color={TONE_HEX[pip.tone]} emissive={TONE_HEX[pip.tone]} toneMapped={false} />
    </mesh>
  )
}

/** Coins on the left front corner: up to five, one per fifth of the budget still free */
function CoinStack({ pip }: { pip: Unlocked }) {
  const coins = Math.max(pip.tone === 'nogo' ? 0 : 1, Math.round(pip.level * 5))
  return (
    <group position={[0.15, DECK, 0.62]} name="gauge-budget" scale={TOY}>
      {Array.from({ length: coins }, (_, i) => (
        <mesh key={i} position={[0, 0.008 + i * 0.016, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.014, 18]} />
          <meshStandardMaterial color={pip.tone === 'go' ? '#e8a33d' : TONE_HEX[pip.tone]} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/** A tape reel on the left rail: it spins faster the more data the instruments make */
function TapeReel({ pip }: { pip: Unlocked }) {
  const reel = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (reel.current) reel.current.rotation.x += dt * (0.5 + pip.level * 6)
  })
  return (
    <group position={[-0.15, DECK + 0.1, 0.47]} name="gauge-data" scale={TOY}>
      <group ref={reel} rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.055, 0.02, 20]} />
          <meshStandardMaterial color="#2a3040" metalness={0.3} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.02 + 0.033 * pip.level, 0.02 + 0.033 * pip.level, 0.024, 20]} />
          <meshStandardMaterial color="#5a4632" roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

/** An antenna mast at the back with a tip that blinks in the link's colour */
function Antenna({ pip }: { pip: Unlocked }) {
  const tip = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (tip.current) tip.current.emissiveIntensity = (Math.sin(clock.elapsedTime * 4) > 0 ? 1.4 : 0.3) * (0.4 + pip.level)
  })
  return (
    <group position={[0, DECK, 0.47]} name="gauge-comms" scale={TOY}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.24, 8]} />
        <meshStandardMaterial color="#b9b2a3" metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.2, 0.02]} rotation={[-Math.PI / 3, 0, 0]}>
        <coneGeometry args={[0.045, 0.025, 18, 1, true]} />
        <meshStandardMaterial color="#ede6d6" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial ref={tip} color={TONE_HEX[pip.tone]} emissive={TONE_HEX[pip.tone]} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** An hourglass at the back left: the top bulb holds the months of slack before the ride */
function Hourglass({ pip }: { pip: Unlocked }) {
  const top = 0.02 + 0.03 * pip.level
  const bottom = 0.05 - 0.03 * pip.level
  return (
    <group position={[0.15, DECK, 0.47]} name="gauge-time" scale={TOY}>
      {[0, 0.12].map((y) => (
        <mesh key={y} position={[0, y + 0.005, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.01, 14]} />
          <meshStandardMaterial color="#9a6b26" />
        </mesh>
      ))}
      <mesh position={[0, 0.09, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.028, 0.055, 14, 1, true]} />
        <meshStandardMaterial color="#cfe9ee" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.035, 0]}>
        <coneGeometry args={[0.028, 0.055, 14, 1, true]} />
        <meshStandardMaterial color="#cfe9ee" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* sand: top shrinks as the slack runs out, bottom grows */}
      <mesh position={[0, 0.065 + top / 2, 0]}>
        <cylinderGeometry args={[0.016, 0.004, top, 10]} />
        <meshStandardMaterial color={TONE_HEX[pip.tone]} />
      </mesh>
      <mesh position={[0, 0.01 + bottom / 2, 0]}>
        <cylinderGeometry args={[0.004, 0.02, bottom, 10]} />
        <meshStandardMaterial color={TONE_HEX[pip.tone]} />
      </mesh>
    </group>
  )
}
