import { getPartById, type BatteryPart, type ComputerPart, type PropulsionPart, type RadioPart, type SolarPart } from '../../data/parts'
import type { Budgets } from '../../sim/types'
import type { Load } from './logic'
import { deltaVGauge } from './logic'

/** What the look-inside shot says about a part: one plain-English line and one number (read from the data and the budgets) */
export interface Fact {
  title: string
  line: string
  value: string
}

const n = (v: number, d = 0) => v.toFixed(d)

export function partFact(id: string, b: Budgets): Fact | null {
  const p = getPartById(id)
  if (!p) return null
  switch (p.category) {
    case 'solar': {
      const w = (p as SolarPart).powerGeneration
      return { title: 'Solar array', line: 'Turns sunlight into the power for everything else.', value: `${n(w)} W in full Sun` }
    }
    case 'battery':
      return { title: 'Battery', line: `Carries the craft through the eclipse. It needs ${n(b.batteryNeedWh)} Wh per dark pass.`, value: `${n((p as BatteryPart).capacity)} Wh` }
    case 'radio': {
      const r = p as RadioPart
      return { title: 'Radio', line: r.reachesMoon ? 'Can talk across the gap to Earth.' : 'Too weak to reach Earth from the Moon.', value: `${n(r.transmitPower)} W when talking` }
    }
    case 'computer':
      return { title: 'Computer', line: (p as ComputerPart).redundant ? 'Two brains: a cosmic ray does not stop the mission.' : 'One brain: a cosmic ray can reset it.', value: `${n((p as ComputerPart).storage)} MB of storage` }
    case 'attitude':
      return { title: 'Pointing', line: p.id === 'attitude-precision' ? 'A star tracker lets the laser and a dish aim exactly.' : 'Sun sensors only: coarse aim.', value: `${n(p.mass, 1)} kg` }
    case 'propulsion': {
      const t = p as PropulsionPart
      const g = deltaVGauge(b)
      return {
        title: t.type === 'electric' ? 'Ion engine' : 'Thrusters',
        line: t.type === 'electric' ? 'Tiny push for months, very little fuel.' : 'A hard push, but fuel is heavy.',
        value: `${n(g.have)} m/s of Δv`,
      }
    }
    case 'instrument':
      return { title: 'Instrument', line: 'Your science, picked in the lab. It stays in the frame.', value: `${n(p.volume, 1)} U` }
    default:
      return null
  }
}

export function loadFact(load: Load): Fact {
  return { title: load.label, line: load.note, value: `${n(load.draw, 1)} W` }
}

export function nodeFact(id: 'solar' | 'battery', b: Budgets, shortfall: number): Fact {
  if (id === 'solar') return { title: 'Solar array', line: 'Everything you plug in lives on what this makes.', value: `${n(b.powerGenerated)} W` }
  return {
    title: 'Battery',
    line: shortfall > 0 ? `The bus is ${n(shortfall)} W short: the lights flicker.` : 'Feeds every load and rides out the eclipse.',
    value: shortfall > 0 ? `-${n(shortfall)} W` : `${n(b.batteryCapacity)} Wh`,
  }
}
