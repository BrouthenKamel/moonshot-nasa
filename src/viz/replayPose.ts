import { getOrbitById } from '../data/orbits'
import { getTransferById } from '../data/transfers'
import type { Design, TurnLog } from '../sim/types'

export interface Pose {
  where: 'earth' | 'transfer' | 'orbit'
  transferProgress: number // 0..1 along the Earth-Moon arc
  orbitAngle: number // radians around the Moon
  orbitAltitudeKm: number // from the design's orbit, 100 if unknown
  captured: boolean
  coveragePercent: number
  phase: TurnLog['phase'] // phase at the START of that turn
  terminal?: 'complete' | 'failed'
}

const ORBIT_STEP = Math.PI / 6
const DEFAULT_ALTITUDE_KM = 100

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Ship pose at the end of turn `turnIndex`, derived only from the turn logs and design.
 * `turnIndex` is clamped to the available logs; an empty log list gives the Earth pose.
 */
export function replayPose(
  design: Design,
  logs: TurnLog[],
  turnIndex: number,
  terminal?: 'complete' | 'failed'
): Pose {
  const orbitAltitudeKm = finiteOr(getOrbitById(design.orbit)?.altitude, DEFAULT_ALTITUDE_KM)

  if (logs.length === 0) {
    return {
      where: 'earth',
      transferProgress: 0,
      orbitAngle: 0,
      orbitAltitudeKm,
      captured: false,
      coveragePercent: 0,
      phase: 'build',
    }
  }

  const last = logs.length - 1
  const idx = Number.isFinite(turnIndex) ? Math.min(last, Math.max(0, Math.trunc(turnIndex))) : 0
  const inRange = logs.slice(0, idx + 1)

  const rawDuration = getTransferById(design.transfer)?.durationTurns
  const duration = rawDuration !== undefined && Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 1

  const transferTurns = inRange.filter((l) => l.phase === 'transfer').length
  const orbitTurns = inRange.filter((l) => l.phase === 'orbit').length
  const captured = inRange.some(
    (l) => l.phase === 'orbit' || l.notes.some((n) => n.startsWith('Capture burn successful'))
  )

  const where: Pose['where'] = captured ? 'orbit' : transferTurns > 0 ? 'transfer' : 'earth'
  const current = logs[idx]

  const pose: Pose = {
    where,
    transferProgress: captured ? 1 : Math.min(1, transferTurns / duration),
    orbitAngle: orbitTurns * ORBIT_STEP,
    orbitAltitudeKm,
    captured,
    coveragePercent: finiteOr(current.coveragePercent, 0),
    phase: current.phase,
  }
  if (terminal && idx === last) pose.terminal = terminal
  return pose
}
