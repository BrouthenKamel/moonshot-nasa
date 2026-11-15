import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CAMPAIGN, defaultPicks, missionById, planOf, type CampaignMissionId, type Picks } from '../campaign/missions'
import { flyMission, type CampaignFlight } from '../campaign/flight'
import { approveCampaignMission, awardIceMapper, canAfford, settleCampaignFlight, type CampaignResult } from '../campaign/ledger'
import { emptyProgress, firstSuccess, isOpen, markOpened, recordFlight, type CampaignProgress } from '../campaign/progress'
import type { Outcome, PayoffKind } from '../campaign/scenes/types'
import { generateSeed } from '../sim/rng'
import type { World } from '../game/world'
import { useWorldStore } from './worldStore'
import { useGameStore } from './gameStore'

/**
 * The campaign layer over the agency: the ladder's records,
 * and the flow of one campaign mission (missions 2-4). Money and popularity live in the agency
 * (worldStore); every change goes through the pure rules in src/campaign/ledger.ts.
 *
 * Mission 1 is main's Lunar Ice Mapper, flown exactly as before. When it settles, the listener at
 * the bottom records it on the ladder, adds the campaign's milestone award and queues its payoff.
 */

/** Where a campaign mission stands. Choices are numbered screens 0..n-1. */
export type Stage =
  | { kind: 'brief' }
  | { kind: 'choice'; index: number }
  | { kind: 'go' }
  | { kind: 'liftoff' }
  | { kind: 'cruise' }
  | { kind: 'payoff' }
  | { kind: 'result' }

export interface ActiveMission {
  missionId: CampaignMissionId
  picks: Picks
  stage: Stage
  flight: CampaignFlight | null
  paid: number
  result: CampaignResult | null
}

interface CampaignState {
  progress: CampaignProgress
  /** The ladder overlay is showing */
  ladderOpen: boolean
  /** The mission whose flight just opened the next rung (the ladder says "Unlocked!"), until the ladder closes */
  unlockedBy: CampaignMissionId | null
  /** The choices of each mission's last flight (a relaunch and the "try again" line start from them) */
  lastPicks: Partial<Record<CampaignMissionId, Picks>>
  active: ActiveMission | null
  /** A payoff to play over the base (mission 1's ice map) */
  pendingPayoff: { kind: PayoffKind; outcome: Outcome } | null
  /** Agency mission seeds already booked on the ladder */
  bookedSeeds: number[]

  openLadder: () => void
  /** Open the ladder after a flight of `missionId`: the rung it unlocked says so */
  openLadderAfter: (missionId: CampaignMissionId) => void
  closeLadder: () => void
  /** Start a mission from the ladder: mission 1 goes to main's flow, 2-4 to the campaign flow */
  startMission: (id: CampaignMissionId) => void
  pick: (choiceId: string, optionId: string) => void
  goTo: (stage: Stage) => void
  /** Go for launch: pay, fly (seeded), then the shows play */
  launch: () => void
  /** The liftoff show ended */
  liftoffDone: () => void
  cruiseDone: () => void
  /** The payoff ended: settle the books */
  payoffDone: () => void
  /** Leave the result: back to the ladder */
  finish: () => void
  /** From a result: back to the first design screen of the same mission, choices kept */
  relaunch: () => void
  abandon: () => void
  clearPayoff: () => void
  resetCampaign: () => void
}

