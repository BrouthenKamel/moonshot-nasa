import { useEffect, useState } from 'react'
import type { Difficulty } from '../data/brief'
import type { Design } from '../sim/types'
import {
  cachedSuccess,
  estimateSuccess,
  planningOdds,
  planningOddsCached,
  type PlanningOdds,
  type SuccessEstimate,
} from '../sim/odds'

/** Wait this long after the last change before working out new odds, so dragging a control stays smooth */
const SETTLE_MS = 120

/**
 * A value worked out from the odds cache: returned at once when cached,
 * otherwise undefined while it is worked out a moment later (off the render).
 */
function useCachedOdds<T>(key: string, cached: () => T | undefined, compute: () => T): T | undefined {
  const [, setDone] = useState('')
  // Runs after every render; each new render restarts the wait, so the work happens once things settle
  useEffect(() => {
    if (cached() !== undefined) return
    const id = setTimeout(() => {
      compute()
      setDone(key)
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [key, cached, compute])
  return cached()
}

/** Chance of each outcome for the design as it stands; undefined while being worked out */
export function useSuccessEstimate(design: Design, difficulty: Difficulty): SuccessEstimate | undefined {
  return useCachedOdds(
    JSON.stringify([design, difficulty]),
    () => cachedSuccess(design, difficulty),
    () => estimateSuccess(design, difficulty)
  )
}

/** Chance of full success at every test-time and reserve setting; undefined while being worked out */
export function usePlanningOdds(design: Design, difficulty: Difficulty): PlanningOdds | undefined {
  return useCachedOdds(
    JSON.stringify([design, difficulty]),
    () => (planningOddsCached(design, difficulty) ? planningOdds(design, difficulty) : undefined),
    () => planningOdds(design, difficulty)
  )
}
