import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'

/** One keyframe of a scripted camera move. `at` is seconds from the start of the sequence. */
export interface Shot {
  at: number
  pos: [number, number, number]
  look: [number, number, number]
  fov: number
  /** Jump to this shot instead of easing into it */
  cut?: boolean
}

export interface CameraPose {
  pos: Vector3
  look: Vector3
  fov: number
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Pose at time t along the shots (sorted by `at`); null once t is past the last shot */
export function sampleShots(shots: readonly Shot[], t: number, out?: CameraPose): CameraPose | null {
  if (shots.length === 0) return null
  const last = shots[shots.length - 1]
  if (t > last.at) return null
  const pose = out ?? { pos: new Vector3(), look: new Vector3(), fov: 40 }
  let i = 0
  while (i < shots.length - 1 && shots[i + 1].at <= t) i++
  const a = shots[i]
  const b = shots[i + 1]
  if (!b || b.cut || t <= a.at) {
    pose.pos.fromArray(a.pos)
    pose.look.fromArray(a.look)
    pose.fov = a.fov
    return pose
  }
  const k = smooth((t - a.at) / (b.at - a.at))
  pose.pos.fromArray(a.pos).lerp(new Vector3().fromArray(b.pos), k)
  pose.look.fromArray(a.look).lerp(new Vector3().fromArray(b.look), k)
  pose.fov = MathUtils.lerp(a.fov, b.fov, k)
  return pose
}

/* ---------------- shot list: fixed shots joined by cuts ---------------- */

/**
 * One shot of a cut-based shot list: it owns the camera from `from` until `to` (seconds on the
 * sequence's own clock, which may start below zero, e.g. T-10). The pose inside a shot comes from
 * the caller's pose function; between shots there is no blending, only a cut.
 */
export interface TimedShot<Id extends string = string> {
  id: Id
  from: number
  to: number
}

/** The shot that owns time t (from <= t < to), or null before the first and from the last one's end */
export function activeShot<S extends TimedShot>(shots: readonly S[], t: number): S | null {
  for (const s of shots) if (t >= s.from && t < s.to) return s
  return null
}

/** Shots cut into while the clock moved from prev to t (prev < from <= t): one sound accent each */
export function cutsBetween<S extends TimedShot>(shots: readonly S[], prev: number, t: number): S[] {
  return shots.filter((s) => s.from > prev && s.from <= t)
}

/** Shots must follow each other with no gap and no overlap (a gap would be a frame with no camera) */
export function isContiguous(shots: readonly TimedShot[]): boolean {
  return shots.every((s, i) => s.to > s.from && (i === 0 || shots[i - 1].to === s.from))
}

/** Critically damped spring step: moves `pos` toward `goal`, carrying `vel` */
export function springStep(pos: Vector3, vel: Vector3, goal: Vector3, dt: number, stiffness = 28) {
  const damping = 2 * Math.sqrt(stiffness)
  const h = Math.min(dt, 1 / 30)
  vel.x += ((goal.x - pos.x) * stiffness - vel.x * damping) * h
  vel.y += ((goal.y - pos.y) * stiffness - vel.y * damping) * h
  vel.z += ((goal.z - pos.z) * stiffness - vel.z * damping) * h
  pos.addScaledVector(vel, h)
}

/** 3/4 top-down: ~35 degrees of pitch looking at the target */
export const CAMERA_PITCH = (35 * Math.PI) / 180
export const CAMERA_DISTANCE = 44
export const CAMERA_FOV = 28
export const CAMERA_OFFSET = new Vector3(0, Math.sin(CAMERA_PITCH), Math.cos(CAMERA_PITCH)).multiplyScalar(
  CAMERA_DISTANCE,
)

export interface ShotSequence {
  start: () => void
  stop: () => void
  /** True while a sequence is driving the camera (the follow rig stands down) */
  playing: { current: boolean }
}

/**
 * Plays a scripted shot sequence on the default camera. Call `start()` to run it; when it ends
 * `onDone` fires and `playing` goes false. Keyframes ease into each other unless marked `cut`; the
 * launch ascent uses the cut-only shot list above (`activeShot` / `cutsBetween`) instead.
 */
export function useShotSequence(shots: readonly Shot[], onDone?: () => void): ShotSequence {
  const camera = useThree((s) => s.camera)
  const playing = useRef(false)
  const clock = useRef(0)
  const pose = useMemo<CameraPose>(() => ({ pos: new Vector3(), look: new Vector3(), fov: 40 }), [])
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  const start = useCallback(() => {
    clock.current = 0
    playing.current = true
  }, [])
  const stop = useCallback(() => {
    playing.current = false
  }, [])

  useFrame((_, dt) => {
    if (!playing.current) return
    clock.current += dt
    const p = sampleShots(shots, clock.current, pose)
    if (!p) {
      playing.current = false
      doneRef.current?.()
      return
    }
    camera.position.copy(p.pos)
    camera.lookAt(p.look)
    if (camera instanceof PerspectiveCamera && camera.fov !== p.fov) {
      camera.fov = p.fov
      camera.updateProjectionMatrix()
    }
  })

  return useMemo(() => ({ start, stop, playing }), [start, stop])
}

/**
 * Follow camera: sits at a fixed 3/4 offset from `getTarget()` and trails it on a spring.
 * Stands down while `sequence.playing` is true.
 */
export function useFollowCamera(getTarget: () => Vector3, sequence?: ShotSequence) {
  const camera = useThree((s) => s.camera)
  const pos = useRef(new Vector3())
  const vel = useRef(new Vector3())
  const look = useRef(new Vector3())
  const lookVel = useRef(new Vector3())
  const goal = useMemo(() => new Vector3(), [])
  const ready = useRef(false)

  useFrame((_, dt) => {
    if (sequence?.playing.current) {
      ready.current = false
      return
    }
    const t = getTarget()
    if (!ready.current) {
      look.current.copy(t)
      pos.current.copy(t).add(CAMERA_OFFSET)
      vel.current.set(0, 0, 0)
      lookVel.current.set(0, 0, 0)
      ready.current = true
    }
    springStep(look.current, lookVel.current, t, dt, 22)
    goal.copy(look.current).add(CAMERA_OFFSET)
    springStep(pos.current, vel.current, goal, dt, 28)
    camera.position.copy(pos.current)
    camera.lookAt(look.current)
    if (camera instanceof PerspectiveCamera && camera.fov !== CAMERA_FOV) {
      camera.fov = CAMERA_FOV
      camera.updateProjectionMatrix()
    }
  })
}
