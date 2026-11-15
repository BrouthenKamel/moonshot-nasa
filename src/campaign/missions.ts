/**
 * The campaign ladder (PROTOTYPE, branch proto/campaign): four missions in order, each unlocked by
 * money and popularity. Mission 1 is main's Lunar Ice Mapper, untouched; missions 2-4 are lighter:
 * three design choices each (one per screen) and a simple outcome model (./flight.ts).
 *
 * Numbers: every budget, gate, award, reliability and science value is a GAME VALUE, chosen for
 * pacing (see campaign.test.ts for the balance checks). Statements about real missions carry a
 * `fact` with its source, so the game never presents an invented number as history.
 */
import type { PayoffKind, RocketClass } from './scenes/types'

export type CampaignMissionId = 'ice-mapper' | 'moon-landing' | 'moon-base' | 'mars-base'

export interface Fact {
  text: string
  source: string
}

export interface ChoiceOption {
  id: string
  name: string
  /** One plain sentence: what you get and what it costs you */
  line: string
  /** Added to the mission budget, $M (game value) */
  cost: number
  /** Added to the chance of a clean landing, 0-1 (game value) */
  reliability: number
  /** Science points if the mission works (game value) */
  science: number
  /** Extra popularity points on success (game value) */
  hype: number
  /** A real-world anchor for this option */
  fact?: Fact
}

export interface DesignChoice {
  id: string
  /** The one decision on this screen */
  question: string
  options: ChoiceOption[]
}

export interface Gate {
  /** Agency funds needed, $M */
  funds: number
  /** Popularity needed, % */
  popularity: number
}

export interface CampaignMission {
  id: CampaignMissionId
  n: number
  name: string
  /** What counts as success, one line */
  objective: string
  /** Short brief, two sentences at most */
  brief: string
  rocket: RocketClass
  rocketName: string
  payoff: PayoffKind
  /** Needed to start this mission (null: open from the start) */
  gate: Gate | null
  /** Budget before the design choices, $M */
  baseBudget: number
  /** Chance of a clean landing before the design choices (launch risk is separate) */
  baseReliability: number
  /** Chance the rocket gets there at all */
  launchReliability: number
  /** Months from Go to the result: the agency clock moves this far */
  months: number
  /** Milestone award on success, $M: the first time, and on a repeat flight */
  award: { first: number; repeat: number }
  /** Popularity points by outcome, before the choices' hype */
  popularity: { success: number; partial: number; failed: number }
  choices: DesignChoice[]
  facts: Fact[]
}

