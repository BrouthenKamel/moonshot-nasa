import type { CamKey } from '../interaction/InsideCam'

/**
 * The fairing ride's camera path and the fairing halves' motion, kept apart from the scene so they can
 * be tested. Integration review, 15 Nov: the first shots, Max-Q and fairing separation rendered as
 * near-white frames. Two causes, both fixed here:
 * - the camera crossed the fairing's own wall (radius 0.61) before the halves opened, so a sunlit wall
 *   filled the frame: it now stays inside the shell until separation has begun;
 * - the halves moved under a metre, so one sat in front of the lens: they now swing well clear.
 */

/** Inner radius of the fairing shell (model.sc-fairing_half: x ±0.613, z −0.604…0) */
export const FAIRING_RADIUS = 0.6
/** When the halves start to separate, and how long they take */
export const SEP_START = 7.5
export const SEP_SECONDS = 1.8

export function fairingKeys(engineScale: number): CamKey[] {
  return [
    { t: 0, pos: [0.32, 0.42, 0.38], target: [0, 0.14, 0], fov: 44, caption: 'T-minus 5… inside the payload fairing beside your 6U deployer.', shake: 0 },
    { t: 2.0, pos: [0.3, 0.4, 0.36], target: [0, 0.14, 0], fov: 45, caption: 'Ignition and liftoff — vibrations climb through the adapter ring.', shake: 0.012 * engineScale },
    { t: 4.5, pos: [0.28, 0.38, 0.34], target: [0, 0.14, 0], fov: 47, caption: 'Max-Q — maximum aerodynamic pressure on the fairing.', shake: 0.024 * engineScale },
    { t: 6.2, pos: [0.32, 0.42, 0.38], target: [0, 0.14, 0], fov: 45, caption: 'MECO and stage separation.', shake: 0.004 },
    // Still inside the shell when the halves let go; the camera pulls out only as they swing away
    { t: SEP_START, pos: [0.34, 0.5, 0.4], target: [0, 0.14, 0], fov: 48, caption: 'Fairing separation — Earth and sunlight flood the bay.', shake: 0.002 },
    { t: 8.3, pos: [0.36, 0.53, 0.42], target: [0, 0.16, 0.02], fov: 49, shake: 0.001 },
    { t: 9.2, pos: [0.58, 0.64, 0.72], target: [0, 0.38, 0.32], fov: 46, caption: 'Deployer door opens — CubeSat free, panels deploying.', shake: 0 },
    { t: 11.0, pos: [0.64, 0.7, 0.85], target: [0, 0.48, 0.45], fov: 44, caption: 'Orbital separation complete.', shake: 0 },
  ]
}

/** Separation progress 0 (closed) … 1 (gone), eased, at shot time `t` */
export function separation(t: number): number {
  const s = Math.max(0, Math.min(1, (t - SEP_START) / SEP_SECONDS))
  return s * s * (3 - 2 * s)
}

/** Where a fairing half is at separation progress `e`; `side` −1 for the left half, 1 for the right */
export function fairingHalfPose(e: number, side: 1 | -1) {
  return {
    position: [side * e * 3.2, -0.7 - e * 1.6, side * e * 1.4] as [number, number, number],
    rotationZ: side * e * 1.05,
  }
}
