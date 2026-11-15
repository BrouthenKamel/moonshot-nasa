import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useAgencyStore } from '../../state/agencyStore'
import { useUiStore } from '../../state/uiStore'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { transfers, isTransferCompatible } from '../../data/transfers'
import { getPartById, type PropulsionPart } from '../../data/parts'
import { buildRideView, type RideView } from './rideView'

/** Live view of the ride step, recomputed when the design, preview, or difficulty changes. */
export function useRideView(): RideView {
  const design = useGameStore((s) => s.design)
  const previewPatch = useUiStore((s) => s.previewPatch)
  const difficulty = useGameStore((s) => s.difficulty)
  const day = useAgencyStore((s) => s.day)
  return useMemo(() => {
    const active = previewPatch ? { ...design, ...previewPatch } : design
    const b = computeBudgets(active, difficulty)
    return buildRideView(active, difficulty, b, goNoGo(active, b, day).checks)
  }, [design, previewPatch, difficulty, day])
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
