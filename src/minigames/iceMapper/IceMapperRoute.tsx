import { useMemo } from 'react'
import { useGameStore } from '../../state/gameStore'
import type { Design } from '../../sim/types'
import { IceMapperGame, type IceMapperDemo } from './IceMapperGame'

const INSTRUMENTS: Record<string, string> = { ir: 'inst-ir-spec', laser: 'inst-laser', camera: 'inst-camera', neutron: 'inst-neutron' }
const BATTERIES = ['small', 'medium', 'large']

/** Is this page asking for the Ice Mapper? (?minigame=ice) */
export function wantsIceMapper(search: string): boolean {
  return new URLSearchParams(search).get('minigame') === 'ice'
}

/**
 * Opens the Ice Mapper on its own. It plays the design in your save, and the address can try others:
 *   ?minigame=ice&inst=laser,neutron&battery=medium
 * (inst: ir, laser, camera, neutron; battery: small, medium, large). &start=1 skips the briefing,
 * &auto=1 lets the autopilot fly, &skip=12 starts twelve seconds in.
 */
export function IceMapperRoute() {
  const saved = useGameStore((s) => s.design)
  const q = useMemo(() => new URLSearchParams(window.location.search), [])
  const design: Design = useMemo(() => {
    const inst = q.get('inst')?.split(',').map((k) => INSTRUMENTS[k]).filter(Boolean)
    const battery = q.get('battery')
    return {
      ...saved,
      ...(inst?.length ? { instruments: inst } : {}),
      ...(battery && BATTERIES.includes(battery) ? { battery: `battery-${battery}` } : {}),
    }
  }, [saved, q])
  const demo: IceMapperDemo = { start: q.has('start') || q.has('skip'), auto: q.has('auto'), skip: Number(q.get('skip')) || undefined }
  return <IceMapperGame design={design} demo={demo} onExit={() => window.location.assign(window.location.pathname)} />
}