export const CAMPAIGN: CampaignMission[] = [
  {
    id: 'ice-mapper',
    n: 1,
    name: 'Lunar Ice Mapper',
    objective: 'Map water ice in the dark craters at the lunar south pole.',
    brief: 'A 6U CubeSat on a rideshare. Find the water that a Moon landing will need.',
    rocket: 'small',
    rocketName: 'Rideshare launcher',
    payoff: 'ice-map',
    gate: null,
    baseBudget: 25,
    baseReliability: 0,
    launchReliability: 1,
    months: 0,
    // The award is the campaign's milestone payment; mission 1 itself settles through main's rules
    award: { first: 20, repeat: 6 },
    popularity: { success: 0, partial: 0, failed: 0 },
    choices: [],
    facts: [
      {
        text: 'In 2009 NASA\'s LCROSS impactor found water ice in Cabeus, a permanently shadowed crater near the south pole.',
        source: 'NASA, LCROSS mission results (Nov 2009)',
      },
    ],
  },
  {
    id: 'moon-landing',
    n: 2,
    name: 'Moon landing',
    objective: 'Land a robotic lander softly and run its payload for one lunar day.',
    brief: 'A robotic lander carries your payload to the surface. Pick the engine, the place and what it carries.',
    rocket: 'medium',
    rocketName: 'Medium-lift rocket',
    payoff: 'moon-landing',
    gate: { funds: 35, popularity: 70 },
    baseBudget: 60,
    baseReliability: 0.56,
    launchReliability: 0.98,
    months: 3,
    award: { first: 45, repeat: 30 },
    popularity: { success: 12, partial: 3, failed: -12 },
    choices: [
      {
        id: 'engine',
        question: 'Which engine brings the lander down?',
        options: [
          {
            id: 'hypergolic',
            name: 'Hypergolic, throttleable',
            line: 'Proven and simple to light. Heavy, so less payload.',
            cost: 8,
            reliability: 0.12,
            science: 0,
            hype: 0,
            fact: { text: "Apollo's lunar module landed on a throttleable hypergolic descent engine.", source: 'NASA, Apollo LM descent engine' },
          },
          {
            id: 'methalox',
            name: 'Methane-oxygen',
            line: 'Efficient and modern. Less flight history.',
            cost: 12,
            reliability: 0.06,
            science: 10,
            hype: 2,
            fact: { text: "Intuitive Machines' Nova-C landers use a methane-oxygen engine.", source: 'Intuitive Machines, IM-1 (2024)' },
          },
          {
            id: 'pressure-fed',
            name: 'Cheap pressure-fed',
            line: 'Cheapest. Coarse throttle makes the last metres harder.',
            cost: 0,
            reliability: -0.08,
            science: 0,
            hype: 0,
          },
        ],
      },
      {
        id: 'site',
        question: 'Where do you land?',
        options: [
          {
            id: 'mare',
            name: 'Sea of Tranquillity',
            line: 'Flat and sunlit. Safe, but little new science.',
            cost: 0,
            reliability: 0.12,
            science: 15,
            hype: 2,
            fact: { text: 'Apollo 11 landed in the Sea of Tranquillity on 20 July 1969.', source: 'NASA, Apollo 11 mission page' },
          },
          {
            id: 'malapert',
            name: 'Malapert massif',
            line: 'Near the south pole ice. Slopes and long shadows.',
            cost: 4,
            reliability: 0,
            science: 35,
            hype: 4,
            fact: {
              text: 'IM-1 landed near Malapert A in February 2024 and tipped onto its side.',
              source: 'NASA / Intuitive Machines, IM-1 mission (Feb 2024)',
            },
          },
          {
            id: 'shackleton',
            name: 'Shackleton crater rim',
            line: 'Right by the mapped ice. The hardest, most valuable spot.',
            cost: 8,
            reliability: -0.1,
            science: 55,
            hype: 6,
          },
        ],
      },
      {
        id: 'payload',
        question: 'What does the lander carry?',
        options: [
          {
            id: 'drill',
            name: 'Ice drill',
            line: 'Drills one metre down and tastes the ice. Big science.',
            cost: 10,
            reliability: 0,
            science: 30,
            hype: 2,
            fact: {
              text: "NASA's PRIME-1 ice drill flew to the south pole on IM-2 in March 2025.",
              source: 'NASA, PRIME-1 / IM-2 (Mar 2025)',
            },
          },
          {
            id: 'rover',
            name: 'Small rover',
            line: 'Drives out and sends pictures. The public loves it.',
            cost: 8,
            reliability: -0.03,
            science: 15,
            hype: 6,
          },
          {
            id: 'station',
            name: 'Science station',
            line: 'Seismometer and camera, no moving parts. Cheap and safe.',
            cost: 3,
            reliability: 0.03,
            science: 15,
            hype: 1,
          },
        ],
      },
    ],
    facts: [],
  },
  {
    id: 'moon-base',
    n: 3,
    name: 'Moon base',
    objective: 'Land the first base modules and keep them powered through a lunar night.',
    brief: 'A heavy rocket carries a cargo lander with the base inside. Choose the habitat, its power and who goes.',
    rocket: 'heavy',
    rocketName: 'Heavy-lift rocket',
    payoff: 'moon-base',
    gate: { funds: 60, popularity: 80 },
    baseBudget: 140,
    baseReliability: 0.54,
    launchReliability: 0.96,
    months: 4,
    award: { first: 90, repeat: 72 },
    popularity: { success: 15, partial: 4, failed: -15 },
    choices: [
      {
        id: 'habitat',
        question: 'What kind of habitat?',
        options: [
          {
            id: 'rigid',
            name: 'Rigid modules',
            line: 'Metal cans like the space station. Heavy and well known.',
            cost: 20,
            reliability: 0.1,
            science: 10,
            hype: 0,
          },
          {
            id: 'inflatable',
            name: 'Inflatable habitat',
            line: 'Packs small, unfolds big. Lighter, less flight history.',
            cost: 10,
            reliability: 0.02,
            science: 20,
            hype: 5,
            fact: { text: 'BEAM, an expandable module, was inflated on the space station in 2016.', source: 'NASA, BEAM on the ISS (2016)' },
          },
          {
            id: 'regolith',
            name: 'Regolith-shielded',
            line: 'Buries modules under Moon soil. Best shielding, untested building.',
            cost: 15,
            reliability: -0.08,
            science: 35,
            hype: 4,
          },
        ],
      },
      {
        id: 'power',
        question: 'How does the base survive the lunar night?',
        options: [
          {
            id: 'solar-ridge',
            name: 'Solar on a sunlit ridge',
            line: 'Near-constant sun on a polar peak. Cheap, but only one spot.',
            cost: 4,
            reliability: 0.03,
            science: 5,
            hype: 1,
          },
          {
            id: 'fission',
            name: 'Small fission reactor',
            line: 'Power through two weeks of dark. Costly, and a hard sell.',
            cost: 25,
            reliability: 0.1,
            science: 20,
            hype: -2,
            fact: {
              text: "NASA's Fission Surface Power project is developing a reactor of about 40 kilowatts for the Moon.",
              source: 'NASA, Fission Surface Power project',
            },
          },
          {
            id: 'batteries',
            name: 'Solar and big batteries',
            line: 'Simple parts. The batteries barely last the night.',
            cost: 8,
            reliability: -0.06,
            science: 5,
            hype: 0,
            fact: { text: 'A lunar night lasts about 14 Earth days.', source: 'NASA, Moon facts' },
          },
        ],
      },
      {
        id: 'crew',
        question: 'Who goes first?',
        options: [
          {
            id: 'cargo',
            name: 'Cargo first',
            line: 'The base sets itself up; a crew follows later. Safe, quieter news.',
            cost: 0,
            reliability: 0.08,
            science: 10,
            hype: 0,
          },
          {
            id: 'crew',
            name: 'Crew with the base',
            line: 'Astronauts build it by hand. Huge news, and huge risk.',
            cost: 30,
            reliability: -0.04,
            science: 30,
            hype: 10,
          },
        ],
      },
    ],
    facts: [],
  },
  {
    id: 'mars-base',
    n: 4,
    name: 'Mars base',
    objective: 'Land a base on Mars and get its first module working.',
    brief: 'The biggest rocket you can buy, seven months in deep space, seven minutes to land. Pick the window, the landing and the place.',
    rocket: 'super',
    rocketName: 'Super heavy rocket',
    payoff: 'mars-base',
    gate: { funds: 95, popularity: 85 },
    baseBudget: 260,
    baseReliability: 0.5,
    launchReliability: 0.94,
    months: 9,
    award: { first: 150, repeat: 90 },
    popularity: { success: 20, partial: 5, failed: -20 },
    choices: [
      {
        id: 'window',
        question: 'Which transfer to Mars?',
        options: [
          {
            id: 'fast',
            name: 'Fast transfer',
            line: 'Six months, more fuel, a hotter entry.',
            cost: 30,
            reliability: -0.04,
            science: 5,
            hype: 3,
          },
          {
            id: 'hohmann',
            name: 'Standard transfer',
            line: 'About seven months on the classic minimum-energy path.',
            cost: 10,
            reliability: 0.06,
            science: 5,
            hype: 0,
            fact: {
              text: 'Perseverance launched on 30 July 2020 and landed on 18 February 2021, about seven months later.',
              source: 'NASA, Mars 2020 mission',
            },
          },
          {
            id: 'slow',
            name: 'Low-energy transfer',
            line: 'Cheapest. Ten months of cosmic rays on the cargo.',
            cost: 0,
            reliability: -0.02,
            science: 0,
            hype: -2,
          },
        ],
      },
      {
        id: 'landing',
        question: 'How do you land a heavy base?',
        options: [
          {
            id: 'chute-retro',
            name: 'Parachute and retro-rockets',
            line: 'Supersonic parachute, then engines for the last kilometre.',
            cost: 10,
            reliability: 0.06,
            science: 0,
            hype: 2,
          },
          {
            id: 'inflatable-shield',
            name: 'Inflatable heat shield',
            line: 'A huge shield that brakes harder. New technology.',
            cost: 25,
            reliability: 0.1,
            science: 10,
            hype: 4,
            fact: {
              text: "NASA's LOFTID tested an inflatable heat shield on re-entry in November 2022.",
              source: 'NASA, LOFTID (Nov 2022)',
            },
          },
          {
            id: 'sky-crane',
            name: 'Sky crane',
            line: 'Proven, precise, but made for one-tonne rovers, not a base.',
            cost: 5,
            reliability: -0.12,
            science: 5,
            hype: 1,
            fact: { text: 'Curiosity (2012) and Perseverance (2021) were lowered by a sky crane.', source: 'NASA, Mars Science Laboratory and Mars 2020' },
          },
        ],
      },
      {
        id: 'site',
        question: 'Where does the base go?',
        options: [
          {
            id: 'arcadia',
            name: 'Arcadia Planitia',
            line: 'Flat plains with ice just under the dust. Water for the crew.',
            cost: 5,
            reliability: 0.06,
            science: 30,
            hype: 3,
            fact: {
              text: 'Radar shows water ice close under the surface at Arcadia Planitia; NASA studies it for human landings.',
              source: 'NASA, Subsurface Water Ice Mapping (SWIM) project',
            },
          },
          {
            id: 'jezero',
            name: 'Jezero crater',
            line: "An old lake bed, Perseverance's home. Great science, rocky floor.",
            cost: 5,
            reliability: -0.04,
            science: 45,
            hype: 5,
            fact: { text: 'Perseverance has explored the Jezero crater lake bed since 2021.', source: 'NASA, Mars 2020 mission' },
          },
          {
            id: 'hellas',
            name: 'Hellas basin',
            line: 'The deepest low ground: thickest air to brake in. Dusty.',
            cost: 0,
            reliability: 0.08,
            science: 15,
            hype: 1,
          },
        ],
      },
    ],
    facts: [{ text: 'Launch windows to Mars open about every 26 months.', source: 'NASA, Mars launch windows' }],
  },
]

