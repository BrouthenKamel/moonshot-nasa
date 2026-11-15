import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useInsideStore } from '../../ui/interaction/insideStore'
import { prefersReducedMotion } from '../space/quality'
import { useJuice } from './snap'

type Vec3 = [number, number, number]

/** One key of a look-inside camera path */
export interface CamKey {
  /** Seconds from the start of the shot */
  t: number
  pos: Vec3
  target: Vec3
  fov?: number
  /** Caption shown from this key on */
  caption?: string
  /** Camera shake amplitude in metres from this key on (0 = still) */
  shake?: number
}

const smooth = (x: number) => x * x * (3 - 2 * x)

/** The pose along a key path at time t (smoothstep between keys; pure, for tests and scenes) */
export function poseAt(keys: CamKey[], t: number): { pos: THREE.Vector3; target: THREE.Vector3; fov: number | undefined; key: number } {
  if (keys.length === 0) return { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: undefined, key: -1 }
  let i = 0
  while (i < keys.length - 1 && keys[i + 1].t <= t) i++
  const a = keys[i]
  const b = keys[Math.min(i + 1, keys.length - 1)]
  const span = b.t - a.t
  const k = span > 0 ? smooth(Math.min(1, Math.max(0, (t - a.t) / span))) : 1
  const pos = new THREE.Vector3(...a.pos).lerp(new THREE.Vector3(...b.pos), k)
  const target = new THREE.Vector3(...a.target).lerp(new THREE.Vector3(...b.target), k)
  const fov = a.fov !== undefined && b.fov !== undefined ? a.fov + (b.fov - a.fov) * k : a.fov
  return { pos, target, fov, key: i }
}

/**
 * The inside-view director, camera side. While the shot `id` plays (see `useInsideStore`), it takes
 * the camera along `keys`, turns off the scene's controls, updates the caption at each key, shakes
 * when a key asks (not on 'low' quality or reduced motion) and ends the shot after the last key.
 * Under reduced motion it holds the `still` key (default: the last) until the player clicks or skips.
 * Returns a ref with the shot's elapsed seconds (-1 when not playing) for the scene's own animation.
 */
export function useInsidePath(id: string, keys: CamKey[], { still, endAfterS }: { still?: number; endAfterS?: number } = {}) {
  const shot = useInsideStore((s) => s.shot)
  const startedAt = useInsideStore((s) => s.startedAt)
  const playing = shot?.id === id
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean; target?: THREE.Vector3; update?: () => void } | null
  const juice = useJuice()
  const reduced = useMemo(() => prefersReducedMotion(), [])
  const elapsed = useRef(-1)
  const lastKey = useRef(-1)
  const saved = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 | null; fov: number } | null>(null)
  const last = keys[keys.length - 1]
  const total = endAfterS ?? (last ? last.t : 0)

  useEffect(() => {
    if (!playing) return
    saved.current = { pos: camera.position.clone(), target: controls?.target?.clone() ?? null, fov: camera.fov }
    if (controls) controls.enabled = false
    lastKey.current = -1
    return () => {
      elapsed.current = -1
      const s = saved.current
      if (s) {
        camera.position.copy(s.pos)
        camera.fov = s.fov
        camera.updateProjectionMatrix()
        if (s.target && controls?.target) controls.target.copy(s.target)
      }
      if (controls) {
        controls.enabled = true
        controls.update?.()
      }
    }
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    if (!playing) return
    const t = reduced ? (keys[still ?? keys.length - 1]?.t ?? 0) : (performance.now() - startedAt) / 1000
    elapsed.current = t
    const { pos, target, fov, key } = poseAt(keys, t)
    if (key !== lastKey.current) {
      lastKey.current = key
      const cap = keys[key]?.caption
      if (cap) useInsideStore.getState().setCaption(cap)
    }
    const amp = juice ? (keys[key]?.shake ?? 0) : 0
    if (amp > 0) pos.add(new THREE.Vector3((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp))
    camera.position.copy(pos)
    camera.lookAt(target)
    // OrbitControls keeps calling update(): point its target along too so it agrees with the shot
    controls?.target?.copy(target)
    if (fov !== undefined && Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    if (!reduced && t >= total) useInsideStore.getState().end(false)
  })
  return elapsed
}
