/**
 * Scene reactions: pure functions from the model's numbers (`computeBudgets`) to a visual state.
 * They decide nothing and compute no new physics; they only say how far a needle swings, whether
 * the bus lights flicker, how full the storage tray looks. Unit-tested like the `src/viz` models.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/* ---------------- the weighing scale (Factory) ---------------- */

/** The dial sweeps 240°: from -120° (empty) to +120°. The red line (the limit) sits at 80% of the sweep. */
export const SCALE_SWEEP = (240 * Math.PI) / 180
export const SCALE_RED_AT = 0.8

export interface ScaleState {
  /** Needle angle in radians, 0 = straight up, negative = left */
  angle: number
  /** Where the red line sits, radians */
  redLine: number
  /** Over the limit: the stand creaks and the needle shakes */
  over: boolean
  /** Shake amplitude in radians (0 when within the limit) */
  shake: number
  /** 0..1 how close to the limit (1 = at or past it) */
  load: number
}

/** Needle angle for a mass against a limit; past the end stop it pins and shakes harder */
export function scaleNeedleAngle(mass: number, limit: number): number {
  if (!(limit > 0)) return -SCALE_SWEEP / 2
  const frac = clamp((mass / limit) * SCALE_RED_AT, 0, 1.04)
  return -SCALE_SWEEP / 2 + frac * SCALE_SWEEP
}

export function scaleState(mass: number, limit: number): ScaleState {
  const angle = scaleNeedleAngle(mass, limit)
  const redLine = -SCALE_SWEEP / 2 + SCALE_RED_AT * SCALE_SWEEP
  const over = limit > 0 && mass > limit
  const overBy = over ? (mass - limit) / limit : 0
  return { angle, redLine, over, shake: over ? clamp(0.02 + overBy * 0.3, 0.02, 0.09) : 0, load: limit > 0 ? clamp(mass / limit, 0, 1) : 1 }
}

/** One step of a damped spring toward a target (the needle's swing). Returns [value, velocity]. */
export function springStep(value: number, velocity: number, target: number, dt: number, stiffness = 60, damping = 9): [number, number] {
  const h = Math.min(dt, 1 / 30)
  const a = stiffness * (target - value) - damping * velocity
  const v = velocity + a * h
  return [value + v * h, v]
}

/* ---------------- the bus lights (Factory) ---------------- */

export interface BrownoutState {
  /** Steady when the panels make more than the load */
  steady: boolean
  /** 0..1: how hard the LEDs flicker (0 = steady) */
  flicker: number
  /** 0..1: how bright the harness glow runs from the panels */
  glow: number
}

/** The bus LEDs flicker when the power margin is short; the deeper the deficit, the harder */
export function brownout(powerMargin: number, powerGenerated: number): BrownoutState {
  const load = Math.max(1, powerGenerated - powerMargin)
  if (powerMargin >= 0) return { steady: true, flicker: 0, glow: clamp(0.4 + powerMargin / load, 0.4, 1) }
  const deficit = -powerMargin / load
  return { steady: false, flicker: clamp(0.25 + deficit * 1.5, 0.25, 1), glow: clamp(0.4 - deficit, 0.1, 0.4) }
}

/** LED brightness for a flickering bus at time t (deterministic pseudo-random stutter) */
export function ledBrightness(state: BrownoutState, t: number): number {
  if (state.steady) return 1
  const n = Math.sin(t * 37.1) * Math.sin(t * 11.7 + 1.3) * Math.sin(t * 5.3 + 0.7)
  return n > 1 - state.flicker * 1.4 ? 0.12 : 1
}

/* ---------------- the storage tray (Comms) ---------------- */

export interface StorageFlow {
  /** 0..1 how full the onboard tray looks after a turn */
  fill: number
  /** Share of the made data that falls off the tray (0 = none lost) */
  spill: number
  /** Packets per second drawn arriving at the dish (1..12) */
  rate: number
}

/** Made vs sent home per turn, with the onboard storage as buffer: what a turn's packets look like */
export function storageFlow(dataPerTurn: number, downlinkPerTurn: number, storageCapacity: number): StorageFlow {
  const made = Math.max(0, dataPerTurn)
  const sent = Math.max(0, downlinkPerTurn)
  const left = Math.max(0, made - sent)
  const cap = Math.max(1, storageCapacity)
  const fill = clamp(left / cap, 0, 1)
  const lost = Math.max(0, left - cap)
  return { fill: made > 0 ? Math.max(fill, Math.min(1, made / cap) * 0.15) : 0, spill: made > 0 ? clamp(lost / made, 0, 1) : 0, rate: clamp(Math.round(Math.sqrt(made) / 2), 1, 12) }
}

/* ---------------- volume (Factory) ---------------- */

/**
 * Whether a part fits the remaining U: the current part in that slot comes out, the new one goes in.
 * Returns a reason when it does not fit, null when it does.
 */
export function volumeRefusal(volumeMargin: number, currentVolume: number, nextVolume: number): string | null {
  const after = volumeMargin + currentVolume - nextVolume
  if (after >= -1e-9) return null
  return `Does not fit: ${(-after).toFixed(1)} U short`
}

/* ---------------- hold to launch ---------------- */

/** 0..1 how full the hold ring is after `heldMs`; reaching 1 launches */
export function holdProgress(heldMs: number, needMs = 1500): number {
  return clamp(heldMs / needMs, 0, 1)
}

/** The launch key turns when dragged in a circle: the angle swept between two pointer positions around a centre */
export function sweptAngle(cx: number, cy: number, x0: number, y0: number, x1: number, y1: number): number {
  const a0 = Math.atan2(y0 - cy, x0 - cx)
  const a1 = Math.atan2(y1 - cy, x1 - cx)
  let d = a1 - a0
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}
