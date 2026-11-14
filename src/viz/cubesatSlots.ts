import { lunarIceMapperBrief } from '../data/brief'
import { getPartById, type PartCategory } from '../data/parts'
import type { Design } from '../sim/types'

export interface Slot {
  category: PartCategory
  partId: string
  name: string
  volume: number
}

export interface SlotLayout {
  slots: Slot[]
  usedU: number
  limitU: number
  overLimit: boolean
  solar: 'body' | 'deployable' | 'none'
}

function solarKind(id: string): SlotLayout['solar'] {
  if (id === 'solar-body') return 'body'
  if (id === 'solar-1wing' || id === 'solar-2wing') return 'deployable'
  return 'none'
}

/** Lay out the selected parts that occupy volume inside the 6U bus. */
export function buildSlots(design: Design): SlotLayout {
  const limitU = lunarIceMapperBrief.constraints.maxVolume
  const entries: Array<[PartCategory, string]> = [
    ...(design.instruments ?? []).map((id): [PartCategory, string] => ['instrument', id]),
    ['battery', design.battery],
    ['radio', design.radio],
    ['computer', design.computer],
    ['attitude', design.attitude],
    ['propulsion', design.propulsion],
    ['solar', design.solar],
  ]

  const slots: Slot[] = []
  for (const [category, partId] of entries) {
    const part = getPartById(partId)
    if (!part || part.category !== category || !(part.volume > 0)) continue
    slots.push({ category, partId, name: part.name, volume: part.volume })
  }

  const usedU = slots.reduce((sum, s) => sum + s.volume, 0)
  return {
    slots,
    usedU,
    limitU,
    overLimit: usedU > limitU,
    solar: solarKind(design.solar),
  }
}
