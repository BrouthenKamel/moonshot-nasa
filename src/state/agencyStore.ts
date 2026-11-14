import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEMO_START_DAY,
  DEMO_START_FUNDS,
  DEMO_START_SUPPORT,
  SPEEDS,
  agencyEvents,
  missionsInFlight,
  mockMissionViews,
  monthlyIncome,
  monthlySpending,
  seedFundsHistory,
  type Speed,
} from '../data/agency'

/**
 * Agency base state: a continuous day clock with money and public support.
 * Saved in the browser so the base picks up where it was left.
 */
export interface AgencyState {
  day: number // continuous, fractional
  funds: number // $M
  support: number // %
  speed: Speed
  fundsHistory: { day: number; funds: number }[]
  /** Day the player started planning the Lunar Ice Mapper, or null */
  lunarMissionStartedDay: number | null
  /** Day the Lunar Ice Mapper's flight started (turn 0). While set, the clock follows the mission turns. */
  missionStartDay: number | null

  setSpeed: (speed: Speed) => void
  /** Advance the clock by real seconds at the current speed (not while a mission clock runs) */
  tick: (seconds: number) => void
  markLunarMissionStarted: () => void
  /** The flight starts: from now on the base day follows the mission turns */
  startMissionClock: () => void
  /** Back to the free-running clock (new mission, or the flight was lost on reload) */
  resetMissionClock: () => void
  /** Move the clock to the day of a mission turn; never rewinds */
  syncToMissionTurn: (turn: number) => void
  resetAgency: () => void
}

/** One mission turn is one month on the base calendar */
export const DAYS_PER_TURN = 30

/** Saved state from an older version: version 1 had no mission clock */
export function migrateAgencyState(persisted: unknown, version: number): AgencyState {
  const state = (persisted ?? {}) as Partial<AgencyState>
  if (version < 2) return { ...state, missionStartDay: null } as AgencyState
  return state as AgencyState
}

/** Base day of a mission turn */
export function missionDay(startDay: number, turn: number): number {
  return startDay + turn * DAYS_PER_TURN
}

const initialState = () => ({
  day: DEMO_START_DAY,
  funds: DEMO_START_FUNDS,
  support: DEMO_START_SUPPORT,
  speed: 'normal' as Speed,
  fundsHistory: seedFundsHistory(),
  lunarMissionStartedDay: null as number | null,
  missionStartDay: null as number | null,
})

const round2 = (x: number) => Math.round(x * 100) / 100

/** Advance from one day to a later one: daily cash flow plus any scripted events passed */
export function advanceAgency(
  state: Pick<AgencyState, 'day' | 'funds' | 'support' | 'fundsHistory'>,
  toDay: number
): Pick<AgencyState, 'day' | 'funds' | 'support' | 'fundsHistory'> {
  const fromDay = state.day
  if (toDay <= fromDay) return state

  const flying = missionsInFlight(mockMissionViews(fromDay))
  const netPerDay = (monthlyIncome(state.support) - monthlySpending(flying)) / 30
  let funds = state.funds + netPerDay * (toDay - fromDay)
  let support = state.support

  for (const event of agencyEvents) {
    if (event.day > fromDay && event.day <= toDay) {
      funds += event.fundsDelta ?? 0
      support += event.supportDelta ?? 0
    }
  }
  support = Math.max(0, Math.min(100, support))

  // One history point per whole day crossed, capped to keep storage small
  let fundsHistory = state.fundsHistory
  if (Math.floor(toDay) > Math.floor(fromDay)) {
    fundsHistory = [...fundsHistory, { day: Math.floor(toDay), funds: round2(funds) }].slice(-400)
  }

  return { day: toDay, funds, support, fundsHistory }
}

export const useAgencyStore = create<AgencyState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      setSpeed: (speed) => set({ speed }),

      tick: (seconds) => {
        const { speed, missionStartDay } = get()
        const rate = SPEEDS[speed]
        if (missionStartDay !== null || rate === 0 || seconds <= 0) return
        set((state) => advanceAgency(state, state.day + rate * seconds))
      },

      markLunarMissionStarted: () =>
        set((state) => ({
          lunarMissionStartedDay: state.lunarMissionStartedDay ?? Math.floor(state.day),
        })),

      startMissionClock: () => set((state) => ({ missionStartDay: Math.floor(state.day) })),

      resetMissionClock: () => set({ missionStartDay: null }),

      syncToMissionTurn: (turn) => {
        const { missionStartDay } = get()
        if (missionStartDay === null) return
        set((state) => advanceAgency(state, missionDay(missionStartDay, turn)))
      },

      resetAgency: () => set(initialState()),
    }),
    {
      name: 'moonshot-agency',
      version: 2,
      migrate: migrateAgencyState,
    }
  )
)
