import { useMemo } from 'react'
import { useGameStore } from '../state/gameStore'
import { useUiStore } from '../state/uiStore'
import { computeBudgets } from '../sim/budgets'
import { goNoGo } from '../sim/checks'
import type { Budgets, Design, GoNoGoResult } from '../sim/types'
import { computeDesignDelta, type DeltaLine } from '../viz/designDelta'

export interface DesignPreviewState {
  budgets: Budgets
  checks: GoNoGoResult
  previewBudgets: Budgets | null
  previewChecks: GoNoGoResult | null
  deltas: DeltaLine[]
  isPreviewing: boolean
  previewPatch: Partial<Design> | null
}

/**
 * Computes current mission budgets + live "what-if" preview budgets whenever
 * the player hovers a candidate part, orbit, ride, transfer, or ground station.
 */
export function useDesignPreview(): DesignPreviewState {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const previewPatch = useUiStore((s) => s.previewPatch)

  return useMemo(() => {
    const budgets = computeBudgets(design, difficulty)
    const checks = goNoGo(design, budgets)

    if (!previewPatch) {
      return {
        budgets,
        checks,
        previewBudgets: null,
        previewChecks: null,
        deltas: [],
        isPreviewing: false,
        previewPatch: null,
      }
    }

    const nextDesign: Design = { ...design, ...previewPatch }
    const previewBudgets = computeBudgets(nextDesign, difficulty)
    const previewChecks = goNoGo(nextDesign, previewBudgets)
    const deltas = computeDesignDelta(budgets, previewBudgets)

    return {
      budgets,
      checks,
      previewBudgets,
      previewChecks,
      deltas,
      isPreviewing: true,
      previewPatch,
    }
  }, [design, difficulty, previewPatch])
}
