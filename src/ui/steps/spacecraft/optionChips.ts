import type { ChoiceStat } from '../../kit/ChoiceCard'
import type { TrayKey, TrayOption } from '../../../viz/spacecraft/trayOptions'

/** The label of each category's key number (the last item of TrayOption.stats) */
const KEY_LABEL: Record<TrayKey, string> = {
  solar: 'Power',
  battery: 'Energy',
  computer: 'Storage',
  attitude: 'Pointing',
  propulsion: 'Fuelled',
}

/**
 * Every number of a tray option as labelled chips, read from TrayOption.stats
 * ("mass · volume · cost · key", built by trayGroups): nothing is recomputed here.
 */
export function optionChips(key: TrayKey, o: TrayOption): ChoiceStat[] {
  const parts = o.stats.split(' · ')
  const keyValue = parts[parts.length - 1]?.replace(/ fuelled$/, '') ?? ''
  const chips: ChoiceStat[] = [{ label: KEY_LABEL[key], value: keyValue }]
  for (const p of parts.slice(0, -1)) {
    if (p.startsWith('$')) chips.push({ label: 'Cost', value: p })
    else if (p.endsWith(' U')) chips.push({ label: 'Volume', value: p })
    else if (p.endsWith(' kg')) chips.push({ label: key === 'propulsion' ? 'Dry' : 'Mass', value: p })
  }
  return chips
}
