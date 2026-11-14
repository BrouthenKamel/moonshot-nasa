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

  setSpeed: (speed: Speed) => void
  /** Advance the clock by real seconds at the current speed */
  tick: (seconds: number) => void
  markLunarMissionStarted: () => void
  resetAgency: () => void
}

const initialState = () => ({
  day: DEMO_START_DAY,
  funds: DEMO_START_FUNDS,
  support: DEMO_START_SUPPORT,
  speed: 'normal' as Speed,
  fundsHistory: seedFundsHistory(),
  lunarMissionStartedDay: null as number | null,
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
        const { speed } = get()
        const rate = SPEEDS[speed]
        if (rate === 0 || seconds <= 0) return
        set((state) => advanceAgency(state, state.day + rate * seconds))
      },

      markLunarMissionStarted: () =>
        set((state) => ({
          lunarMissionStartedDay: state.lunarMissionStartedDay ?? Math.floor(state.day),
        })),

      resetAgency: () => set(initialState()),
    }),
    {
      name: 'moonshot-agency',
      version: 1,
    }
  )
)
