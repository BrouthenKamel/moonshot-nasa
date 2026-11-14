import { z } from 'zod'

/** Mission event types */
export const EventTypeSchema = z.enum([
  'thruster-clog',
  'comm-loss',
  'radiation-reset',
  'budget-cut',
  'solar-storm',
  'wheel-fault',
])
export type EventType = z.infer<typeof EventTypeSchema>

/** Event severity */
export const EventSeveritySchema = z.enum(['minor', 'major', 'critical'])
export type EventSeverity = z.infer<typeof EventSeveritySchema>

/** Mission phase when event can occur */
export const MissionPhaseSchema = z.enum(['transfer', 'capture', 'orbit'])
export type MissionPhase = z.infer<typeof MissionPhaseSchema>

/** Event definition */
export const EventSchema = z.object({
  id: EventTypeSchema,
  name: z.string(),
  description: z.string(),
  realWorldSource: z.string(),
  severity: EventSeveritySchema,
  phases: z.array(MissionPhaseSchema),
  baseOdds: z.number(), // per turn probability (0-1)
  mitigations: z.array(z.object({
    condition: z.string(), // human-readable condition
    oddsMultiplier: z.number(),
  })),
  choices: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    reserveCost: z.number(), // $M from reserve
    successChance: z.number(), // 0-1
    successOutcome: z.string(),
    failureOutcome: z.string(),
    impactOnMission: z.object({
      deltavLoss: z.number(), // m/s
      powerLoss: z.number(), // W
      dataLoss: z.number(), // GB
      turnLoss: z.number(), // turns
    }),
  })),
})
export type MissionEvent = z.infer<typeof EventSchema>

