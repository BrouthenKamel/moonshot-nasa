import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useDragStore } from '../../ui/interaction/dragStore'
import { prefersReducedMotion, useGraphics } from '../space/quality'

type Vec3 = [number, number, number]

/** The snap: a 120 ms ease-in to the anchor */
export const SNAP_MS = 120

/** 0..1 snap progress, ease-in (accelerates into the anchor like a part seating with a click) */
export function snapEase(elapsedMs: number, durationMs = SNAP_MS): number {
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs))
  return t * t * t
}

/** Whether juice (shake, particles, nudges) may play: off under reduced motion and on 'low' quality */
export function useJuice(): boolean {
  const quality = useGraphics((s) => s.quality)
  return useMemo(() => quality !== 'low' && !prefersReducedMotion(), [quality])
}

/**
 * On every good drop the camera dollies 2% toward what it looks at and eases back: a small physical
 * "thunk". Pass the controls' target when there are controls; otherwise the origin.
 */
export function SnapNudge({ target }: { target?: THREE.Vector3 | null }) {
  const juice = useJuice()
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null
  const lastDrop = useDragStore((s) => s.lastDrop)
  const t = useRef(1)
  const applied = useRef(0)
  useEffect(() => {
    if (lastDrop && juice) t.current = 0
  }, [lastDrop, juice])
  useFrame((_, dt) => {
    if (t.current >= 1) return
    t.current = Math.min(1, t.current + dt / 0.35)
    // up fast, back slow: a 2% dolly
    const k = 0.02 * Math.sin(Math.PI * Math.min(1, t.current * 1.6)) * (1 - t.current)
    const to = target ?? controls?.target ?? new THREE.Vector3()
    const dir = new THREE.Vector3().subVectors(to, camera.position)
    const delta = k - applied.current
    camera.position.addScaledVector(dir, delta)
    applied.current = t.current >= 1 ? 0 : k
  })
  return null
}

/**
 * A small dust puff where a part seats: a few paper-coloured motes that drift out and fade. Plays
 * on each good drop on the slots listed (or any slot), at `at`.
 */
export function SnapPuff({ at, slots, scale = 1 }: { at: Vec3; slots?: string[]; scale?: number }) {
  const juice = useJuice()
  const lastDrop = useDragStore((s) => s.lastDrop)
  const N = 26
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    return g
  }, [])
  const dirs = useMemo(() => Array.from({ length: N }, (_, i) => new THREE.Vector3(Math.cos(i * 2.39), 0.25 + ((i * 7) % 5) / 10, Math.sin(i * 2.39)).normalize()), [])
  const mat = useMemo(() => new THREE.PointsMaterial({ color: '#ede6d6', size: 0.006 * scale, transparent: true, opacity: 0, depthWrite: false }), [scale])
  const age = useRef(9)
  useEffect(() => {
    if (!lastDrop || !juice) return
    if (slots && !slots.includes(lastDrop.slotId)) return
    age.current = 0
  }, [lastDrop, juice, slots])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame((_, dt) => {
    if (age.current > 0.7) {
      mat.opacity = 0
      return
    }
    age.current += dt
    const a = age.current
    const arr = geo.attributes.position.array as Float32Array
    const r = (0.02 + a * 0.12) * scale
    dirs.forEach((d, i) => {
      arr[i * 3] = d.x * r
      arr[i * 3 + 1] = d.y * r - a * a * 0.05 * scale
      arr[i * 3 + 2] = d.z * r
    })
    geo.attributes.position.needsUpdate = true
    mat.opacity = Math.max(0, 0.7 * (1 - a / 0.7))
  })
  return <points geometry={geo} material={mat} position={at} />
}

/** Disables the scene's OrbitControls (makeDefault) while a part is held, so dragging never spins the camera */
export function HoldStillWhileDragging() {
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const held = useDragStore((s) => !!s.held)
  useEffect(() => {
    if (!controls) return
    controls.enabled = !held
  }, [controls, held])
  return null
}
