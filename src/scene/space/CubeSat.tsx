import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { showParts, useModel } from '../../assets'
import type { Design } from '../../sim/types'
import { ease, prefersReducedMotion } from './quality'

let studio: THREE.Texture | null = null

/**
 * Soft studio reflections for the craft's metal only. Space scenes have no ambient light,
 * and metal with nothing to reflect renders black.
 */
function useStudioReflections(model: THREE.Object3D, intensity: number) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!studio) {
      const pmrem = new THREE.PMREMGenerator(gl)
      studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      pmrem.dispose()
    }
    model.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (m && 'envMapIntensity' in m) {
        m.envMap = studio
        m.envMapIntensity = intensity
        m.needsUpdate = true
      }
    })
  }, [gl, model, intensity])
}

/** Part nodes of the model to show for a design (ids from src/data/parts.ts) */
export function craftParts(design: Design): string[] {
  return [design.solar, design.radio, design.propulsion, design.attitude, ...design.instruments]
}

interface CubeSatProps {
  design: Design
  /** 0 = folded for launch, 1 = wings and dish out */
  deploy?: number
  /** Main engine firing: 0..1 */
  burn?: number
  /** Model length is 0.366 m; scale it to the scene */
  scale?: number
  /** Scenes that animate every frame pass burn and deploy here instead, to avoid re-rendering */
  live?: React.RefObject<{ burn: number; deploy: number }>
}

/**
 * The player's 6U CubeSat, showing exactly the parts they chose. +Z is the instrument end,
 * -Z the engine. Wings and dish fold through the model's `pivot_` nodes.
 */
export function CubeSat({ design, deploy = 1, burn = 0, scale = 1, live }: CubeSatProps) {
  const model = useModel('model.cubesat-6u')
  useStudioReflections(model, 0.55)
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const current = useRef(live ? live.current.deploy : deploy)
  const plume = useRef<THREE.Mesh>(null)
  const plumeLight = useRef<THREE.PointLight>(null)
  const burnNow = useRef(0)
  const parts = craftParts(design).join(',')
  const electric = design.propulsion.startsWith('prop-ion')

  useEffect(() => {
    showParts(model, parts.split(','))
  }, [model, parts])

  const pivots = useMemo(() => {
    const list: { node: THREE.Object3D; stowed: THREE.Euler; out: THREE.Euler }[] = []
    model.traverse((o) => {
      const stowed = o.userData.stowed as [number, number, number] | undefined
      if (o.name.startsWith('pivot_') && stowed) list.push({ node: o, stowed: new THREE.Euler(...stowed), out: o.rotation.clone() })
    })
    return list
  }, [model])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const wantDeploy = live ? live.current.deploy : deploy
    const wantBurn = live ? live.current.burn : burn
    current.current += (wantDeploy - current.current) * (reduced ? 1 : ease(dt, 2.2))
    const d = current.current
    for (const p of pivots) {
      p.node.rotation.set(
        p.stowed.x + (p.out.x - p.stowed.x) * d,
        p.stowed.y + (p.out.y - p.stowed.y) * d,
        p.stowed.z + (p.out.z - p.stowed.z) * d,
      )
    }
    burnNow.current += (wantBurn - burnNow.current) * (reduced ? 1 : ease(dt, 6))
    const b = burnNow.current
    const flicker = reduced ? 1 : 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 47)
    if (plume.current) {
      plume.current.visible = b > 0.01
      plume.current.scale.set(b, b * flicker, b)
    }
    if (plumeLight.current) plumeLight.current.intensity = b * 2 * flicker
  })

  const plumeColor = electric ? new THREE.Color(1.2, 3.2, 6) : new THREE.Color(6, 3.4, 1.4)
  return (
    <group scale={scale}>
      <primitive object={model} />
      {/* Engine plume, pointing -Z from the back plate */}
      <mesh ref={plume} position={[0, 0, -0.42]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <coneGeometry args={[0.035, 0.42, 20, 1, true]} />
        <meshBasicMaterial color={plumeColor} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight ref={plumeLight} position={[0, 0, -0.3]} color={electric ? '#7cc4ff' : '#ffb066'} intensity={0} distance={2} />
    </group>
  )
}
