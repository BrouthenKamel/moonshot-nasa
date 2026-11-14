/**
 * Shared per-frame geometry for the stage: where the ground is under the
 * moving pass, where the satellite flies, where the beams land.
 */
import * as THREE from 'three'
import { TILE_LENGTH, groundHeight, shadowAt } from './ground'

/** Mutable state the frame loop advances; one object per stage. */
export interface Pass {
  offset: number // how far the ground has slid, in scene units
}

export const SPEED = 4.2 // scene units per second: one loop of the tile is about 19 s
export const SAT_SCALE = 1.3
/** Scene units per unit of the catalogue's footprint, the same for every instrument. */
export const FOOTPRINT_SCALE = 60

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Slide the ground on by dt seconds. */
export function advancePass(pass: Pass, dt: number) {
  pass.offset = (pass.offset + SPEED * Math.min(dt, 0.05)) % TILE_LENGTH
}

export const satHeight = (altitudeKm: number) => 2.6 + altitudeKm * 0.085
export const targetZ = (h: number) => -7 - h * 0.6
export const lookY = (h: number) => h - 0.9 - 0.3 * (h - satHeight(15))

/** Along-track tile coordinate under a world z. */
export const uAt = (pass: Pass, z: number) => mod(pass.offset - z, TILE_LENGTH)

export function groundAt(pass: Pass, x: number, z: number): { y: number; shadow: number } {
  const u = uAt(pass, z)
  return { y: groundHeight(x, u), shadow: shadowAt(x, u) }
}

/** Share of each 2.2 s cycle an instrument with this power share is on: 1 or 0 at time t. */
export const powered = (t: number, share: number) => (share >= 0.999 ? 1 : mod(t / 2.2, 1) < share ? 1 : 0)

const UP = new THREE.Vector3(0, 1, 0)
const tmp = new THREE.Vector3()

/** Stretch a unit-height mesh (cylinder or cone along Y) from a to b. */
export function placeBetween(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  tmp.subVectors(b, a)
  const len = tmp.length()
  obj.position.copy(a).addScaledVector(tmp, 0.5)
  obj.quaternion.setFromUnitVectors(UP, tmp.normalize())
  obj.scale.set(radius, Math.max(len, 0.001), radius)
}

export function setOpacity(obj: THREE.Object3D | null | undefined, opacity: number) {
  if (!obj) return
  const m = (obj as THREE.Mesh).material as THREE.Material | undefined
  if (m) m.opacity = opacity
}

export function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.3, 'rgba(255,255,255,0.5)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  }
  return new THREE.CanvasTexture(c)
}

/** Aperture x offset under the bus for slot i of n instruments. */
export const slotX = (i: number, n: number) => (n <= 1 ? 0 : i === 0 ? -0.2 : 0.2)
