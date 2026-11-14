/**
 * Agency base mockup data: buildings, example missions and the event timeline.
 *
 * Time on the base runs in days (continuous), not turns. Day 0 is the day the
 * agency was founded. The demo state opens on day 112 (about month 4). Once the
 * Lunar Ice Mapper flies, the base day follows its turns (one turn = 30 days).
 *
 * Everything here is mock content for the MVP: the only real game link is the
 * Lunar Ice Mapper mission, planned from the buildings and flown on the base
 * with the logic core (src/sim).
 */

/** Day the demo state starts on */
export const DEMO_START_DAY = 112

/** Starting money and public support for the demo state */
export const DEMO_START_FUNDS = 18.4 // $M
export const DEMO_START_SUPPORT = 68 // %

/** Simulation speeds: game days per real second */
export const SPEEDS = {
  paused: 0,
  normal: 1,
  fast: 8,
} as const
export type Speed = keyof typeof SPEEDS

/**
 * Economy. Public support is the main income source (board, frame 8):
 * income scales with support, spending is staff plus operations per mission in flight.
 */
export const economy = {
  incomePerSupportPointPerMonth: 0.02, // $M per % of support per 30 days
  baseSpendingPerMonth: 0.95, // $M: staff, buildings
  opsPerFlyingMissionPerMonth: 0.1, // $M per mission in flight (ground station time)
}

export function monthlyIncome(support: number): number {
  return support * economy.incomePerSupportPointPerMonth
}

