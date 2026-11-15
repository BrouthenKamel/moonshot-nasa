import { missionFunding } from '../../game/economy'
import { missionBudget } from '../../game/missionLink'
import { useWorldStore } from '../../state/worldStore'

/** What a (re)launch costs the agency, so the retry's price is never a surprise: "Relaunch costs about $9.1M · you have $4.0M" */
export function launchCostText(budget: number, popularity: number, funds: number, verb: 'Launch' | 'Relaunch'): { text: string; short: boolean } {
  const { agencyPays } = missionFunding(budget, popularity)
  return {
    text: `${verb} costs about $${agencyPays.toFixed(1)}M · you have $${Math.max(0, funds).toFixed(1)}M`,
    short: funds + 0.05 < agencyPays,
  }
}

export function LaunchCostLine({ verb = 'Relaunch', className = '' }: { verb?: 'Launch' | 'Relaunch'; className?: string }) {
  const funds = useWorldStore((s) => s.funds)
  const popularity = useWorldStore((s) => s.popularity)
  const { text, short } = launchCostText(missionBudget(), popularity, funds, verb)
  return (
    <p data-testid="launch-cost" className={`fp-data text-[0.72rem] ${short ? 'text-caution' : 'text-paper-dim'} ${className}`}>
      {text}
    </p>
  )
}