export function missionById(id: CampaignMissionId): CampaignMission {
  const m = CAMPAIGN.find((x) => x.id === id)
  if (!m) throw new Error(`Unknown campaign mission ${id}`)
  return m
}

export type Picks = Record<string, string>

/** The option the player picked for a choice, or the first one */
export function pickedOption(choice: DesignChoice, picks: Picks): ChoiceOption {
  return choice.options.find((o) => o.id === picks[choice.id]) ?? choice.options[0]
}

/** Default picks: the first option of every choice */
export function defaultPicks(mission: CampaignMission): Picks {
  return Object.fromEntries(mission.choices.map((c) => [c.id, c.options[0].id]))
}

export interface MissionPlan {
  budget: number
  /** Chance of a clean landing (after launch) */
  landing: number
  /** Chance of the whole mission working: launch × landing */
  success: number
  science: number
  hype: number
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** What a set of picks adds up to */
export function planOf(mission: CampaignMission, picks: Picks): MissionPlan {
  const opts = mission.choices.map((c) => pickedOption(c, picks))
  const landing = clamp(mission.baseReliability + opts.reduce((s, o) => s + o.reliability, 0), 0.2, 0.95)
  return {
    budget: mission.baseBudget + opts.reduce((s, o) => s + o.cost, 0),
    landing,
    success: landing * mission.launchReliability,
    science: opts.reduce((s, o) => s + o.science, 0),
    hype: opts.reduce((s, o) => s + o.hype, 0),
  }
}
