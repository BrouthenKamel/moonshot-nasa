import {
  getPartById,
  type AttitudePart,
  type InstrumentPart,
  type PropulsionPart,
  type RadioPart,
} from '../data/parts'
import { getOrbitById } from '../data/orbits'
import type { Budgets, Design, DesignStep } from '../sim/types'

export type SynergyTone = 'synergy' | 'warning' | 'conflict'

export interface SynergyBadge {
  id: string
  tone: SynergyTone
  title: string
  detail: string
  /** Steps where this coupling is directly actionable or informative */
  steps: DesignStep[]
}

/**
 * Surfaces real cross-subsystem couplings from the physics core as concise
 * Synergy / Warning / Conflict callouts across the building screens.
 */
export function computeSynergies(design: Design, budgets: Budgets): SynergyBadge[] {
  const badges: SynergyBadge[] = []

  const instruments = design.instruments
    .map((id) => getPartById(id))
    .filter((p): p is InstrumentPart => p !== undefined && p.category === 'instrument')
  const attitude = getPartById(design.attitude) as AttitudePart | undefined
  const radio = getPartById(design.radio) as RadioPart | undefined
  const propulsion = getPartById(design.propulsion) as PropulsionPart | undefined
  const orbit = getOrbitById(design.orbit)

  const iceInstruments = instruments.filter((i) => i.seesShadow)

  // 1. Shadow Vision Check
  if (iceInstruments.length === 0) {
    badges.push({
      id: 'shadow-blind',
      tone: 'conflict',
      title: 'Blind in Crater Shadows',
      detail: 'No aboard instrument can map permanently shadowed craters (0% ice). Add Laser or Neutron.',
      steps: ['instruments', 'orbit', 'go-nogo'],
    })
  }

  // 2. Orbit Altitude vs. Instrument Ceiling
  if (orbit && iceInstruments.length > 0) {
    const blocked = iceInstruments.filter(
      (inst) => inst.maxAltitudeKm !== null && orbit.altitude > inst.maxAltitudeKm
    )
    if (blocked.length > 0) {
      const limits = blocked.map((i) => `${i.name.split(' ')[0]} ≤ ${i.maxAltitudeKm} km`).join(', ')
      badges.push({
        id: 'altitude-mismatch',
        tone: 'conflict',
        title: `Orbit Too High (${orbit.altitude} km)`,
        detail: `${limits} — above its ceiling it maps 0% ice.`,
        steps: ['instruments', 'orbit', 'go-nogo'],
      })
    } else {
      badges.push({
        id: 'altitude-match',
        tone: 'synergy',
        title: `Altitude Locked (${orbit.altitude} km)`,
        detail: `Passes within crater-mapping range of ${iceInstruments.map((i) => i.name.split(' ')[0]).join(' + ')}.`,
        steps: ['instruments', 'orbit'],
      })
    }
  }

  // 3. Precision Pointing Coupling (ADCS <-> Laser / X-Band Dish)
  const hasLaser = instruments.some((i) => i.id === 'inst-laser')
  const needsPointing = hasLaser || Boolean(radio?.needsPrecisePointing)
  if (needsPointing) {
    if (attitude?.precise) {
      const targets = [hasLaser ? '2× Laser quality' : null, radio?.needsPrecisePointing ? '4× Dish gain' : null]
        .filter(Boolean)
        .join(' & ')
      badges.push({
        id: 'pointing-synergy',
        tone: 'synergy',
        title: 'Star Tracker Synergy',
        detail: `Precision ADCS unlocks ${targets}.`,
        steps: ['instruments', 'spacecraft', 'comms'],
      })
    } else {
      const losses = [hasLaser ? '-50% Laser quality' : null, radio?.needsPrecisePointing ? '-75% Dish gain' : null]
        .filter(Boolean)
        .join(' & ')
      badges.push({
        id: 'pointing-loss',
        tone: 'warning',
        title: 'Coarse Pointing Penalty',
        detail: `Basic ADCS causes ${losses}. Upgrade to Precision ADCS in Factory.`,
        steps: ['instruments', 'spacecraft', 'comms'],
      })
    }
  }

  // 4. Solar vs. Ion Thrust Power
  if (propulsion && propulsion.type === 'electric') {
    if (budgets.thrustPower >= propulsion.minThrustPower) {
      badges.push({
        id: 'ion-power-ready',
        tone: 'synergy',
        title: `Ion Power Ready (${Math.round(budgets.thrustPower)} W)`,
        detail: `Exceeds the ${propulsion.minThrustPower} W minimum for BIT-3 electric thrust.`,
        steps: ['spacecraft', 'ride'],
      })
    } else {
      badges.push({
        id: 'ion-power-starved',
        tone: 'conflict',
        title: `Ion Starved (${Math.round(budgets.thrustPower)} / ${propulsion.minThrustPower} W)`,
        detail: 'Not enough solar margin to fire the ion thruster. Use the 120 W array.',
        steps: ['spacecraft', 'ride'],
      })
    }
  }

  // 5. Link Crowding (Camera vs. Ice Data)
  const hasCamera = instruments.some((i) => i.id === 'inst-camera')
  if (hasCamera && iceInstruments.length > 0 && (budgets.dataMarginPerTurn < 0 || budgets.projectedLost > 0)) {
    badges.push({
      id: 'link-crowding',
      tone: 'warning',
      title: 'Camera Crowding Downlink',
      detail: `Camera images overflow storage (${Math.round(budgets.projectedLost)} MB lost) and drop ice data.`,
      steps: ['instruments', 'comms'],
    })
  }

  return badges
}