const worldOf = (): World => {
  const s = useWorldStore.getState()
  return { day: s.day, funds: s.funds, popularity: s.popularity, history: s.history, feed: s.feed, mission: s.mission, research: s.research }
}

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set, get) => ({
      progress: emptyProgress(),
      ladderOpen: false,
      unlockedBy: null,
      lastPicks: {},
      active: null,
      pendingPayoff: null,
      bookedSeeds: [],

      openLadder: () => set({ ladderOpen: true }),
      openLadderAfter: (missionId) => set({ ladderOpen: true, unlockedBy: missionId }),
      closeLadder: () => set({ ladderOpen: false, unlockedBy: null }),

      startMission: (id) => {
        const w = useWorldStore.getState()
        const mission = missionById(id)
        if (!isOpen(get().progress, mission, w.funds, w.popularity)) return
        set((s) => ({ progress: markOpened(s.progress, id), ladderOpen: false, unlockedBy: null }))
        if (id === 'ice-mapper') {
          // Main's own flow: a finished flight goes to the history, the new mission starts at the Comms Center
          const game = useGameStore.getState()
          if (game.simState) game.startNewMission()
          useWorldStore.getState().openMission()
          return
        }
        set((s) => ({ active: { missionId: id, picks: s.lastPicks[id] ?? defaultPicks(mission), stage: { kind: 'brief' }, flight: null, paid: 0, result: null } }))
      },

      pick: (choiceId, optionId) =>
        set((s) => (s.active ? { active: { ...s.active, picks: { ...s.active.picks, [choiceId]: optionId } } } : {})),

      goTo: (stage) => set((s) => (s.active ? { active: { ...s.active, stage } } : {})),

      launch: () => {
        const a = get().active
        if (!a || a.flight) return
        const mission = missionById(a.missionId)
        const plan = planOf(mission, a.picks)
        const world = worldOf()
        if (!canAfford(world, plan)) return
        const { world: after, paid } = approveCampaignMission(world, mission, plan)
        useWorldStore.setState(after)
        const flight = flyMission(mission, a.picks, generateSeed())
        set((s) => ({ active: { ...a, flight, paid, stage: { kind: 'liftoff' } }, lastPicks: { ...s.lastPicks, [a.missionId]: a.picks } }))
      },

      liftoffDone: () => {
        const a = get().active
        if (!a?.flight) return
        // A rocket lost on the way up has nothing left to show: straight to the books
        if (a.flight.failedAt === 'launch') {
          get().payoffDone()
          return
        }
        set({ active: { ...a, stage: { kind: 'cruise' } } })
      },

      cruiseDone: () => set((s) => (s.active ? { active: { ...s.active, stage: { kind: 'payoff' } } } : {})),

      payoffDone: () => {
        const a = get().active
        if (!a?.flight || a.result) return
        const mission = missionById(a.missionId)
        const first = firstSuccess(get().progress, mission.id)
        const { world, result } = settleCampaignFlight(worldOf(), mission, a.flight, a.paid, first)
        useWorldStore.setState(world)
        set((s) => ({
          progress: recordFlight(s.progress, { missionId: mission.id, outcome: a.flight!.outcome, science: a.flight!.science, day: world.day, seed: a.flight!.seed }),
          active: { ...a, result, stage: { kind: 'result' } },
        }))
      },

      finish: () => set((s) => ({ active: null, ladderOpen: true, unlockedBy: s.active?.missionId ?? null })),
      relaunch: () =>
        set((s) =>
          s.active?.result
            ? { active: { missionId: s.active.missionId, picks: s.active.picks, stage: { kind: 'choice', index: 0 }, flight: null, paid: 0, result: null } }
            : {}
        ),
      abandon: () => set((s) => (s.active && !s.active.flight ? { active: null, ladderOpen: true } : {})),
      clearPayoff: () => set({ pendingPayoff: null }),
      resetCampaign: () => set({ progress: emptyProgress(), active: null, pendingPayoff: null, ladderOpen: false, unlockedBy: null, lastPicks: {}, bookedSeeds: [] }),
    }),
    {
      name: 'moonshot-campaign-proto',
      version: 1,
      partialize: (s) => ({ progress: s.progress, active: s.active, bookedSeeds: s.bookedSeeds, lastPicks: s.lastPicks }),
    }
  )
)

/** Mission 1 settled through main's rules: book it on the ladder, add the milestone award, play the ice map */
export function bookIceMapper(world: Pick<World, 'mission'>) {
  const m = world.mission
  if (!m || !m.settled || !m.last.ended) return
  const store = useCampaignStore.getState()
  if (store.bookedSeeds.includes(m.seed)) return
  const outcome: Outcome = m.last.outcome ?? 'failed'
  const mission = CAMPAIGN[0]
  const first = firstSuccess(store.progress, mission.id)
  useWorldStore.setState(awardIceMapper(worldOf(), mission, outcome, first))
  useCampaignStore.setState((s) => ({
    bookedSeeds: [...s.bookedSeeds, m.seed],
    progress: recordFlight(s.progress, { missionId: mission.id, outcome, science: Math.round(m.last.coverage), day: useWorldStore.getState().day, seed: m.seed }),
    pendingPayoff: { kind: 'ice-map', outcome },
  }))
}

useWorldStore.subscribe((s, prev) => {
  if (s.mission !== prev.mission) bookIceMapper(s)
})
// Reset demo / Start over of the whole agency also resets the ladder
useWorldStore.subscribe((s, prev) => {
  if (s.mission === null && prev.mission !== null && s.day < prev.day) useCampaignStore.getState().resetCampaign()
})
