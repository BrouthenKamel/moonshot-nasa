import { z } from 'zod'

/** Glossary entry for tooltips and explanations */
export const GlossaryEntrySchema = z.object({
  term: z.string(),
  definition: z.string(),
  example: z.string().optional(),
  relatedTerms: z.array(z.string()).optional(),
})
export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>

export const glossary: Record<string, GlossaryEntry> = {
  'delta-v': {
    term: 'Delta-v (delta-v)',
    definition:
      'The change in velocity a spacecraft can achieve. Measured in meters per second (m/s). Higher delta-v means more capability to change orbits or trajectories.',
    example:
      'Getting from trans-lunar trajectory to lunar orbit requires about 900 m/s of delta-v.',
    relatedTerms: ['isp', 'propulsion'],
  },
  isp: {
    term: 'Specific Impulse (Isp)',
    definition:
      'A measure of propulsion efficiency, in seconds. Higher Isp means more delta-v from the same amount of fuel. Electric propulsion has high Isp but low thrust.',
    example: 'Ion thrusters have Isp around 2000-3000s, while chemical thrusters are around 200-450s.',
    relatedTerms: ['delta-v', 'propulsion'],
  },
  '6u': {
    term: '6U CubeSat',
    definition:
      'A standardized small satellite format. One "U" is a 10x10x10 cm cube; 6U is typically 10x20x30 cm. Limits mass to about 14 kg.',
    example: 'Lunar IceCube and Lunar Flashlight were both 6U CubeSats.',
    relatedTerms: ['cubesat', 'mass'],
  },
  cubesat: {
    term: 'CubeSat',
    definition:
      'A type of miniaturized satellite built to standard dimensions (Units or "U"). Lower cost than traditional satellites but with limitations in power, data, and capability.',
    relatedTerms: ['6u'],
  },
  eclipse: {
    term: 'Eclipse',
    definition:
      'When the Moon blocks sunlight from reaching the spacecraft. Solar panels stop generating power and batteries must sustain the spacecraft.',
    example: 'In lunar polar orbit, eclipse fraction is typically 25-35% of each orbit.',
    relatedTerms: ['battery', 'power'],
  },
  'link-rate': {
    term: 'Link Rate (Data Rate)',
    definition:
      'How fast data can be transmitted from the spacecraft to Earth, measured in kilobits per second (kbps). Limited by radio power, antenna size, and distance.',
    example: 'X-band with a high-gain antenna can achieve 2000 kbps from the Moon.',
    relatedTerms: ['downlink', 'antenna'],
  },
  margin: {
    term: 'Margin',
    definition:
      'Extra capacity built into a system for safety. Mass margin means not using all available mass; power margin means generating more power than needed.',
    example: 'NASA typically requires 10-25% margin on critical systems.',
    relatedTerms: ['reserve', 'budget'],
  },
  reserve: {
    term: 'Reserve',
    definition:
      'Budget or resources held back for unexpected problems. Without reserve, any issue during the mission cannot be addressed.',
    example: 'CubeSat 101 recommends at least 10% budget reserve.',
    relatedTerms: ['margin', 'contingency'],
  },
  'polar-orbit': {
    term: 'Polar Orbit',
    definition:
      'An orbit that passes over the poles of a body. Required to observe the lunar south pole where water ice is expected.',
    example: 'LRO is in a 50 km polar orbit around the Moon.',
    relatedTerms: ['orbit', 'coverage'],
  },
  coverage: {
    term: 'Coverage',
    definition:
      'The percentage of a target area that has been observed by the spacecraft instruments. Depends on orbit altitude and mission duration.',
    relatedTerms: ['polar-orbit', 'resolution'],
  },
  'station-keeping': {
    term: 'Station Keeping',
    definition:
      'Using propulsion to maintain a desired orbit. Lunar orbits are unstable due to mascons (mass concentrations) and require regular corrections.',
    example: 'A 50 km lunar orbit needs about 25 m/s per month of station keeping.',
    relatedTerms: ['delta-v', 'orbit'],
  },
  downlink: {
    term: 'Downlink',
    definition:
      'Transmitting data from the spacecraft to Earth. Limited by contact time with ground stations and the spacecraft\'s radio capability.',
    relatedTerms: ['link-rate', 'ground-station'],
  },
  'ground-station': {
    term: 'Ground Station',
    definition:
      'Earth-based antenna for communicating with spacecraft. Larger dishes can receive weaker signals from deep space.',
    example: 'NASA\'s Deep Space Network has 70-meter dishes for communicating with distant spacecraft.',
    relatedTerms: ['downlink', 'dsn'],
  },
  dsn: {
    term: 'Deep Space Network (DSN)',
    definition:
      'NASA\'s network of large radio antennas supporting interplanetary spacecraft. High capability but limited availability and expensive to use.',
    relatedTerms: ['ground-station', 'downlink'],
  },
  'trans-lunar': {
    term: 'Trans-Lunar Injection (TLI)',
    definition:
      'The trajectory from Earth toward the Moon. Spacecraft are placed on this path by their launch vehicle or an upper stage.',
    example: 'Apollo missions used TLI to begin their journey to the Moon.',
    relatedTerms: ['transfer', 'delta-v'],
  },
  capture: {
    term: 'Orbital Capture',
    definition:
      'Using propulsion to slow down and enter orbit around a body. The capture burn is a critical moment - if it fails, the spacecraft flies past.',
    example: 'Lunar Flashlight failed to capture into lunar orbit due to thruster problems.',
    relatedTerms: ['delta-v', 'orbit'],
  },
  rideshare: {
    term: 'Rideshare',
    definition:
      'Launching as a secondary payload on a rocket with another primary mission. Much cheaper than a dedicated launch but with constraints on mass, schedule, and deployment orbit.',
    example: 'Lunar IceCube launched as a rideshare on Artemis I.',
    relatedTerms: ['launch'],
  },
  propulsion: {
    term: 'Propulsion System',
    definition:
      'The system that provides thrust to change the spacecraft\'s velocity. Options include chemical (fast, moderate efficiency), electric (slow, high efficiency), and cold gas (simple, low capability).',
    relatedTerms: ['delta-v', 'isp'],
  },
  'electric-propulsion': {
    term: 'Electric Propulsion',
    definition:
      'Propulsion using electrically accelerated ions or plasma. Very high efficiency (Isp) but very low thrust, requiring long burn times and significant power.',
    example: 'Lunar IceCube used a BIT-3 iodine ion thruster.',
    relatedTerms: ['isp', 'propulsion'],
  },
  'chemical-propulsion': {
    term: 'Chemical Propulsion',
    definition:
      'Propulsion using chemical reactions to produce thrust. Higher thrust than electric but lower efficiency, meaning more fuel needed for the same delta-v.',
    example: 'Lunar Flashlight used green (AF-M315E) monopropellant.',
    relatedTerms: ['isp', 'propulsion'],
  },
  // Plain words a 15-year-old can follow (QC #54, Jakob: wire the tooltips)
  adcs: {
    term: 'ADCS (attitude control)',
    definition:
      'The parts that point the spacecraft the right way: sensors that tell which way it faces, and small wheels that turn it. Instruments, panels and the antenna all need to point somewhere.',
    relatedTerms: ['star-tracker'],
  },
  'star-tracker': {
    term: 'Star tracker',
    definition:
      'A small camera that photographs the stars and works out from them exactly which way the spacecraft points. Much more precise than sun sensors.',
    relatedTerms: ['adcs'],
  },
  uhf: {
    term: 'UHF radio',
    definition:
      'A simple, cheap radio like the ones many CubeSats use near Earth. Its signal is too weak to be heard from the Moon.',
    relatedTerms: ['s-band', 'x-band'],
  },
  's-band': {
    term: 'S-band',
    definition:
      'A radio band used to talk to spacecraft far away. It reaches Earth from the Moon, at a moderate data rate.',
    relatedTerms: ['x-band', 'link-rate'],
  },
  'x-band': {
    term: 'X-band',
    definition:
      'A higher radio band for deep space. With a dish antenna it sends much more data per second than S-band.',
    relatedTerms: ['s-band', 'link-rate'],
  },
  'rad-hard': {
    term: 'Rad-hard (radiation-hardened)',
    definition:
      'Built to survive the radiation in space. Ordinary chips can glitch and restart when hit by a fast particle; rad-hard ones do so far less often, but cost more.',
  },
  wh: {
    term: 'W and Wh',
    definition:
      'Watts (W) say how fast power flows right now, like litres per second from a tap. Watt-hours (Wh) say how much energy a battery holds, like litres in a bucket: a 40 Wh battery can give 10 W for 4 hours.',
    relatedTerms: ['eclipse'],
  },
  'eclipse-margin': {
    term: 'Eclipse margin',
    definition:
      'How many minutes longer the battery could keep the spacecraft running than the longest shadow on this orbit lasts. Below zero, the craft runs out of power in the dark.',
    relatedTerms: ['eclipse', 'wh'],
  },
  'data-margin': {
    term: 'Data margin',
    definition:
      'How many more megabytes a month the radio could send home than the instruments make. Below zero, data piles up in storage and some is lost.',
    relatedTerms: ['downlink'],
  },
}

