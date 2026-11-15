import { useCampaignStore } from '../../state/campaignStore'
import { PayoffShow } from '../../campaign/scenes/PayoffShow'
import { CampaignLadder } from './CampaignLadder'
import { CampaignMissionFlow } from './CampaignMissionFlow'

/**
 * Everything the campaign prototype draws over the agency base: the ladder, a campaign mission in
 * progress, and mission 1's ice-map payoff when the Ice Mapper settles. Mounted once by BaseScreen.
 */
export function CampaignLayer() {
  const ladderOpen = useCampaignStore((s) => s.ladderOpen)
  const active = useCampaignStore((s) => s.active)
  const payoff = useCampaignStore((s) => s.pendingPayoff)
  const clearPayoff = useCampaignStore((s) => s.clearPayoff)
  return (
    <>
      {active ? <CampaignMissionFlow /> : ladderOpen && <CampaignLadder />}
      {payoff && (
        <div className="relative z-[60]">
          <PayoffShow kind={payoff.kind} outcome={payoff.outcome} onDone={clearPayoff} />
        </div>
      )}
    </>
  )
}