export function monthlySpending(missionsInFlight: number): number {
  return economy.baseSpendingPerMonth + missionsInFlight * economy.opsPerFlyingMissionPerMonth
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export type BuildingId = 'research-lab' | 'factory' | 'launch-site' | 'comms-center'

export interface Building {
  id: BuildingId
  name: string
  level: number
  /** Tile the footprint starts at (grid x, grid z) and its size in tiles */
  tile: [number, number]
  size: [number, number]
  /** What the building does, shown under its name */
  role: string
  /** Optional upgrade in progress, driven by the day counter */
  upgrade?: { toLevel: number; startDay: number; endDay: number }
}

export const buildings: Building[] = [
  {
    id: 'research-lab',
    name: 'Research Lab',
    level: 2,
    tile: [2, 2],
    size: [4, 4],
    role: 'Unlocks instruments and parts',
    upgrade: { toLevel: 3, startDay: 104, endDay: 122 },
  },
  {
    id: 'factory',
    name: 'Factory',
    level: 1,
    tile: [9, 2],
    size: [5, 4],
    role: 'Builds and tests spacecraft',
  },
  {
    id: 'comms-center',
    name: 'Communications Center',
    level: 1,
    tile: [2, 10],
    size: [4, 4],
    role: 'Ground station: data home',
  },
  {
    id: 'launch-site',
    name: 'Launch Site',
    level: 1,
    tile: [9, 9],
    size: [5, 5],
    role: 'Integration for rideshares',
  },
]

/** Empty plot for a future building (not interactive in the MVP) */
export const buildPlot = { tile: [16, 6] as [number, number], size: [3, 3] as [number, number] }

/** Map size in tiles */
export const MAP_SIZE = 20

/* ------------------------------------------------------------------ */
/* Example missions                                                    */
/* ------------------------------------------------------------------ */

export type MissionStatus = 'planning' | 'building' | 'transfer' | 'in-orbit' | 'complete'

export interface MissionView {
  id: string
  name: string
  status: MissionStatus
  progress: number // 0-1
  detail: string
  kind: 'satellite' | 'relay' | 'probe' | 'cubesat'
  isReal?: boolean
}

interface MockMission {
  id: string
  name: string
  kind: MissionView['kind']
  view: (day: number) => Omit<MissionView, 'id' | 'name' | 'kind'>
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Made-up missions that show what a running agency looks like */
export const mockMissions: MockMission[] = [
  {
    id: 'aurora-1',
    name: 'Aurora-1',
    kind: 'satellite',
    // 3U Earth-observation CubeSat, in low Earth orbit since day 41, one-year mission
    view: (day) => {
      const daysInOrbit = Math.max(0, day - 41)
      const dataMb = Math.round(daysInOrbit * 4.2)
      return {
        status: day >= 41 + 365 ? 'complete' : 'in-orbit',
        progress: clamp01(daysInOrbit / 365),
        detail: `Low Earth orbit · ${dataMb.toLocaleString()} MB home`,
      }
    },
  },
  {
    id: 'relay-pathfinder',
    name: 'Relay Pathfinder',
    kind: 'relay',
    // Lunar comms relay test on a 4-month low-energy transfer (like CAPSTONE), day 70 to 190
    view: (day) => {
      if (day < 190) {
        return {
          status: 'transfer',
          progress: clamp01((day - 70) / 120),
          detail: `Low-energy transfer · capture in ${Math.ceil(190 - day)} days`,
        }
      }
      return {
        status: 'in-orbit',
        progress: 1,
        detail: 'Halo orbit · relaying for lunar missions',
      }
    },
  },
  {
    id: 'solar-scout',
    name: 'Solar Scout',
    kind: 'probe',
    view: () => ({
      status: 'planning',
      progress: 0,
      detail: 'Waiting on research: deep-space radio',
    }),
  },
]

export function mockMissionViews(day: number): MissionView[] {
  return mockMissions.map((m) => ({ id: m.id, name: m.name, kind: m.kind, ...m.view(day) }))
}

/** Missions counted as in flight (they cost ground-station time) */
export function missionsInFlight(views: MissionView[]): number {
  return views.filter((v) => v.status === 'transfer' || v.status === 'in-orbit').length
}

/* ------------------------------------------------------------------ */
/* Event timeline                                                      */
/* ------------------------------------------------------------------ */

export type EventTone = 'info' | 'good' | 'warning' | 'bad'

export interface AgencyEvent {
  id: string
  day: number
  title: string
  detail?: string
  tone: EventTone
  /** One-off changes applied when the clock passes this day */
  fundsDelta?: number // $M
  supportDelta?: number // percentage points
}

/** Scripted events; past ones fill the activity feed, future ones the Upcoming list */
export const agencyEvents: AgencyEvent[] = [
  {
    id: 'founded',
    day: 0,
    title: 'Agency founded',
    detail: 'Mission control and a small research lab',
    tone: 'info',
  },
  {
    id: 'aurora-launch',
    day: 34,
    title: 'Aurora-1 launched',
    detail: 'Rideshare to low Earth orbit',
    tone: 'info',
  },
  {
    id: 'aurora-contact',
    day: 41,
    title: 'Aurora-1 first contact',
    detail: 'Signal received on the first pass',
    tone: 'good',
    supportDelta: 4,
  },
  {
    id: 'relay-deploy',
    day: 70,
    title: 'Relay Pathfinder deployed',
    detail: 'Starting a 4-month low-energy transfer to the Moon',
    tone: 'info',
  },
  {
    id: 'grant',
    day: 98,
    title: 'NASA small-sat grant',
    detail: '+$2.0M for lunar science',
    tone: 'good',
    fundsDelta: 2,
  },
  {
    id: 'lab-upgrade-start',
    day: 104,
    title: 'Research Lab upgrade started',
    detail: 'Level 3 unlocks the neutron spectrometer',
    tone: 'info',
  },
  {
    id: 'aurora-reset',
    day: 109,
    title: 'Aurora-1 radiation reset',
    detail: 'Computer rebooted; one day of data lost',
    tone: 'warning',
  },
  {
    id: 'aurora-images',
    day: 117,
    title: 'Aurora-1 image release',
    detail: 'Public support up',
    tone: 'good',
    supportDelta: 2,
  },
  {
    id: 'lab-upgrade-done',
    day: 122,
    title: 'Research Lab reaches level 3',
    detail: 'Neutron spectrometer unlocked',
    tone: 'good',
  },
  {
    id: 'relay-thruster',
    day: 146,
    title: 'Relay Pathfinder thruster check',
    detail: 'One thruster underperforming; margin still OK',
    tone: 'warning',
  },
  {
    id: 'budget-review',
    day: 160,
    title: 'Quarterly budget review',
    detail: 'Funding follows public support',
    tone: 'info',
  },
  {
    id: 'relay-capture',
    day: 190,
    title: 'Relay Pathfinder lunar capture',
    detail: 'The riskiest burn of the mission',
    tone: 'good',
    supportDelta: 5,
  },
]
// The Lunar Ice Mapper's own milestones (build, ride, capture) come from the logic core's
// flight log, on the base calendar from the moment it launches (src/viz/missionMap.ts).

/** Funds history before the demo starts, so the trend chart has something to show */
export function seedFundsHistory(): { day: number; funds: number }[] {
  const points: { day: number; funds: number }[] = []
  for (let day = 0; day <= DEMO_START_DAY; day += 7) {
    // Gentle climb from $12M with a dip around the Aurora-1 launch and a step at the grant
    const base = 12 + (day / DEMO_START_DAY) * 4.2
    const launchDip = day >= 34 && day < 60 ? -0.8 : 0
    const grant = day >= 98 ? 2 : 0
    const wobble = Math.sin(day / 9) * 0.25
    points.push({ day, funds: Math.round((base + launchDip + grant + wobble) * 100) / 100 })
  }
  points.push({ day: DEMO_START_DAY, funds: DEMO_START_FUNDS })
  return points
}
