import type { EventType } from '../../data/events'
import type { Design, TurnLog } from '../../sim/types'
import { replayPose } from '../replayPose'

/**
 * What the space view should show for one turn of a flight: where the craft is and what
 * happened that turn. Derived only from the core's turn logs (live flight and replay alike),
 * so the picture can never disagree with the numbers.
 */
export interface FlightShot {
  /** 'ground': not launched yet; 'transfer': between Earth and Moon; 'orbit': captured */
  stage: 'ground' | 'transfer' | 'orbit'
  /** 0..1 along the Earth-Moon path */
  transferT: number
  /** Ice mapped with its data home, 0..1 */
  coverage: number
  orbitId: string
  instruments: string[]
  /** This turn: the capture burn fired */
  burn: boolean
  /** This turn: science data reached the ground */
  downlink: boolean
  /** This turn: the instruments recorded data */
  science: boolean
  /** This turn's events, in order */
  cues: EventType[]
  /** Set on the last turn of a finished flight */
  ending: 'complete' | 'failed' | null
  turn: number
}

export interface ShotOptions {
  /** How the flight ended, if the logs are a finished flight */
  terminal?: 'complete' | 'failed'
  /** Live flight only: transfer turns still to fly (the core's `flight.transferLeft`) */
  transferLeft?: number | null
  /** Live flight only: how far into the next month the agency clock is, 0..1, so the craft moves day by day */
  monthFraction?: number
}

const launched = (l: TurnLog) => l.notes.some((n) => n.startsWith('Launched'))
const captured = (l: TurnLog) => l.notes.some((n) => n.startsWith('Capture burn successful'))

export function flightShot(design: Design, logs: TurnLog[], turnIndex: number, options: ShotOptions = {}): FlightShot {
  const pose = replayPose(design, logs, turnIndex, options.terminal)
  const last = logs.length - 1
  const idx = logs.length === 0 ? -1 : Math.min(last, Math.max(0, Math.trunc(Number.isFinite(turnIndex) ? turnIndex : 0)))
  const log = idx >= 0 ? logs[idx] : undefined
  const launchIdx = logs.findIndex(launched)
  const hasLaunched = launchIdx >= 0 && launchIdx <= idx

  // Progress along the path. A finished transfer knows its length; a live one adds the turns still to fly.
  let transferT = pose.transferProgress
  if (hasLaunched && !pose.captured) {
    const flown = logs.slice(launchIdx, idx + 1).filter((l) => l.phase === 'transfer').length
    const captureIdx = logs.findIndex(captured)
    const left = options.transferLeft
    const total =
      captureIdx >= launchIdx
        ? captureIdx - launchIdx
        : typeof left === 'number' && Number.isFinite(left) && idx === last
          ? flown + Math.max(0, left)
          : flown + 1
    // Between two months the craft keeps going: add the part of the next month already flown
    const frac = idx === last && captureIdx < launchIdx ? Math.min(1, Math.max(0, options.monthFraction ?? 0)) : 0
    transferT = total > 0 ? Math.min(1, (flown + frac) / total) : 0
  }

  return {
    stage: pose.captured ? 'orbit' : hasLaunched ? 'transfer' : 'ground',
    transferT: pose.captured ? 1 : transferT,
    coverage: Math.min(1, Math.max(0, pose.coveragePercent / 100)),
    orbitId: design.orbit,
    instruments: design.instruments,
    burn: !!log && captured(log),
    downlink: !!log && log.dataSent > 0,
    science: !!log && log.dataGenerated > 0,
    cues: log ? log.events.map((e) => e.eventId) : [],
    ending: pose.terminal ?? null,
    turn: log?.turn ?? 0,
  }
}
