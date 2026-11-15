import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { audio } from '../../assets/audio'
import { useModel } from '../../assets/models'
import { useGameStore } from '../../state/gameStore'
import { normalizeRocket, rocketStats } from '../../viz/rocket/rocketView'
import { useInsidePlaying } from '../../ui/interaction/insideStore'
import { useInsidePath, type CamKey } from '../interaction/InsideCam'
import { useJuice } from '../interaction/snap'
import { CubeSat, Earth, Effects, prefersReducedMotion, Starfield, Sun } from '../space'
import { craftOffset } from './ascentShots'

class ModelBoundary extends Component<{ fallback?: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}

function SafeModel({ id, position, rotation }: { id: Parameters<typeof useModel>[0]; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const root = useModel(id)
  return (
    <group position={position} rotation={rotation}>
      <primitive object={root} />
    </group>
  )
}

function fairingKeys(engineScale: number): CamKey[] {
  return [
    { t: 0, pos: [0.32, 0.42, 0.38], target: [0, 0.14, 0], fov: 44, caption: 'T-minus 5… inside the payload fairing beside your 6U deployer.', shake: 0 },
    { t: 2.0, pos: [0.3, 0.4, 0.36], target: [0, 0.14, 0], fov: 45, caption: 'Ignition and liftoff — vibrations climb through the adapter ring.', shake: 0.012 * engineScale },
    { t: 4.5, pos: [0.28, 0.38, 0.34], target: [0, 0.14, 0], fov: 47, caption: 'Max-Q — maximum aerodynamic pressure on the fairing.', shake: 0.024 * engineScale },
    { t: 6.2, pos: [0.32, 0.42, 0.38], target: [0, 0.14, 0], fov: 45, caption: 'MECO and stage separation.', shake: 0.004 },
    { t: 7.5, pos: [0.46, 0.56, 0.54], target: [0, 0.14, 0], fov: 50, caption: 'Fairing separation — Earth and sunlight flood the bay.', shake: 0.002 },
    { t: 9.2, pos: [0.58, 0.64, 0.72], target: [0, 0.38, 0.32], fov: 46, caption: 'Deployer door opens — CubeSat free, panels deploying.', shake: 0 },
    { t: 11.0, pos: [0.64, 0.7, 0.85], target: [0, 0.48, 0.45], fov: 44, caption: 'Orbital separation complete.', shake: 0 },
  ]
}

/** Motes shaken loose inside the fairing during ignition and Max-Q */
function FairingDust({ elapsed }: { elapsed: React.RefObject<number> }) {
  const juice = useJuice()
  const N = 45
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const arr = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      arr[i * 3] = ((i * 73) % 100) / 100 - 0.5
      arr[i * 3 + 1] = ((i * 37) % 100) / 80 - 0.2
      arr[i * 3 + 2] = ((i * 53) % 100) / 100 - 0.5
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [])
  const mat = useMemo(() => new THREE.PointsMaterial({ color: '#ede6d6', size: 0.01, transparent: true, opacity: 0, depthWrite: false }), [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame((st) => {
    const t = elapsed.current
    if (!juice || t < 2 || t > 7.5) {
      mat.opacity = 0
      return
    }
    mat.opacity = t > 4.5 && t < 6.4 ? 0.55 : 0.28
    geo.attributes.position.needsUpdate = false
    const a = st.clock.elapsedTime
    mat.size = 0.008 + 0.003 * Math.sin(a * 12)
  })
  return <points geometry={geo} material={mat} />
}

function FairingStage({ engineScale }: { engineScale: number }) {
  const keys = useMemo(() => fairingKeys(engineScale), [engineScale])
  const elapsed = useInsidePath('fairing-ride', keys, { still: 5, endAfterS: 11 })
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const clock = useRef(0)
  useFrame(() => {
    clock.current = reduced ? 9.5 : elapsed.current
  })
  return <FairingBay clock={clock} sounds dust={elapsed} />
}

/**
 * The payload bay on its own clock (`clock.current`, seconds; the halves open at 7.5 and the deployer
 * at 9.1): separation ring, 6U deployer, fairing halves, Earth, and the player's CubeSat with the
 * parts they packed. The Rocket screen's preview drives it from its look-inside path; the launch
 * ascent (Ascent.tsx) drives it from the mission clock with its own sounds (`sounds` false).
 */
export function FairingBay({
  clock,
  sounds = false,
  wingsAt = 9.5,
  dust,
}: {
  clock: React.RefObject<number>
  sounds?: boolean
  /** Bay time at which the solar wings unfold */
  wingsAt?: number
  dust?: React.RefObject<number>
}) {
  const design = useGameStore((s) => s.design)

  const leftHalf = useRef<THREE.Group>(null)
  const rightHalf = useRef<THREE.Group>(null)
  const deployerClosed = useRef<THREE.Group>(null)
  const deployerOpen = useRef<THREE.Group>(null)
  const craftGroup = useRef<THREE.Group>(null)
  const bayLight = useRef<THREE.PointLight>(null)
  const sunFlood = useRef<THREE.DirectionalLight>(null)
  const live = useRef({ burn: 0, deploy: 0 })
  const cues = useRef({ countdown: false, ignition: false, staging: false, sep: false, deploy: false })

  useEffect(() => {
    cues.current = { countdown: false, ignition: false, staging: false, sep: false, deploy: false }
  }, [])

  useFrame(() => {
    const t = clock.current
    if (t < 0) return

    // Audio beats synced to the sequence (once per shot)
    const c = cues.current
    if (sounds && !c.countdown && t >= 0.05) {
      c.countdown = true
      audio.say('voice.countdown')
    }
    if (sounds && !c.ignition && t >= 2.0) {
      c.ignition = true
      audio.play('sfx.ignition')
      // Liftoff is said at ignition, never at deployment
      audio.say('voice.liftoff')
    }
    if (sounds && !c.staging && t >= 6.2) {
      c.staging = true
      audio.play('sfx.snap')
    }
    if (sounds && !c.sep && t >= 7.5) {
      c.sep = true
      audio.play('sfx.reveal')
    }
    if (sounds && !c.deploy && t >= 9.15) {
      c.deploy = true
      audio.play('sfx.go')
    }

    // Fairing separation after t = 7.5s
    const sep = Math.max(0, Math.min(1, (t - 7.5) / 1.8))
    const easeSep = sep * sep * (3 - 2 * sep)
    if (leftHalf.current) {
      leftHalf.current.position.set(-easeSep * 0.9, -0.7 - easeSep * 0.4, -easeSep * 0.3)
      leftHalf.current.rotation.set(0, 0, easeSep * 0.55)
      leftHalf.current.visible = sep < 0.99
    }
    if (rightHalf.current) {
      rightHalf.current.position.set(easeSep * 0.9, -0.7 - easeSep * 0.4, easeSep * 0.3)
      rightHalf.current.rotation.set(0, Math.PI, -easeSep * 0.55)
      rightHalf.current.visible = sep < 0.99
    }

    // Sunlight sweeps across the bay once the halves peel away
    if (bayLight.current) bayLight.current.intensity = t >= 7.5 ? 0.5 : 2.6
    if (sunFlood.current) sunFlood.current.intensity = t >= 7.5 ? 4.2 * Math.min(1, (t - 7.4) / 0.8) : 0.05

    // Deployer door opens at t = 9.1s, CubeSat springs out tumbling and unfolds wings
    const deployed = t >= 9.1
    if (deployerClosed.current) deployerClosed.current.visible = !deployed
    if (deployerOpen.current) deployerOpen.current.visible = deployed

    const springT = Math.max(0, t - 9.2)
    live.current.deploy = t >= wingsAt ? 1 : 0
    if (craftGroup.current) {
      craftGroup.current.visible = deployed
      craftGroup.current.position.set(...craftOffset(t))
      craftGroup.current.rotation.set(springT * 0.24, springT * 0.45, springT * 0.12)
    }
  })

  return (
    <>
      <Starfield brightness={1.15} />
      <Sun intensity={3.4} />
      <ambientLight intensity={0.22} color="#c5d2e0" />
      <pointLight ref={bayLight} position={[0.15, 0.55, 0.25]} intensity={2.6} distance={4} color="#e8a33d" />
      <directionalLight ref={sunFlood} position={[4, 2, 3]} intensity={0.05} color="#fff7e8" />

      {/* Earth positioned below/behind the payload bay so opening the fairing reveals the blue planet */}
      <group position={[-0.6, -15.4, -4.5]}>
        <Earth radius={14} spin={0.008} />
      </group>

      {/* Separation ring + 6U deployer */}
      <ModelBoundary>
        <Suspense fallback={null}>
          <SafeModel id="model.sc-separation_ring" position={[0, 0, 0]} />
          <group ref={deployerClosed}>
            <SafeModel id="model.sc-deployer_6u_closed" position={[0, 0.12, 0]} />
          </group>
          <group ref={deployerOpen} visible={false}>
            <SafeModel id="model.sc-deployer_6u_open" position={[0, 0.12, 0]} />
          </group>
          <group ref={leftHalf} position={[0, -0.7, 0]}>
            <SafeModel id="model.sc-fairing_half" />
          </group>
          <group ref={rightHalf} position={[0, -0.7, 0]} rotation={[0, Math.PI, 0]}>
            <SafeModel id="model.sc-fairing_half" />
          </group>
        </Suspense>
      </ModelBoundary>

      {/* The player's CubeSat springing out of the open deployer */}
      <group ref={craftGroup} position={[0, 0.14, 0.16]} visible={false}>
        <ModelBoundary>
          <Suspense fallback={null}>
            <CubeSat design={design} live={live} scale={0.92} />
          </Suspense>
        </ModelBoundary>
      </group>

      {dust && <FairingDust elapsed={dust} />}
    </>
  )
}

/**
 * The ride inside the launch fairing: countdown, ignition shake, Max-Q, staging, fairing separation
 * flooding the frame with Earth, and CubeSat deployment. Plays on Rocket ("Board") and at real launch.
 */
export function FairingRide() {
  const playing = useInsidePlaying('fairing-ride')
  const rocket = useGameStore((s) => s.design.rocket)
  const engineScale = useMemo(() => {
    const stats = rocketStats(normalizeRocket(rocket).config)
    return Math.min(1.6, 0.8 + stats.engines * 0.08 + stats.boosters * 0.05)
  }, [rocket])

  if (!playing) return null
  return (
    <div data-testid="fairing-ride-overlay" className="fixed inset-0 z-[120] bg-ink-0">
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 44, position: [0.32, 0.42, 0.38], near: 0.02, far: 120 }}
        gl={{ antialias: true }}
        onCreated={({ scene, gl }) => {
          scene.background = new THREE.Color('#07090d')
          const pmrem = new THREE.PMREMGenerator(gl)
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
          scene.environmentIntensity = 0.45
          pmrem.dispose()
        }}
      >
        <FairingStage engineScale={engineScale} />
        <Effects preset="space" />
      </Canvas>
    </div>
  )
}
