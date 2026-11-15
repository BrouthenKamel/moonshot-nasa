import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import type { Design } from '../../sim/types'
import { LaunchDayGame, type LaunchDayDemo } from './LaunchDayGame'

/** Is this page asking for Launch Day? (?minigame=launch) */
export function wantsLaunchDay(search: string): boolean {
  return new URLSearchParams(search).get('minigame') === 'launch'
}

/**
 * Opens Launch Day on its own. It flies the ride in your save, and the address can try others:
 *   ?minigame=launch&ride=ride-gto
 * &start=1 skips the briefing, &auto=1 lets the autopilot fly it.
 */
export function LaunchDayRoute() {
  const saved = useGameStore((s) => s.design)
  const q = useMemo(() => new URLSearchParams(window.location.search), [])
  const design: Design = useMemo(() => {
    const ride = q.get('ride')
    return { ...saved, ...(ride ? { ride } : {}) }
  }, [saved, q])
  const demo: LaunchDayDemo = { start: q.has('start'), auto: q.has('auto') }
  return <LaunchDayGame design={design} demo={demo} onDone={() => window.location.assign(window.location.pathname)} />
}
