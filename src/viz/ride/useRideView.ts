import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import { transfers, isTransferCompatible } from '../../data/transfers'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { buildRideView, type RideView } from './rideView'

/** Live view of the ride step, recomputed when the design or difficulty changes. */
export function useRideView(): RideView {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  return useMemo(
    () => buildRideView(design, difficulty, getBudgets(), getGoNoGo().checks),
    // getBudgets / getGoNoGo read design and difficulty from the store
    [design, difficulty, getBudgets, getGoNoGo]
  )
}

/** Choose a rideshare. The only field besides `transfer` this step writes. */
export function chooseRide(id: string): void {
  const { design, updateDesign } = useGameStore.getState()
  if (design.ride !== id) updateDesign({ ride: id })
}

/** Choose a transfer; ignored when the engine cannot fly it (as the plain cards do). */
export function chooseTransfer(id: string): void {
  const { design, updateDesign } = useGameStore.getState()
  const transfer = transfers.find((t) => t.id === id)
  if (!transfer || design.transfer === id) return
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  if (!isTransferCompatible(transfer, propulsion?.type ?? 'chemical')) return
  updateDesign({ transfer: id })
}
