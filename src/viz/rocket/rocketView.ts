import {
  BODY_RADIUS_M,
  DEFAULT_ROCKET,
  getRocketPart,
  partsForSlot,
  rocketSlots,
  type RocketConfig,
  type RocketPart,
  type RocketSlot,
} from '../../data/rocket'

/**
 * The Rocket step as a pure view: where every part sits, what the player's picks add up to,
 * and the plain-words checklist. No three.js here, so it can be tested and drawn however.
 * Nothing in this file touches the mission numbers: the checklist advises, it never blocks.
 */

export type Tone = 'green' | 'yellow'

/** A rocket from a save or the picker, repaired: unknown ids become the default, unfit boosters become standard ones */
export function normalizeRocket(raw: Partial<Record<RocketSlot, string>> | undefined): { config: RocketConfig; notes: string[] } {
  const notes: string[] = []
  const config = { ...DEFAULT_ROCKET }
  for (const slot of rocketSlots) {
    const id = raw?.[slot.id]
    if (id !== undefined && getRocketPart(slot.id, id)) config[slot.id] = id
  }
  const core = getRocketPart('stage1', config.stage1)!
  const boosters = getRocketPart('boosters', config.boosters)!
  if (boosters.minCore !== undefined && core.height < boosters.minCore) {
    config.boosters = 'boosters_2'
    notes.push(`${boosters.label} need a taller core stage, so the boosters were changed to ${getRocketPart('boosters', 'boosters_2')!.label.toLowerCase()}.`)
  }
  return { config, notes }
}

/** Why a part cannot be picked with the rest of the current rocket, or null if it fits */
export function blockedReason(config: RocketConfig, part: RocketPart): string | null {
  const core = getRocketPart('stage1', config.stage1)!
  if (part.slot === 'boosters' && part.minCore !== undefined && core.height < part.minCore) return 'Needs a taller core stage'
  return null
}

/** Picking `id` in `slot`, with the rocket repaired afterwards */
export function pick(config: RocketConfig, slot: RocketSlot, id: string): { config: RocketConfig; notes: string[] } {
  return normalizeRocket({ ...config, [slot]: id })
}

export interface PlacedPart {
  slot: RocketSlot
  part: RocketPart
  /** Height of the part's origin above the core stage's base, in body radii */
  y: number
}

export interface RocketLayout {
  placed: PlacedPart[]
  /** Lowest and highest points, in body radii */
  bottom: number
  top: number
  heightUnits: number
  heightM: number
}

/**
 * Parts stack by the kit's rules: engines hang down from y = 0, the core stands on y = 0, the upper
 * stage sits on the core, the nose on that, and fins and boosters share the core's origin.
 */
export function layoutRocket(config: RocketConfig): RocketLayout {
  const get = (slot: RocketSlot) => getRocketPart(slot, config[slot])!
  const engine = get('engine')
  const core = get('stage1')
  const upper = get('stage2')
  const nose = get('nose')
  const y: Record<RocketSlot, number> = {
    engine: 0,
    stage1: 0,
    stage2: core.height,
    nose: core.height + upper.height,
    fins: 0,
    boosters: 0,
  }
  const placed = rocketSlots
    .map((s) => ({ slot: s.id, part: get(s.id), y: y[s.id] }))
    .filter((p) => p.part.model !== null)
  const top = core.height + upper.height + nose.height
  const bottom = -engine.height
  const heightUnits = top - bottom
  return { placed, bottom, top, heightUnits, heightM: heightUnits * BODY_RADIUS_M }
}

export interface RocketStats {
  heightM: number
  stages: number
  engines: number
  boosters: number
}

export function rocketStats(config: RocketConfig): RocketStats {
  const layout = layoutRocket(config)
  const engine = getRocketPart('engine', config.engine)!
  const boosters = getRocketPart('boosters', config.boosters)!
  return {
    heightM: layout.heightM,
    stages: config.stage2 === 'none' ? 1 : 2,
    engines: engine.engines ?? 1,
    boosters: boosters.boosters ?? 0,
  }
}

export interface RocketCheck {
  id: 'moon' | 'payload'
  tone: Tone
  title: string
  text: string
}

/** Two honest notes for a lunar CubeSat mission. They advise; the player can still fly any rocket. */
export function rocketChecks(config: RocketConfig): RocketCheck[] {
  const checks: RocketCheck[] = []
  if (config.stage2 !== 'none') {
    checks.push({
      id: 'moon',
      tone: 'green',
      title: 'Can head for the Moon',
      text: 'The upper stage lights again in space and pushes the spacecraft out of Earth orbit.',
    })
  } else {
    checks.push({
      id: 'moon',
      tone: 'yellow',
      title: 'No upper stage',
      text: 'Fine for low orbit, but a spacecraft bound for the Moon needs a second burn after launch.',
    })
  }
  if (config.nose === 'nose_capsule') {
    checks.push({
      id: 'payload',
      tone: 'yellow',
      title: 'Capsule carries people',
      text: 'A satellite would ride below the capsule in an adapter ring, as the CubeSats did on Artemis I.',
    })
  } else {
    checks.push({
      id: 'payload',
      tone: 'green',
      title: 'Payload is covered',
      text: 'The nose shields the spacecraft while the rocket climbs through the air.',
    })
  }
  return checks
}

/** Every option for a slot with whether it fits the current rocket, for the picker */
export function optionsFor(config: RocketConfig, slot: RocketSlot): Array<{ part: RocketPart; selected: boolean; blocked: string | null }> {
  return partsForSlot(slot).map((part) => ({ part, selected: config[slot] === part.id, blocked: blockedReason(config, part) }))
}

/** The one-line fact under an option's name in the picker */
export function partStat(part: RocketPart): string {
  if (part.id === 'none') return 'empty'
  const m = `${Math.round(part.height * BODY_RADIUS_M)} m`
  if (part.slot === 'engine') return `${part.engines} engine${part.engines === 1 ? '' : 's'} · ${m}`
  if (part.slot === 'boosters') return `${part.boosters} boosters · ${m}`
  return m
}
