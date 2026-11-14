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

/**
 * One winning design per architecture the balance aims for
 * (docs/superpowers/specs/2026-11-14-balance-redesign.md). The balance test keeps each one winning.
 */
export const archetypes: Record<string, Design> = {
  flashlight: flashlightDesign,
  lunahMap: lunahMapDesign,
  /** Commercial express, straight in: the big chemical tank brakes into the elliptical orbit within days */
  express: {
    ...flashlightDesign,
    instruments: ['inst-neutron'],
    battery: 'battery-small',
    attitude: 'attitude-basic',
    propulsion: 'prop-chemical-large',
    orbit: 'orbit-elliptical',
    ride: 'ride-commercial',
    transfer: 'transfer-direct',
  },
  /** The cheapest craft: cold gas is just enough when the commercial lander drops it at the Moon */
  shoestring: {
    ...flashlightDesign,
    // The lander leaves on turn 10: time for a third test turn
    planning: { ...flashlightDesign.planning, testTurns: 3 },
    propulsion: 'prop-coldgas',
    ride: 'ride-commercial',
  },
  /** Cold gas leaves room for a second ice instrument: more coverage from the few halo passes */
  twoInstruments: {
    ...flashlightDesign,
    planning: { ...flashlightDesign.planning, reservePercent: 5 },
    battery: 'battery-small', // the halo loop has no eclipse
    instruments: ['inst-laser', 'inst-neutron'],
    propulsion: 'prop-coldgas',
    ride: 'ride-commercial',
  },
  /** The laser and the IR spectrometer on a cold-gas craft: the sunlit-ground map too, for more points */
  iceAndContext: {
    ...flashlightDesign,
    planning: { ...flashlightDesign.planning, reservePercent: 5 },
    instruments: ['inst-laser', 'inst-ir-spec'],
    propulsion: 'prop-coldgas',
    ride: 'ride-commercial',
  },
  /**
   * The top score and the biggest risk: neutron and IR spectrometers on an ion craft. Mass, volume
   * and money are all at the limit, and the long cruise leaves room for a weak thruster.
   */
  ambitious: {
    ...lunahMapDesign,
    planning: { ...lunahMapDesign.planning, testTurns: 1, reservePercent: 5 },
    instruments: ['inst-neutron', 'inst-ir-spec'],
    battery: 'battery-medium',
    propulsion: 'prop-ion',
  },
  /** Body-mounted panels on a low-power neutron craft */
  bodyPanels: {
    ...lunahMapDesign,
    solar: 'solar-body',
    groundStation: 'ground-small',
    contactHours: 6,
    propulsion: 'prop-chemical',
    ride: 'ride-commercial',
  },
  /** Laser and camera with a dish antenna for the pictures */
  pictures: {
    ...flashlightDesign,
    instruments: ['inst-laser', 'inst-camera'],
    radio: 'radio-xband',
    propulsion: 'prop-coldgas',
    ride: 'ride-commercial',
  },
  /** SMART-1 style: the cheapest, earliest ride, then a long electric climb out of GTO */
  gto: {
    ...lunahMapDesign,
    planning: { ...lunahMapDesign.planning, testTurns: 1, reservePercent: 10 },
    instruments: ['inst-laser'],
    battery: 'battery-large',
    attitude: 'attitude-precision',
    orbit: 'orbit-halo',
    ride: 'ride-gto',
  },
  /** Lean and cheap: body panels and the big chemical tank reach the elliptical orbit from the lunar ride, with a 20% reserve */
  lean: {
    ...lunahMapDesign,
    planning: { ...lunahMapDesign.planning, testTurns: 2, reservePercent: 20 },
    solar: 'solar-body',
    propulsion: 'prop-chemical-large',
    groundStation: 'ground-dsn', // the most reliable link: money the lean craft can afford
  },
  /** Rushed: no testing and no reserve, made up for with a radiation-hard computer and a direct transfer (no cruise to go wrong in) */
  rushed: {
    ...flashlightDesign,
    planning: { ...flashlightDesign.planning, testTurns: 0, reservePercent: 0 },
    battery: 'battery-medium',
    computer: 'computer-redundant',
    attitude: 'attitude-basic',
    orbit: 'orbit-elliptical',
    ride: 'ride-commercial',
    transfer: 'transfer-direct',
  },
  /** Pictures for the public beside the neutron map: the camera's data needs the 2-hour booking */
  outreach: {
    ...lunahMapDesign,
    planning: { ...lunahMapDesign.planning, testTurns: 1, reservePercent: 5 },
    instruments: ['inst-neutron', 'inst-camera'],
    contactHours: 2,
  },
  /** The laser on the halo loop, reached with a small ion engine: a short spiral, and money left for a 15% reserve */
  ionHalo: {
    ...lunahMapDesign,
    planning: { ...lunahMapDesign.planning, testTurns: 2, reservePercent: 15 },
    instruments: ['inst-laser'],
    battery: 'battery-small', // the halo loop has no eclipse
    attitude: 'attitude-precision',
    propulsion: 'prop-ion',
    orbit: 'orbit-halo',
  },
}
