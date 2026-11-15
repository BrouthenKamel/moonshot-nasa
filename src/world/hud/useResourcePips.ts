import { useMemo } from 'react'
import { computeBudgets } from '../../sim/budgets'
import { useCampusStore } from '../../state/campusStore'
import { useGameStore } from '../../state/gameStore'
import { resourcePips, type ResourcePip } from './resources'

/** The six craft-status pips for the live design and the rooms finished so far */
export function useResourcePips(): ResourcePip[] {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const completed = useCampusStore((s) => s.completedRooms)
  return useMemo(() => resourcePips(computeBudgets(design, difficulty), completed), [design, difficulty, completed])
}
