import type { ModelId } from '../assets/manifest'

/**
 * The launch rocket the player assembles on the Rocket step: six slots, swappable parts.
 *
 * The parts are the low-poly kit in assets-src/models/rocket_parts. All lengths are in
 * "body radii" (the core stage is 1.0 wide), as in the kit's parts.json. The descriptions
 * name real rockets; they are for learning and do not change the mission numbers.
 */

export type RocketSlot = 'engine' | 'stage1' | 'stage2' | 'nose' | 'fins' | 'boosters'

/** The player's rocket: one part id per slot ('none' where a slot may stay empty) */
export type RocketConfig = Record<RocketSlot, string>

export interface RocketPart {
  id: string
  slot: RocketSlot
  /** Name in the picker */
  label: string
  /** Height in body radii (0 for 'none') */
  height: number
  /** Model to show; null for 'none' */
  model: ModelId | null
  /** What it is and what it is for, in plain words */
  what: string
  /** A real rocket that does the same, where there is a safe one to name */
  example?: string
  /** Engines this part lights at liftoff */
  engines?: number
  /** Solid boosters this part adds */
  boosters?: number
  /** Smallest core stage (in body radii) this part fits beside */
  minCore?: number
}

export interface RocketSlotInfo {
  id: RocketSlot
  title: string
  /** Colour of the slot's tray outline and tag */
  color: string
  /** Where it sits, for the help line */
  where: string
  /** The slot may be left empty */
  optional: boolean
}

export const rocketSlots: RocketSlotInfo[] = [
  { id: 'engine', title: 'Engines', color: '#f97316', where: 'at the bottom', optional: false },
  { id: 'stage1', title: 'Core stage', color: '#3b82f6', where: 'the main tank', optional: false },
  { id: 'stage2', title: 'Upper stage', color: '#a855f7', where: 'above the core', optional: true },
  { id: 'nose', title: 'Nose', color: '#22c55e', where: 'at the top', optional: false },
  { id: 'fins', title: 'Fins', color: '#eab308', where: 'around the base', optional: true },
  { id: 'boosters', title: 'Boosters', color: '#ef4444', where: 'strapped to the sides', optional: true },
]

const m = (id: string) => `model.rocket-${id}` as ModelId

