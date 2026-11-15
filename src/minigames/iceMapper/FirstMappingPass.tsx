import { useEffect, useMemo } from 'react'
import { computeBudgets } from '../../sim/budgets'
import type { SimState } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { IceMapperGame } from './IceMapperGame'
import { passDue, useIcePassStore } from './passStore'

/**
 * The flight's hand-off to the Ice Mapper (KrabbyKrabby's mini game): once the craft is in its
 * science orbit, the flight holds and the player flies one mapping pass with their own design,
 * instruments from Science and battery from Craft. Then the month-by-month flight goes on. The pass
 * shows the sim's forecast beside its own result and never changes the flight.
 */
export function FirstMappingPass({ sim }: { sim: SimState }) {
  const doneSeed = useIcePassStore((s) => s.doneSeed)
  const played = useIcePassStore((s) => s.played)
  const finish = useIcePassStore((s) => s.finish)
  const devAutopilot = useIcePassStore((s) => s.devAutopilot)
  const due = passDue(sim, doneSeed)
  const forecast = useMemo(() => computeBudgets(sim.design, sim.difficulty).projectedCoverage, [sim.design, sim.difficulty])

  // Auto-fly stops at arrival already (a phase change); this makes sure no tick lands during the pass
  useEffect(() => {
    if (due) useGameStore.getState().stopAutoFly()
  }, [due])

  if (!due) return null
  return (
    <IceMapperGame
      design={sim.design}
      forecast={forecast}
      skippable={played}
      autopilot={import.meta.env.DEV && devAutopilot}
      onDone={(r) => finish(sim.seed, r !== null)}
    />
  )
}
