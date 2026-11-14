/**
 * Agency base data: the demo starting point, buildings, example missions and
 * scripted background events.
 *
 * The demo drops the player into the middle of a campaign: the Earth-orbit
 * phase is done (Aurora-1 flies, Relay Pathfinder is on its way to the Moon)
 * and the agency can now afford its first real lunar science mission, the
 * Lunar Ice Mapper.
 *
 * The example missions and scripted events are scenery: they fill the feed
 * and the missions list, but never change money or popularity. Only the real
 * mission does that (src/game/world.ts).
 */

/** Day the demo starts on (about month 4) */
export const DEMO_START_DAY = 112
export const DEMO_START_FUNDS = 18.4 // $M
export const DEMO_START_POPULARITY = 68 // %

/** Clock speeds in game days per real second */
export const SPEEDS = {
  paused: 0,
  normal: 1,
  fast: 10,
} as const
export type Speed = keyof typeof SPEEDS

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export type BuildingId = 'hq' | 'factory' | 'test-facility' | 'launch-site' | 'comms-center' | 'research-lab'

export interface Building {
  id: BuildingId
  name: string
  /** Footprint: first tile (x, z) and size in tiles */
  tile: [number, number]
  size: [number, number]
  /** One line under the name when nothing is happening there */
  idle: string
  /** What the building is, in plain words (shown in its panel) */
  about: string
}

export const buildings: Building[] = [
  {
    id: 'hq',
    name: 'Headquarters',
    tile: [2, 2],
    size: [4, 4],
    idle: 'Agency progress and funding',
    about:
      'Where the agency is run. Money comes from the government every day, and more of it when the public supports you. The government also pays part of every mission it approves.',
  },
  {
    id: 'factory',
    name: 'Factory',
    tile: [9, 2],
    size: [4, 4],
    idle: 'Idle · ready to build a 6U',
    about:
      'Engineers design the spacecraft and build it from parts: structure, power, propulsion, radio, computer, pointing and instruments. Everything has to fit a 6U box (10 × 20 × 30 cm) and 14 kg.',
  },
  {
    id: 'test-facility',
    name: 'Test Facility',
    tile: [14, 2],
    size: [4, 4],
    idle: 'No spacecraft in test',
    about:
      'A shaker table imitates the rocket ride; a thermal-vacuum chamber imitates space, freezing and baking the spacecraft in turn. NASA CubeSat 101 names too little system testing as the main reason student CubeSats fail.',
  },
  {
    id: 'launch-site',
    name: 'Launch Site',
    tile: [9, 9],
    size: [5, 5],
    idle: 'No ride booked',
    about:
      'Small spacecraft rarely get their own rocket. They ride along as secondary payloads, like the ten CubeSats on Artemis I. The ride leaves on a fixed date: if the spacecraft is not ready, it waits for the next one.',
  },
  {
    id: 'comms-center',
    name: 'Communications Center',
    tile: [2, 14],
    size: [4, 4],
    idle: 'Listening',
    about:
      'Ground stations talk to the spacecraft. From the Moon a 6U CubeSat sends only 64 to 128 kbps, so contact hours decide how much science gets home. Data still on board does not count.',
  },
  {
    id: 'research-lab',
    name: 'Research Lab',
    tile: [2, 9],
    size: [4, 4],
    idle: 'Waiting for mission data',
    about:
      'Scientists turn raw mission data into maps and papers. Every paper earns grant money and public attention.',
  },
]

/** A plot that opens in a later phase */
export const lockedPlot = {
  name: 'Astronaut Training',
  tile: [15, 9] as [number, number],
  size: [3, 3] as [number, number],
  about: 'Opens with the crewed phase of the Moon programme. Not part of the MVP.',
}

/** Map size in tiles */
export const MAP_SIZE = 20

/* ------------------------------------------------------------------ */
/* Example missions (scenery)                                          */
/* ------------------------------------------------------------------ */