/** The glossary entry a game label stands for (labels on rows and bars, by their words) */
const LABEL_TERMS: [RegExp, string][] = [
  [/eclipse margin/i, 'eclipse-margin'],
  [/data margin|data link/i, 'data-margin'],
  [/delta-v/i, 'delta-v'],
  [/\bW\b|Wh\b|power/i, 'wh'],
  [/budget|reserve|mission cost/i, 'reserve'],
  [/comms/i, 'link-rate'],
  [/volume/i, '6u'],
  [/science|coverage/i, 'coverage'],
  [/mass/i, 'margin'],
]

/** Jargon in a part's name or description, in the order it should be explained */
const PART_TERMS: [RegExp, string][] = [
  [/ADCS|attitude/i, 'adcs'],
  [/star tracker/i, 'star-tracker'],
  [/UHF/, 'uhf'],
  [/S-band/i, 's-band'],
  [/X-band|deployable dish/i, 'x-band'],
  [/rad-hard|radiation-hard/i, 'rad-hard'],
  [/\bWh\b/, 'wh'],
  [/\bion\b|iodine/i, 'electric-propulsion'],
  [/green mono|monopropellant/i, 'chemical-propulsion'],
]

/** The glossary key for a row or bar label, if it has one */
export function glossaryKeyForLabel(label: string): string | undefined {
  return LABEL_TERMS.find(([re]) => re.test(label))?.[1]
}

/** Glossary entries for the jargon in a part's text, without repeats */
export function glossaryForPart(text: string): GlossaryEntry[] {
  const keys = PART_TERMS.filter(([re]) => re.test(text)).map(([, k]) => k)
  return [...new Set(keys)].map((k) => glossary[k])
}

export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return glossary[term.toLowerCase()]
}
