/**
 * The narrator's beats: which line Commander Rosa Vega says at each moment of the game.
 * Pure: the game state in, one beat (a stable id and its text) out. Every number in a line
 * is read from the budgets, the Go / No-Go result, the flight state or the report.
 * The ids are stable so recorded audio could map to them later.
 * Design: docs/superpowers/specs/2026-11-14-narrator-design.md
 */
import type { Budgets, DesignStep, GoNoGoResult, Report, SimState } from '../../sim/types'
import type { Screen } from '../../state/gameStore'
import { craftWasLost } from '../../sim/evaluate'
import { STEP_NAMES } from '../kit/stepNumbers'

export const NARRATOR_NAME = 'Commander Rosa Vega'
export const NARRATOR_ROLE = 'Retired astronaut, now the agency’s mission mentor'

export const BEAT_IDS = [
  'start',
  'step-brief',
  'step-planning',
  'step-instruments',
  'step-rocket',
  'step-spacecraft',
  'step-orbit',
  'step-ride',
  'step-comms',
  'go-nogo',
  'flight-build',
  'launch',
  'capture',
  'orbit',
  'event',
  'end-success',
  'end-partial',
  'end-failed',
  'end-lost',
  'end-stopped',
] as const

export type BeatId = (typeof BEAT_IDS)[number]

export interface Beat {
  id: BeatId
  text: string
  /** 'run': shown once per flight (flight and ending beats); 'game': shown once */
  scope: 'game' | 'run'
}

/** Catalogue facts about the instruments on board (from src/data/parts.ts) */
export interface InstrumentFacts {
  name: string
  seesShadow: boolean
  maxAltitudeKm: number | null
  flownOn: string
}

export interface NarratorInput {
  screen: Screen
  designStep: DesignStep
  visitedSteps: DesignStep[]
  sim: SimState | null
  report: Report | null
  budgets: Budgets
  goNoGo: GoNoGoResult
  instruments: InstrumentFacts[]
}

const n0 = (x: number) => Math.round(x).toString()
const n1 = (x: number) => x.toFixed(1)

function stepBeat(step: DesignStep, i: NarratorInput): Beat {
  const b = i.budgets
  const shadow = i.instruments.find((x) => x.seesShadow)
  const game = (id: BeatId, text: string): Beat => ({ id, text, scope: 'game' })
  switch (step) {
    case 'brief':
      return game(
        'step-brief',
        shadow
          ? 'The brief is short: map the ice, get the data home, stay in budget. You already carry an instrument that can see into the dark.'
          : `Our starting design carries an IR spectrometer, like Lunar IceCube. Before you launch, stop at ${STEP_NAMES.instruments} in the Research Lab and check whether it can see into the dark craters.`
      )
    case 'planning':
      return game(
        'step-planning',
        `You have ${b.budgetCap} M. The money you hold back as a reserve, now ${n1(b.reserveAmount)} M, is what pays for repairs in flight. With nothing held back, the first surprise can sink us.`
      )
    case 'instruments':
      return game(
        'step-instruments',
        shadow
          ? `The ${shadow.name} can see into the dark, like ${shadow.flownOn}.${shadow.maxAltitudeKm !== null ? ` It maps nothing above ${shadow.maxAltitudeKm} km, so the orbit must take it low.` : ''}`
          : 'The IR spectrometer needs sunlight, and the ice hides where the Sun never shines. Lunar Flashlight brought its own lasers; LunaH-Map counted neutrons.'
      )
    case 'rocket':
      return game(
        'step-rocket',
        'Every satellite starts on a rocket. Build one: an upper stage is what sends a craft on toward the Moon, and the fairing keeps it safe on the way up.'
      )
    case 'spacecraft':
      return game(
        'step-spacecraft',
        `Everything must fit in ${b.volumeLimit}U and ${n0(b.massLimit)} kg. You’re at ${n1(b.totalMass)} kg, and the propellant counts too.`
      )
    case 'orbit':
      return game(
        'step-orbit',
        `Low passes see the ice best, but holding this orbit burns ${n0(b.deltaVStationKeeping)} m/s of fuel a month. LRO has mapped the Moon from low polar orbits for years.`
      )
    case 'ride':
      return game(
        'step-ride',
        b.timeMarginTurns >= 0
          ? `Your ride leaves in month ${b.rideTurn}; the craft is ready in month ${b.readyTurn}. Rides don’t wait for anyone.`
          : `Your ride leaves in month ${b.rideTurn}, but the craft is only ready in month ${b.readyTurn}. We’d miss it.`
      )
    case 'comms':
      return game(
        'step-comms',
        `Ice only counts on the map once its data is home. You can send ${n0(b.downlinkPerTurn)} MB a month; the instruments make ${n0(b.dataPerTurn)} MB.`
      )
    case 'go-nogo': {
      const red = i.goNoGo.blockers.length
      return game(
        'go-nogo',
        i.goNoGo.canGo
          ? `Every bar is clear of red. Projected ice coverage: ${n0(b.projectedCoverage)}%. It’s your call now.`
          : `${red} red bar${red === 1 ? '' : 's'}. We don’t fly with red. Each one says what to fix.`
      )
    }
  }
}