export type MissionStatus = 'planning' | 'building' | 'testing' | 'waiting' | 'transfer' | 'in-orbit' | 'complete' | 'lost'

export interface MissionCardView {
  id: string
  name: string
  status: MissionStatus
  progress: number // 0-1
  detail: string
  real?: boolean
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export function exampleMissions(day: number): MissionCardView[] {
  const aurora = Math.max(0, day - 41)
  return [
    {
      id: 'aurora-1',
      name: 'Aurora-1',
      status: aurora >= 365 ? 'complete' : 'in-orbit',
      progress: clamp01(aurora / 365),
      detail: `Earth observation · ${Math.round(aurora * 4.2).toLocaleString()} MB home`,
    },
    day < 190
      ? {
          id: 'relay-pathfinder',
          name: 'Relay Pathfinder',
          status: 'transfer',
          progress: clamp01((day - 70) / 120),
          detail: `Low-energy transfer · capture in ${Math.ceil(190 - day)} days`,
        }
      : {
          id: 'relay-pathfinder',
          name: 'Relay Pathfinder',
          status: 'in-orbit',
          progress: 1,
          detail: 'Halo orbit · lunar relay test',
        },
    {
      id: 'solar-scout',
      name: 'Solar Scout',
      status: 'planning',
      progress: 0,
      detail: 'Concept study · later phase',
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Scripted background events (scenery)                                */
/* ------------------------------------------------------------------ */

export interface ScriptedEvent {
  id: string
  day: number
  title: string
  detail?: string
  tone: 'info' | 'good' | 'warning' | 'bad'
}

export const scriptedEvents: ScriptedEvent[] = [
  { id: 'founded', day: 0, title: 'Agency founded', detail: 'A small team and a ground station', tone: 'info' },
  { id: 'aurora-launch', day: 34, title: 'Aurora-1 launched', detail: 'Rideshare to low Earth orbit', tone: 'info' },
  { id: 'aurora-contact', day: 41, title: 'Aurora-1 first contact', detail: 'Our first satellite works', tone: 'good' },
  {
    id: 'relay-deploy',
    day: 70,
    title: 'Relay Pathfinder deployed',
    detail: 'A 4-month low-energy transfer to the Moon',
    tone: 'info',
  },
  { id: 'phase-1', day: 95, title: 'Earth-orbit phase complete', detail: 'Next goal: the Moon', tone: 'good' },
  { id: 'aurora-reset', day: 109, title: 'Aurora-1 radiation reset', detail: 'Rebooted, one day of data lost', tone: 'warning' },
  { id: 'aurora-images', day: 140, title: 'Aurora-1 image gallery online', tone: 'info' },
  {
    id: 'relay-thruster',
    day: 156,
    title: 'Relay Pathfinder thruster check',
    detail: 'One thruster weak, margin still fine',
    tone: 'warning',
  },
  { id: 'relay-capture', day: 190, title: 'Relay Pathfinder in lunar orbit', detail: 'A relay test at the Moon', tone: 'good' },
  { id: 'aurora-end', day: 406, title: 'Aurora-1 mission complete', detail: 'One year in orbit', tone: 'good' },
]

/** Money and popularity before the demo starts, so the charts have a past */
export function seedHistory(): { day: number; funds: number; popularity: number }[] {
  const points: { day: number; funds: number; popularity: number }[] = []
  for (let day = 0; day < DEMO_START_DAY; day += 7) {
    const t = day / DEMO_START_DAY
    const funds = 13 + t * 5 + Math.sin(day / 9) * 0.25 - (day >= 30 && day < 40 ? 1.2 : 0)
    const popularity = 52 + t * 14 + (day >= 41 ? 2 : 0) + Math.sin(day / 13) * 1.2
    points.push({ day, funds: Math.round(funds * 100) / 100, popularity: Math.round(popularity * 10) / 10 })
  }
  points.push({ day: DEMO_START_DAY, funds: DEMO_START_FUNDS, popularity: DEMO_START_POPULARITY })
  return points
}
