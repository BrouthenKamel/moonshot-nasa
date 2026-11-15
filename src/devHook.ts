import { useGameStore } from './state/gameStore'
import { useUiStore } from './state/uiStore'
import { useDragStore } from './ui/interaction/dragStore'
import { useInsideStore } from './ui/interaction/insideStore'
import { useWorldStore } from './state/worldStore'
import { useCampaignStore } from './state/campaignStore'
import { CAMPAIGN, type CampaignMissionId } from './campaign/missions'
import { awardIceMapper } from './campaign/ledger'
import { markOpened, recordFlight } from './campaign/progress'
import type { Outcome } from './campaign/scenes/types'
import { clampPopularity, popularityEffects } from './game/economy'

/**
 * Dev builds only: the stores on `window.__moonshot`, so the Playwright checks in `scripts/e2e`
 * can jump straight to a step and read the design after a drag. Never shipped in production.
 *
 * Campaign shortcuts on `window.__moonshot.campaign`:
 * - `money(funds, popularity)`: set the agency wallet
 * - `iceMapper('success')`: book mission 1 as flown (award + ice-map payoff), without the 14-month flight
 * - `unlock('mars-base')`: mark every mission before it flown and open it
 * - `fly('moon-landing')`: open the ladder's mission flow straight away
 */
export function installDevHook() {
  const campaign = {
    money(funds: number, popularity: number) {
      useWorldStore.setState({ funds, popularity })
    },
    iceMapper(outcome: Outcome = 'success') {
      const w = useWorldStore.getState()
      // What main's own settlement would add: the launch and the result (src/game/world.ts)
      const effect = outcome === 'success' ? popularityEffects.missionSuccess : outcome === 'partial' ? popularityEffects.missionPartial : popularityEffects.missionFailed
      const settled = { ...w, popularity: clampPopularity(w.popularity + popularityEffects.launch + effect) }
      useWorldStore.setState(awardIceMapper(settled, CAMPAIGN[0], outcome, true))
      useCampaignStore.setState((s) => ({
        progress: recordFlight(s.progress, { missionId: 'ice-mapper', outcome, science: 75, day: w.day, seed: Date.now() }),
        pendingPayoff: { kind: 'ice-map', outcome },
      }))
    },
    unlock(id: CampaignMissionId) {
      const n = CAMPAIGN.findIndex((m) => m.id === id)
      useCampaignStore.setState((s) => {
        let p = s.progress
        for (const m of CAMPAIGN.slice(0, n)) p = markOpened(recordFlight(p, { missionId: m.id, outcome: 'success', science: 0, day: 0, seed: 1000 + m.n }), m.id)
        return { progress: markOpened(p, id) }
      })
    },
    fly(id: CampaignMissionId) {
      campaign.unlock(id)
      useCampaignStore.getState().startMission(id)
    },
    store: useCampaignStore,
  }
  ;(window as unknown as { __moonshot: unknown }).__moonshot = {
    game: useGameStore,
    ui: useUiStore,
    drag: useDragStore,
    inside: useInsideStore,
    world: useWorldStore,
    campaign,
  }
}