/** The ending line for a mission stopped with a working craft (out of money, or out of time) */
function stoppedLine(end: string): string {
  if (end === 'budget ran out before launch')
    return 'The money ran out before launch: she never left the ground. A failed mission spends its whole budget. Read the report, then let’s plan again.'
  if (end.startsWith('budget ran out'))
    return 'The money ran out. She still works out there, but nobody can pay to fly her, and a failed mission spends its whole budget. Read the report, then let’s fly again.'
  return `The mission had to stop: ${end || 'it was called off'}. She still works, but it counts as a failure. Read the report, then let’s fly again.`
}

function endBeat(sim: SimState, report: Report): Beat {
  const cov = n0(report.coverageAchieved)
  const data = n0(report.dataReturned)
  const run = (id: BeatId, text: string): Beat => ({ id, text, scope: 'run' })
  // Only a craft that is really gone is "lost"; one stopped for lack of money still works (QC, 15 Nov)
  if (!sim.flight.alive && craftWasLost(sim.flight.end))
    return run(
      'end-lost',
      'We’ve lost her. It happened to real CubeSats too: Lunar Flashlight never reached its orbit. Read the report, then let’s fly again.'
    )
  if (!sim.flight.alive)
    return run('end-stopped', stoppedLine(sim.flight.end))
  switch (report.outcome) {
    case 'success':
      return run('end-success', `We did it. ${cov}% of the ice mapped and ${data} MB home. Future crews will land by your map.`)
    case 'partial':
      return run('end-partial', `We mapped ${cov}% of the ice. Not the whole job, but real science. The report shows what held us back.`)
    default:
      return run(
        'end-failed',
        `She reached space, but the map came up short: ${cov}% of the ice. Every real team has had a day like this. The report shows why.`
      )
  }
}

function flightBeat(sim: SimState, report: Report | null): Beat | null {
  const run = (id: BeatId, text: string): Beat => ({ id, text, scope: 'run' })
  if (sim.phase === 'complete' || sim.phase === 'failed') return report ? endBeat(sim, report) : null
  if (sim.pendingDecision) {
    const real = sim.pendingDecision.realMission
    return run('event', `Something has come up. Real missions faced this too${real ? `, like ${real}` : ''}. Read the card and choose.`)
  }
  switch (sim.phase) {
    case 'build':
    case 'test':
    case 'wait':
      return run('flight-build', `The Factory is building her now. Our ride leaves in month ${sim.flight.launchTurn}.`)
    case 'transfer':
      return run('launch', 'Liftoff! She’s on her way to the Moon. Now we wait, and we watch.')
    case 'capture':
      return run('capture', 'Capture burn. If she slows down enough, the Moon catches her.')
    case 'orbit':
      return run('orbit', 'We’re in orbit! The instruments are on, and the ice map starts now.')
  }
}

/** The key a beat is remembered under: flight and ending beats once per flight, the rest once */
export function beatKey(beat: Beat, seed: number | undefined): string {
  return beat.scope === 'run' && seed !== undefined ? `${beat.id}@${seed}` : beat.id
}

/** The beat for the current moment, or null when the narrator has nothing to say */
export function pickBeat(i: NarratorInput): Beat | null {
  switch (i.screen) {
    case 'base':
    case 'title':
    case 'simulation':
      if (i.sim) return flightBeat(i.sim, i.report)
      if (i.visitedSteps.length === 0)
        return {
          id: 'start',
          scope: 'game',
          text: 'Welcome to the team. I’m Rosa Vega. In the dark craters at the Moon’s south pole there may be ice: water for the first crews who live there. Let’s go and map it. Start at the Comms Center.',
        }
      return null
    case 'setup':
    case 'design':
      return stepBeat(i.designStep, i)
    case 'report':
      return i.sim && i.report ? endBeat(i.sim, i.report) : null
    default:
      return null
  }
}
