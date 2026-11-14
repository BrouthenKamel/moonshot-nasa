import {
  solarPanels,
  batteries,
  computers,
  attitudeControls,
  propulsionSystems,
  type BasePart,
} from '../../data/parts'
import { modelConstants as C } from '../../data/brief'
import type { Budgets } from '../../sim/types'

/** The five Factory choices as tray groups, with every fact the old cards showed. */

export type TrayKey = 'solar' | 'battery' | 'computer' | 'attitude' | 'propulsion'

export interface TrayOption {
  id: string
  short: string
  stats: string // mass · volume · cost · one key number
  description: string
  facts: string // everything else the old card showed
}

export interface TrayGroup {
  key: TrayKey
  title: string
  color: string
  options: TrayOption[]
}

/** Colours shared by the tray outline and the matching block in the bay. */
export const CATEGORY_COLORS: Record<string, string> = {
  solar: '#3b82f6',
  battery: '#22c55e',
  computer: '#a855f7',
  attitude: '#f472b6', // pink: cyan is reserved for ice
  propulsion: '#f59e0b',
  instrument: '#64748b',
  radio: '#64748b',
}

const SHORT: Record<string, string> = {
  'solar-body': 'Body panels',
  'solar-1wing': 'Deployable wings',
  'solar-2wing': 'Large array',
  'battery-small': 'Small',
  'battery-medium': 'Medium',
  'battery-large': 'Large',
  'computer-basic': 'Basic',
  'computer-redundant': 'Rad-hard, redundant',
  'attitude-basic': 'Basic',
  'attitude-precision': 'Precision + star tracker',
  'prop-coldgas': 'Cold gas',
  'prop-chemical': 'Green mono, 2 kg',
  'prop-chemical-large': 'Green mono, 3 kg',
  'prop-ion': 'Ion, 1.0 kg',
  'prop-ion-large': 'Ion, 1.5 kg',
}

const base = (p: BasePart, key: string) => `${p.mass} kg · ${p.volume ? `${p.volume} U · ` : ''}$${p.cost}M · ${key}`

export function trayGroups(b: Budgets): TrayGroup[] {
  const eclipseW = b.eclipsePowerConsumed > 0 ? b.eclipsePowerConsumed : 0
  const opt = (p: BasePart, key: string, facts: string): TrayOption => ({
    id: p.id,
    short: SHORT[p.id] ?? p.name,
    stats: base(p, key),
    description: p.description,
    facts,
  })
  return [
    {
      key: 'solar',
      title: 'Solar panels',
      color: CATEGORY_COLORS.solar,
      options: solarPanels.map((p) =>
        opt(p, `${p.powerGeneration} W`, `Makes ${p.powerGeneration} W in full sun. ${p.deployable ? 'Deployable: unfolds after launch.' : 'Fixed to the box: nothing to deploy.'}`)
      ),
    },
    {
      key: 'battery',
      title: 'Battery',
      color: CATEGORY_COLORS.battery,
      options: batteries.map((p) => {
        const minutes = eclipseW > 0 ? Math.round(((p.capacity * C.usableBatteryShare) / eclipseW) * 60) : null
        const eclipse = b.eclipseDurationMinutes > 0 ? ` This orbit's eclipse: ${Math.round(b.eclipseDurationMinutes)} min.` : ''
        const carry = minutes === null ? 'Carries the craft through shadow.' : `Carries everything for ${minutes} min in shadow.`
        return opt(p, `${p.capacity} Wh`, `${p.capacity} Wh. ${carry}${eclipse}`)
      }),
    },
    {
      key: 'computer',
      title: 'Flight computer',
      color: CATEGORY_COLORS.computer,
      options: computers.map((p) =>
        opt(p, `${p.storage} MB`, `${p.storage} MB storage · radiation resets x${p.resetFactor}${p.redundant ? ' · redundant' : ' · single string'}`)
      ),
    },
    {
      key: 'attitude',
      title: 'Attitude control',
      color: CATEGORY_COLORS.attitude,
      options: attitudeControls.map((p) =>
        opt(
          p,
          `${p.pointingAccuracy}°`,
          `Pointing ${p.pointingAccuracy}°${p.hasStarTracker ? ' · star tracker' : ' · sun sensors'}${
            p.precise ? ' · laser and dish work at full quality' : ' · laser at half quality, dish at a quarter of its gain'
          }`
        )
      ),
    },
    {
      key: 'propulsion',
      title: 'Propulsion',
      color: CATEGORY_COLORS.propulsion,
      options: propulsionSystems.map((p) =>
        opt(
          p,
          `${(p.mass + p.propellantMass).toFixed(1)} kg fuelled`,
          `${p.type} · Isp ${p.isp} s · ${p.propellantMass} kg propellant on ${p.mass} kg dry${
            p.type === 'electric' ? ` · needs ${p.minThrustPower}-${p.thrustPower} W while thrusting` : ''
          }`
        )
      ),
    },
  ]
}