export const rocketParts: RocketPart[] = [
  // Engines
  {
    id: 'engine_single',
    slot: 'engine',
    label: 'Single bell',
    height: 1.95,
    model: m('engine_single'),
    engines: 1,
    what: 'One big engine. Simple and light, but if it fails there is no thrust at all.',
    example: 'The Delta II first stage burned a single main engine, the RS-27A.',
  },
  {
    id: 'engine_cluster3',
    slot: 'engine',
    label: 'Triple cluster',
    height: 1.35,
    model: m('engine_cluster3'),
    engines: 3,
    what: 'Three engines side by side. More thrust, and the others keep pushing if one has trouble.',
    example: 'The Space Shuttle flew on three main engines.',
  },
  {
    id: 'engine_cluster9',
    slot: 'engine',
    label: 'Nine-engine cluster',
    height: 1.1,
    model: m('engine_cluster9'),
    engines: 9,
    what: 'Nine smaller engines. Lots of thrust, and one failed engine does not end the flight.',
    example: 'Falcon 9 has nine Merlin engines on its first stage.',
  },
  {
    id: 'engine_vacuum',
    slot: 'engine',
    label: 'Vacuum bell',
    height: 2.5,
    model: m('engine_vacuum'),
    engines: 1,
    what: 'A very wide bell made for space, where there is no air to squeeze the exhaust. It is the most efficient, but it is too big for the thick air at the ground.',
    example: 'Upper stages such as Centaur use wide-bell engines like the RL10.',
  },

  // Core stage
  {
    id: 'stage1_short',
    slot: 'stage1',
    label: 'Short core',
    height: 6,
    model: m('stage1_short'),
    what: 'A small fuel tank. Light and cheap, with less to burn, so it suits small payloads.',
  },
  {
    id: 'stage1_medium',
    slot: 'stage1',
    label: 'Medium core',
    height: 9,
    model: m('stage1_medium'),
    what: 'The workhorse size: enough fuel for payloads of several tonnes.',
    example: 'Rockets in the Atlas V and Falcon 9 class are about this proportion.',
  },
  {
    id: 'stage1_long',
    slot: 'stage1',
    label: 'Long core (foam tank)',
    height: 12,
    model: m('stage1_long'),
    what: 'A tall tank wrapped in orange insulation foam. The fuel is so cold that frost and ice would form on bare metal.',
    example: 'The Space Shuttle External Tank and the SLS core stage are wrapped in the same orange foam.',
  },

  // Upper stage
  {
    id: 'none',
    slot: 'stage2',
    label: 'No upper stage',
    height: 0,
    model: null,
    what: 'The core stage does all the work. That is fine for low orbit, but a spacecraft bound for the Moon needs a second burn after launch.',
  },
  {
    id: 'stage2_short',
    slot: 'stage2',
    label: 'Short upper stage',
    height: 2.5,
    model: m('stage2_short'),
    what: 'A small second stage that lights in space to push the spacecraft on toward the Moon.',
    example: 'On Artemis I, the upper stage sent the mission and its CubeSats toward the Moon.',
  },
  {
    id: 'stage2_long',
    slot: 'stage2',
    label: 'Long upper stage',
    height: 4,
    model: m('stage2_long'),
    what: 'A bigger second stage with more fuel, so it can send heavier loads farther.',
    example: 'Centaur is a real upper stage that restarts its engine in space.',
  },

  // Nose
  {
    id: 'nose_ogive',
    slot: 'nose',
    label: 'Ogive nose',
    height: 3,
    model: m('nose_ogive'),
    what: 'A smoothly curved nose, the classic shape that slips through the air with little drag.',
  },
  {
    id: 'nose_cone',
    slot: 'nose',
    label: 'Cone nose',
    height: 2.52,
    model: m('nose_cone'),
    what: 'A plain cone. Easy to build, but it pushes through the air a little less smoothly.',
  },
  {
    id: 'nose_fairing',
    slot: 'nose',
    label: 'Payload fairing',
    height: 5.4,
    model: m('nose_fairing'),
    what: 'A wide two-halves shell that protects satellites while the rocket climbs through the air. It splits open and falls away once the rocket is in space. A CubeSat rides inside it in a deployer.',
    example: 'Almost every satellite launcher uses a fairing like this.',
  },
  {
    id: 'nose_capsule',
    slot: 'nose',
    label: 'Crew capsule + escape tower',
    height: 4.1,
    model: m('nose_capsule'),
    what: 'A capsule for astronauts, with a tower that can pull it clear if the rocket fails. It carries people, not satellites.',
    example: 'Orion flies on top of SLS. On Artemis I the CubeSats rode below it, in the adapter ring.',
  },

  // Fins
  {
    id: 'none',
    slot: 'fins',
    label: 'No fins',
    height: 0,
    model: null,
    what: 'Most modern rockets have no fins. They steer by swivelling their engines.',
  },
  {
    id: 'fins_small',
    slot: 'fins',
    label: 'Small fins',
    height: 2.2,
    model: m('fins_small'),
    what: 'Four small fins keep the nose pointing into the wind. Light, but less steady.',
  },
  {
    id: 'fins_large',
    slot: 'fins',
    label: 'Large swept fins',
    height: 3.5,
    model: m('fins_large'),
    what: 'Four big swept fins make the rocket steadier in the air, at the cost of weight and drag.',
    example: 'Saturn V had four large fins at its base.',
  },
  {
    id: 'fins_tri',
    slot: 'fins',
    label: 'Three fins',
    height: 2.8,
    model: m('fins_tri'),
    what: 'Three fins spaced evenly around the base: a bit lighter than four.',
  },

  // Boosters
  {
    id: 'none',
    slot: 'boosters',
    label: 'No boosters',
    height: 0,
    model: null,
    what: 'The core stage lifts the rocket by itself. Simplest, but liftoff is gentler.',
  },
  {
    id: 'boosters_2',
    slot: 'boosters',
    label: '2 solid boosters',
    height: 5,
    model: m('boosters_2'),
    boosters: 2,
    what: 'Two strap-on solid rockets add a big shove for the first two minutes, then drop away.',
    example: 'The Space Shuttle flew with two solid rocket boosters.',
  },
  {
    id: 'boosters_4',
    slot: 'boosters',
    label: '4 small boosters',
    height: 4,
    model: m('boosters_4'),
    boosters: 4,
    what: 'Four small solid boosters, spread around the core, for a smaller boost that is easy to scale up or down.',
    example: 'Atlas V can strap on up to five solid boosters.',
  },
  {
    id: 'boosters_2_heavy',
    slot: 'boosters',
    label: '2 heavy boosters',
    height: 7.5,
    model: m('boosters_2_heavy'),
    boosters: 2,
    minCore: 9,
    what: 'Two very large solid boosters. They give the most thrust at liftoff, and need a tall core to hold them.',
    example: 'SLS flies with two huge solid boosters.',
  },
]

export const DEFAULT_ROCKET: RocketConfig = {
  engine: 'engine_cluster3',
  stage1: 'stage1_medium',
  stage2: 'stage2_short',
  nose: 'nose_fairing',
  fins: 'none',
  boosters: 'boosters_2',
}

/** Game-scale size of one body radius: about the 3.7 m width of a Falcon 9 (for the "about N m" read-out only) */
export const BODY_RADIUS_M = 1.85

export function getRocketPart(slot: RocketSlot, id: string): RocketPart | undefined {
  return rocketParts.find((p) => p.slot === slot && p.id === id)
}

export function partsForSlot(slot: RocketSlot): RocketPart[] {
  return rocketParts.filter((p) => p.slot === slot)
}