export const events: MissionEvent[] = [
  {
    id: 'thruster-clog',
    name: 'Thruster Blockage',
    description:
      'Propellant feed lines are partially blocked, reducing thrust capability.',
    realWorldSource: 'Lunar Flashlight experienced thruster clogging that prevented lunar orbit insertion.',
    severity: 'critical',
    phases: ['transfer', 'capture'],
    baseOdds: 0.08,
    mitigations: [
      { condition: 'Redundant propulsion system', oddsMultiplier: 0.3 },
      { condition: 'Extra testing phase', oddsMultiplier: 0.7 },
    ],
    choices: [
      {
        id: 'heat-lines',
        name: 'Heat propellant lines',
        description: 'Use heaters to try clearing the blockage. Costs reserve budget.',
        reserveCost: 0.3,
        successChance: 0.6,
        successOutcome: 'Lines cleared, full thrust restored.',
        failureOutcome: 'Heating ineffective, partial thrust only.',
        impactOnMission: { deltavLoss: 200, powerLoss: 0, dataLoss: 0, turnLoss: 0 },
      },
      {
        id: 'reduce-thrust',
        name: 'Operate at reduced thrust',
        description: 'Accept lower thrust and extend the transfer.',
        reserveCost: 0,
        successChance: 0.9,
        successOutcome: 'Mission continues with reduced capability.',
        failureOutcome: 'Insufficient thrust for capture.',
        impactOnMission: { deltavLoss: 300, powerLoss: 0, dataLoss: 0, turnLoss: 2 },
      },
    ],
  },
  {
    id: 'comm-loss',
    name: 'Communication Loss',
    description: 'Contact with spacecraft lost. May be temporary or permanent.',
    realWorldSource:
      'Lunar IceCube lost communication shortly after deployment from Artemis I.',
    severity: 'critical',
    phases: ['transfer', 'orbit'],
    baseOdds: 0.06,
    mitigations: [
      { condition: 'Redundant flight computer', oddsMultiplier: 0.4 },
      { condition: 'High-reliability radio', oddsMultiplier: 0.6 },
    ],
    choices: [
      {
        id: 'dsn-search',
        name: 'Request DSN search',
        description: 'Use Deep Space Network to search for the signal. Expensive.',
        reserveCost: 0.5,
        successChance: 0.7,
        successOutcome: 'Signal reacquired, mission continues.',
        failureOutcome: 'No signal found, mission lost.',
        impactOnMission: { deltavLoss: 0, powerLoss: 0, dataLoss: 0, turnLoss: 1 },
      },
      {
        id: 'wait-reboot',
        name: 'Wait for autonomous reboot',
        description: 'Hope the spacecraft reboots and re-establishes contact.',
        reserveCost: 0,
        successChance: 0.4,
        successOutcome: 'Spacecraft rebooted, contact restored.',
        failureOutcome: 'No response, mission lost.',
        impactOnMission: { deltavLoss: 0, powerLoss: 0, dataLoss: 1, turnLoss: 1 },
      },
    ],
  },
  {
    id: 'radiation-reset',
    name: 'Radiation-Induced Reset',
    description:
      'High-energy particle caused flight computer reset. Science data in buffer lost.',
    realWorldSource: 'Common issue for CubeSats without radiation hardening.',
    severity: 'minor',
    phases: ['orbit'],
    baseOdds: 0.12,
    mitigations: [
      { condition: 'Redundant flight computer', oddsMultiplier: 0.3 },
      { condition: 'Large onboard storage', oddsMultiplier: 0.7 },
    ],
    choices: [
      {
        id: 'resume',
        name: 'Resume operations',
        description: 'Accept data loss and continue mission.',
        reserveCost: 0,
        successChance: 1.0,
        successOutcome: 'Operations resumed, some data lost.',
        failureOutcome: '',
        impactOnMission: { deltavLoss: 0, powerLoss: 0, dataLoss: 0.5, turnLoss: 0 },
      },
    ],
  },
  {
    id: 'budget-cut',
    name: 'Budget Cut',
    description: 'Agency funding reduced. Must operate with less ground support.',
    realWorldSource: 'Budget fluctuations are common in space programs.',
    severity: 'major',
    phases: ['orbit'],
    baseOdds: 0.05,
    mitigations: [],
    choices: [
      {
        id: 'reduce-ops',
        name: 'Reduce operations tempo',
        description: 'Less frequent contact, lower data return.',
        reserveCost: 0,
        successChance: 1.0,
        successOutcome: 'Mission continues at reduced pace.',
        failureOutcome: '',
        impactOnMission: { deltavLoss: 0, powerLoss: 0, dataLoss: 0.3, turnLoss: 0 },
      },
      {
        id: 'use-reserve',
        name: 'Use reserve funding',
        description: 'Tap into reserve to maintain operations.',
        reserveCost: 0.4,
        successChance: 1.0,
        successOutcome: 'Operations maintained at full capacity.',
        failureOutcome: '',
        impactOnMission: { deltavLoss: 0, powerLoss: 0, dataLoss: 0, turnLoss: 0 },
      },
    ],
  },
  {
    id: 'solar-storm',
    name: 'Solar Storm',
    description:
      'Coronal mass ejection increases radiation. Safe mode required.',
    realWorldSource: 'Solar activity affects all spacecraft operations.',
    severity: 'major',
    phases: ['transfer', 'orbit'],
    baseOdds: 0.08,
    mitigations: [
      { condition: 'Redundant flight computer', oddsMultiplier: 0.5 },
    ],
    choices: [
      {
        id: 'safe-mode',
        name: 'Enter safe mode',
        description: 'Suspend science operations until storm passes.',
        reserveCost: 0,
        successChance: 0.95,
        successOutcome: 'Storm passed, operations resumed.',
        failureOutcome: 'Component damage during storm.',
        impactOnMission: { deltavLoss: 0, powerLoss: 2, dataLoss: 0, turnLoss: 0 },
      },
    ],
  },
  {
    id: 'wheel-fault',
    name: 'Reaction Wheel Fault',
    description: 'Reaction wheel showing increased friction. May fail completely.',
    realWorldSource: 'Kepler spacecraft lost reaction wheels affecting pointing.',
    severity: 'major',
    phases: ['orbit'],
    baseOdds: 0.07,
    mitigations: [
      { condition: 'Precision ADCS with redundancy', oddsMultiplier: 0.4 },
      { condition: 'Basic ADCS (magnetorquers)', oddsMultiplier: 0.6 },
    ],
    choices: [
      {
        id: 'reduce-slew',
        name: 'Reduce slew rate',
        description: 'Slower pointing maneuvers to extend wheel life.',
        reserveCost: 0,
        successChance: 0.85,
        successOutcome: 'Wheel stabilized, operations continue.',
        failureOutcome: 'Wheel failed, reduced pointing capability.',
        impactOnMission: { deltavLoss: 0, powerLoss: 0, dataLoss: 0.2, turnLoss: 0 },
      },
      {
        id: 'use-thrusters',
        name: 'Use thrusters for attitude',
        description: 'Supplement wheel with thruster attitude control.',
        reserveCost: 0.2,
        successChance: 0.95,
        successOutcome: 'Hybrid control working well.',
        failureOutcome: 'Fuel consumption higher than expected.',
        impactOnMission: { deltavLoss: 50, powerLoss: 0, dataLoss: 0, turnLoss: 0 },
      },
    ],
  },
]

export function getEventById(id: EventType): MissionEvent | undefined {
  return events.find((e) => e.id === id)
}

export function getEventsForPhase(phase: MissionPhase): MissionEvent[] {
  return events.filter((e) => e.phases.includes(phase))
}
