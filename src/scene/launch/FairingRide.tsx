import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { audio } from '../../assets/audio'
import { useModel } from '../../assets/models'
import { useGameStore } from '../../state/gameStore'
import { normalizeRocket, rocketStats } from '../../viz/rocket/rocketView'
import { useInsidePlaying } from '../../ui/interaction/insideStore'
import { useInsidePath } from '../interaction/InsideCam'
import { fairingHalfPose, fairingKeys, separation, SEP_START } from './fairingShot'
import { useJuice } from '../interaction/snap'
import { CubeSat, Earth, Effects, prefersReducedMotion, Starfield, Sun } from '../space'

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

/**
 * The fairing's inside is white paint and pale acoustic foam, lit from a hand's width away: on the
 * broadcast it read as a white-out (Integration review, 15 Nov). The shell keeps its own materials, so
 * the Craft screen's fairing stays as it is, and takes them down to a readable grey.
 */
export const FAIRING_SHELL_TONE = 0.42

function FairingShell() {
  const source = useModel('model.sc-fairing_half')
  const root = useMemo(() => {
    const shell = source.clone(true)
    shell.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const dim = (m: THREE.Material) => {
        const c = m.clone()
        if (c instanceof THREE.MeshStandardMaterial) {
          c.color.multiplyScalar(FAIRING_SHELL_TONE)
          c.envMapIntensity = 0.35
          c.roughness = Math.max(c.roughness, 0.85)
        }
        return c
      }
      o.material = Array.isArray(o.material) ? o.material.map(dim) : dim(o.material)
    })
    return shell
  }, [source])
  useEffect(
    () => () =>
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
      }),
    [root],
  )
  return <primitive object={root} />
}

const BAY_LIGHT = 0.9
const SUN_FLOOD = 1.6

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
  const design = useGameStore((s) => s.design)
  const keys = useMemo(() => fairingKeys(engineScale), [engineScale])
  const elapsed = useInsidePath('fairing-ride', keys, { still: 5, endAfterS: 11 })
  const reduced = useMemo(() => prefersReducedMotion(), [])

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
    const t = reduced ? 9.5 : elapsed.current
    if (t < 0) return

    // Audio beats synced to the sequence (once per shot). A shot that joins part-way (the launch
    // after the island's liftoff) passes the beats it starts after without playing them.
    const c = cues.current
    const beat = (key: keyof typeof c, at: number, play: () => void) => {
      if (c[key] || t < at) return
      c[key] = true
      if (t < at + 0.6) play()
    }
    beat('countdown', 0.05, () => audio.say('voice.countdown'))
    beat('ignition', 2.0, () => audio.play('sfx.ignition'))
    beat('staging', 6.2, () => audio.play('sfx.snap'))
    beat('sep', 7.5, () => audio.play('sfx.reveal'))
    // The CubeSat leaves the deployer: a chime only (the liftoff call belongs to the pad, which the
    // launch now shows first on the island)
    beat('deploy', 9.15, () => audio.play('sfx.go'))

    // Fairing separation after t = 7.5s
    const easeSep = separation(t)
    const sep = easeSep
    if (leftHalf.current) {
      const p = fairingHalfPose(easeSep, -1)
      leftHalf.current.position.set(...p.position)
      leftHalf.current.rotation.set(0, 0, -p.rotationZ)
      leftHalf.current.visible = sep < 0.99
    }
    if (rightHalf.current) {
      const p = fairingHalfPose(easeSep, 1)
      rightHalf.current.position.set(...p.position)
      rightHalf.current.rotation.set(0, Math.PI, -p.rotationZ)
      rightHalf.current.visible = sep < 0.99
    }

    // Sunlight sweeps across the bay once the halves peel away
    // Capped so the white shell and the craft stay readable: the flood was 4.2 and the bay light 2.6
    if (bayLight.current) bayLight.current.intensity = t >= SEP_START ? 0.35 : BAY_LIGHT
    if (sunFlood.current) sunFlood.current.intensity = t >= 7.5 ? SUN_FLOOD * Math.min(1, (t - 7.4) / 0.8) : 0.05

    // Deployer door opens at t = 9.1s, CubeSat springs out tumbling and unfolds wings
    const deployed = t >= 9.1
    if (deployerClosed.current) deployerClosed.current.visible = !deployed
    if (deployerOpen.current) deployerOpen.current.visible = deployed

    const springT = Math.max(0, t - 9.2)
    live.current.deploy = t >= 9.5 ? 1 : 0
    if (craftGroup.current) {
      craftGroup.current.visible = deployed
      craftGroup.current.position.set(0, 0.14 + springT * 0.18, 0.16 + springT * 0.28)
      craftGroup.current.rotation.set(springT * 0.24, springT * 0.45, springT * 0.12)
    }
  })

  return (
    <>
      <Starfield brightness={1.15} />
      <Sun intensity={3.4} />
      <ambientLight intensity={0.22} color="#c5d2e0" />
      <pointLight ref={bayLight} position={[0.15, 0.55, 0.25]} intensity={BAY_LIGHT} distance={4} color="#e8a33d" />
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
            <FairingShell />
          </group>
          <group ref={rightHalf} position={[0, -0.7, 0]} rotation={[0, Math.PI, 0]}>
            <FairingShell />
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

      <FairingDust elapsed={elapsed} />
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
          scene.environmentIntensity = 0.2
          pmrem.dispose()
        }}
      >
        <FairingStage engineScale={engineScale} />
        <Effects preset="space" />
      </Canvas>
    </div>
  )
}
