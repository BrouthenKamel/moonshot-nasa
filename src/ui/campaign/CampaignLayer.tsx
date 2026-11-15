import { useEffect } from 'react'
import { useCampaignStore } from '../../state/campaignStore'
import { useWorldStore } from '../../state/worldStore'
import { missionById } from '../../campaign/missions'
import { nextMission } from '../../campaign/progress'
import { preloadPayoff } from '../../campaign/scenes/preloadPayoff'
import { PayoffShow } from '../../campaign/scenes/PayoffShow'
import { CampaignLadder } from './CampaignLadder'
import { CampaignMissionFlow } from './CampaignMissionFlow'

/**
 * Everything the campaign draws over the agency base: the ladder, a campaign mission in
 * progress, and mission 1's ice-map payoff when the Ice Mapper settles. Mounted once by BaseScreen.
 */
export function CampaignLayer() {
  const ladderOpen = useCampaignStore((s) => s.ladderOpen)
  const active = useCampaignStore((s) => s.active)
  const payoff = useCampaignStore((s) => s.pendingPayoff)
  const clearPayoff = useCampaignStore((s) => s.clearPayoff)
  const progress = useCampaignStore((s) => s.progress)
  const iceMapperFlying = useWorldStore((s) => !!s.mission && !s.mission.last.ended)

  // Fetch the payoff a show will need before it starts, so it never opens on a black frame:
  // the ice map while mission 1 flies, the mission being planned, and the next rung once the ladder opens
  useEffect(() => {
    if (iceMapperFlying) preloadPayoff('ice-map')
  }, [iceMapperFlying])
  useEffect(() => {
    if (active) preloadPayoff(missionById(active.missionId).payoff)
    else if (ladderOpen) {
      const next = nextMission(progress)
      if (next) preloadPayoff(next.payoff)
    }
  }, [active, ladderOpen, progress])
  return (
    <>
      {active ? <CampaignMissionFlow /> : ladderOpen && <CampaignLadder />}
      {payoff && (
        <div className="relative z-[60]">
          <PayoffShow kind={payoff.kind} outcome={payoff.outcome} cause={payoff.cause} onDone={clearPayoff} />
        </div>
      )}
    </>
  )
}
