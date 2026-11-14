import { z } from 'zod'

/**
 * Mission events from the logic map. Chances are game values; each event
 * says which real mission it comes from where there is one. The flight
 * simulation (src/sim/simulate.ts) applies the effects.
 */
export const EventTypeSchema = z.enum([
  'build-delay',
  'no-signal',
  'thruster',
  'radiation-reset',
  'station-outage',
  'long-eclipse',
  'instrument-degrades',
])
export type EventType = z.infer<typeof EventTypeSchema>

/** Event severity */
export const EventSeveritySchema = z.enum(['minor', 'major', 'critical'])
export type EventSeverity = z.infer<typeof EventSeveritySchema>

/** Mission phase when event can occur */
export const MissionPhaseSchema = z.enum(['build', 'launch', 'transfer', 'orbit'])
export type MissionPhase = z.infer<typeof MissionPhaseSchema>

/** Event definition */
export const EventSchema = z.object({
  id: EventTypeSchema,
  name: z.string(),
  description: z.string(),
  realWorldSource: z.string(),
  severity: EventSeveritySchema,
  phases: z.array(MissionPhaseSchema),
  baseOdds: z.number(), // per turn probability (0-1), before mitigations
  mitigations: z.array(z.object({
    condition: z.string(), // human-readable condition
    oddsMultiplier: z.number(),
  })),
  choices: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    reserveCost: z.number(), // $M from reserve, paid only if it works
    successChance: z.number(), // 0-1
    successOutcome: z.string(),
    failureOutcome: z.string(),
  })),
})
export type MissionEvent = z.infer<typeof EventSchema>

export const events: MissionEvent[] = [
  {
    id: 'build-delay',
    name: 'Build Delay',
    description: 'A part arrives late or fails inspection. The build slips by one month.',
    realWorldSource: 'CubeSat 101: most CubeSat schedules slip.',
    severity: 'minor',
    phases: ['build'],
    baseOdds: 0.08, // times build effort / 35
    mitigations: [{ condition: 'Simpler spacecraft (less build effort)', oddsMultiplier: 1 }],
    choices: [
      {
        id: 'wait',
        name: 'Accept the delay',
        description: 'Ready one month later. If that misses the ride, wait for the next one and keep paying the team.',
        reserveCost: 0,
        successChance: 1,
        successOutcome: 'The schedule slips by a month.',
        failureOutcome: '',
      },
      {
        id: 'cut-test',
        name: 'Cut a test month',
        description: 'Stay on schedule by testing less. Failure odds in flight go up; the test money comes back.',
        reserveCost: 0,
        successChance: 1,
        successOutcome: 'Back on schedule, with less testing behind you.',
        failureOutcome: '',
      },
    ],
  },
  {
    id: 'no-signal',
    name: 'No Signal After Deployment',
    description: 'The ride has let go of the CubeSat, but the ground hears nothing.',
    realWorldSource: 'Lunar IceCube was never heard from properly after deployment from Artemis I.',
    severity: 'critical',
    phases: ['launch'],
    baseOdds: 0.08,
    mitigations: [
      { condition: 'Testing (2 test months = x1.0, 0 = x2.0)', oddsMultiplier: 1 },
      { condition: 'Radiation-hard computer', oddsMultiplier: 0.3 },
    ],
    choices: [
      {
        id: 'recover',
        name: 'Book emergency tracking',
        description: 'The big dishes search for the craft: 60% chance to find it.',
        reserveCost: 0.5,
        successChance: 0.6,
        successOutcome: 'Signal found. The mission goes on.',
        failureOutcome: 'No signal. The mission is lost.',
      },
      {
        id: 'give-up',
        name: 'Give up the search',
        description: 'Save the reserve. The mission is lost.',
        reserveCost: 0,
        successChance: 0,
        successOutcome: '',
        failureOutcome: 'The mission is lost.',
      },
    ],
  },
  {
    id: 'thruster',
    name: 'Thruster Underperforms',
    description: 'The engine delivers far less thrust than it did on the ground.',
    realWorldSource: "Lunar Flashlight's thrusters underperformed and it never reached its orbit.",
    severity: 'critical',
    phases: ['transfer'],
    baseOdds: 0.03,
    mitigations: [{ condition: 'Testing (2 test months = x1.0, 0 = x2.0)', oddsMultiplier: 1 }],
    choices: [
      {
        id: 'fix',
        name: 'Work on a fix',
        description: '50% chance; if it works it costs 1 M from the reserve and one extra month.',
        reserveCost: 1.0,
        successChance: 0.5,
        successOutcome: 'Thrust restored, one month late.',
        failureOutcome: 'The fix did not work.',
      },
      {
        id: 'accept',
        name: 'Fly on as it is',
        description: 'A chemical engine loses half its delta-v; an ion engine needs twice as long for the rest of the transfer.',
        reserveCost: 0,
        successChance: 0,
        successOutcome: '',
        failureOutcome: 'Flying on with a weak engine.',
      },
    ],
  },
  {
    id: 'radiation-reset',
    name: 'Radiation Reset',
    description: 'A particle hit resets the computer. The craft sits in safe mode this month.',
    realWorldSource: 'A common problem for CubeSats without radiation-hard electronics.',
    severity: 'minor',
    phases: ['orbit'],
    baseOdds: 0.06,
    mitigations: [{ condition: 'Radiation-hard computer', oddsMultiplier: 0.3 }],
    choices: [],
  },
  {
    id: 'station-outage',
    name: 'Ground Station Outage',
    description: 'The ground station is down for part of the month. Half the contact time is lost.',
    realWorldSource: 'Ground stations are shared and break down.',
    severity: 'minor',
    phases: ['orbit'],
    baseOdds: 0.06, // the station's own outage chance
    mitigations: [{ condition: 'DSN (2%) instead of your own dish (10%)', oddsMultiplier: 1 }],
    choices: [],
  },
  {
    id: 'long-eclipse',
    name: 'Long Eclipse',
    description: "The Moon passes through Earth's shadow for hours. Only a big enough battery keeps the craft working.",
    realWorldSource: 'LRO has to prepare for lunar eclipses every year.',
    severity: 'major',
    phases: ['orbit'],
    baseOdds: 0.05,
    mitigations: [{ condition: 'Battery that carries the bus for 3 hours', oddsMultiplier: 0 }],
    choices: [],
  },
  {
    id: 'instrument-degrades',
    name: 'Instrument Degrades',
    description: 'An instrument loses sensitivity. Every later month returns 20% less science.',
    realWorldSource: 'Detectors age in the radiation of deep space.',
    severity: 'major',
    phases: ['orbit'],
    baseOdds: 0.03,
    mitigations: [{ condition: 'Testing (2 test months = x1.0, 0 = x2.0)', oddsMultiplier: 1 }],
    choices: [],
  },
]

export function getEventById(id: EventType): MissionEvent | undefined {
  return events.find((e) => e.id === id)
}
