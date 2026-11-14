import { createDefaultDesign } from './budgets'
import type { Design } from './types'

/**
 * Reference designs from the Lunar Ice Mapper logic map, used by tests and
 * handy for trying the model. Each mirrors a real lunar CubeSat.
 */

/** Lunar Flashlight-like: chemical engine, halo loop, laser. Meets the brief. */
export const flashlightDesign: Design = {
  planning: { buildTurns: 0, testTurns: 2, reservePercent: 10 },
  instruments: ['inst-laser'],
  structure: 'bus-6u',
  solar: 'solar-1wing',
  battery: 'battery-large',
  radio: 'radio-sband',
  computer: 'computer-basic',
  attitude: 'attitude-precision',
  propulsion: 'prop-chemical',
  orbit: 'orbit-halo',
  ride: 'ride-lunar',
  transfer: 'transfer-low-energy',
  groundStation: 'ground-medium',
  contactHours: 1,
}

/** LunaH-Map-like: ion engine, elliptical orbit, neutron spectrometer. Meets the brief, on a thin budget. */
export const lunahMapDesign: Design = {
  ...flashlightDesign,
  // Thin budget: the reserve line is a hard limit, so this craft keeps only a 4% reserve
  planning: { ...flashlightDesign.planning, reservePercent: 4 },
  instruments: ['inst-neutron'],
  solar: 'solar-2wing',
  attitude: 'attitude-basic',
  propulsion: 'prop-ion-large',
  orbit: 'orbit-elliptical',
}

/** Lunar IceCube-like (the starting design): flies well, but the IR spectrometer cannot see into shadow. */
export const iceCubeDesign: Design = createDefaultDesign()
