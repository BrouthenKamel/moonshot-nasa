import type { EventType } from '../data/events'
import type { AudioId } from './manifest'
import { craftWasLost } from '../sim/evaluate'

/**
 * What the game sounds like, as a pure function: two snapshots of the game in, the music,
 * effects and voice lines to play out. The director (director.ts) takes the snapshots from
 * the store and plays the cues; this file holds every decision so it can be tested.
 */

export interface FlightSnapshot {
  logCount: number
  /** New turn logs since the previous snapshot, oldest first */
  newLogs: { notes: string[]; events: { eventId: EventType; choiceSucceeded?: boolean }[]; dataSent: number; turn: number }[]
  pendingKey: EventType | null
  pendingTurn: number | null
  launched: boolean
  captured: boolean
  coverage: number
  data: number
  dataTarget: number
  main: number
  ended: boolean
  end: string
}

export interface Snapshot {
  screen: string
  designStep: string
  /** Serialised design fields, to notice a change of part */
  design: Record<string, string>
  canGo: boolean
  flight: FlightSnapshot | null
  outcome: 'success' | 'partial' | 'failed' | null
}

export type Cue =
  | { kind: 'music'; id: AudioId; then?: AudioId }
  | { kind: 'sfx'; id: AudioId }
  | { kind: 'voice'; id: AudioId }

/** Voice for each event, when it happens or its card appears */
export const EVENT_VOICE: Partial<Record<EventType, AudioId>> = {
  'build-delay': 'voice.build-delay',
  'no-signal': 'voice.no-signal',
  thruster: 'voice.thruster',
  'radiation-reset': 'voice.radiation',
  'station-outage': 'voice.outage',
  'long-eclipse': 'voice.eclipse',
  'instrument-degrades': 'voice.degraded',
}

/** The music that belongs to a moment of the game */
export function musicFor(s: Snapshot): AudioId {
  if (s.screen === 'report') return s.outcome === 'failed' ? 'music.failure' : 'music.success'
  if (s.screen === 'replay') return 'music.voyage'
  if (s.screen === 'design' || s.screen === 'setup') return 'music.atelier'
  if (s.flight && s.flight.launched && !s.flight.ended) return 'music.voyage'
  return 'music.theme'
}

const hasNote = (log: { notes: string[] }, prefix: string) => log.notes.some((n) => n.startsWith(prefix))

export function cuesFor(prev: Snapshot, next: Snapshot): Cue[] {
  const cues: Cue[] = []
  const voice = (id: AudioId) => cues.push({ kind: 'voice', id })
  const sfx = (id: AudioId) => cues.push({ kind: 'sfx', id })

  // Moving around
  if (next.screen !== prev.screen || (next.screen === 'design' && next.designStep !== prev.designStep)) sfx('sfx.whoosh')

  // Design: Go / No-Go turning green or red when any design field changes
  if (next.screen === 'design' && prev.screen === 'design') {
    const changed = Object.keys(next.design).filter((k) => next.design[k] !== prev.design[k])
    if (next.canGo !== prev.canGo && changed.length > 0) sfx(next.canGo ? 'sfx.go' : 'sfx.error')
  }

  const f = next.flight
  const p = prev.flight
  if (f) {
    const was = p ?? {
      logCount: 0,
      newLogs: [],
      pendingKey: null,
      pendingTurn: null,
      launched: false,
      captured: false,
      coverage: 0,
      data: 0,
      dataTarget: f.dataTarget,
      main: f.main,
      ended: false,
      end: '',
    }
    // An event card appears: its sting and voice now; the same event in the log later stays quiet
    const carded = new Set<string>()
    if (f.pendingKey && f.pendingKey !== was.pendingKey) {
      sfx('sfx.event')
      const v = EVENT_VOICE[f.pendingKey]
      if (v) voice(v)
    }
    if (was.pendingKey && was.pendingTurn !== null) carded.add(`${was.pendingKey}@${was.pendingTurn}`)

    for (const log of f.newLogs) {
      if (hasNote(log, 'Missed the ride')) voice('voice.missed-ride')
      for (const e of log.events) {
        if (e.eventId === 'no-signal' && e.choiceSucceeded) voice('voice.signal-back')
        if (carded.has(`${e.eventId}@${log.turn}`)) continue
        const v = EVENT_VOICE[e.eventId]
        if (v) voice(v)
      }
      if (hasNote(log, 'Arriving at the Moon') && !hasNote(log, 'Capture burn successful')) voice('voice.arriving')
    }

    if (f.launched && !was.launched) {
      sfx('sfx.ignition')
      voice('voice.countdown')
      voice('voice.liftoff')
      cues.push({ kind: 'music', id: 'music.departure', then: 'music.voyage' })
    }
    if (f.captured && !was.captured) {
      sfx('sfx.burn')
      sfx('sfx.capture')
      voice('voice.capture')
    }
    if (f.ended && !was.ended && !f.captured && f.end.includes('capture')) voice('voice.capture-fail')
    if (f.coverage > 0 && was.coverage <= 0) voice('voice.ice-first')
    if (f.coverage >= 70 && was.coverage < 70) voice('voice.ice-70')
    if (f.data >= f.dataTarget && was.data < f.dataTarget) voice('voice.data-target')
    if (f.main <= 0 && was.main > 0 && !f.ended) voice('voice.reserve')
    if (f.newLogs.some((l) => l.dataSent > 0)) sfx('sfx.downlink')
    else if (f.newLogs.length > 0 && cues.length === 0) sfx('sfx.turn')
    if (f.ended && !was.ended && next.outcome) {
      // "We have lost the mission." only when the craft is gone; another failure gets no voice line (QC, 15 Nov)
      if (next.outcome === 'success') voice('voice.end-success')
      else if (next.outcome === 'partial') voice('voice.end-partial')
      else if (craftWasLost(f.end)) voice('voice.end-failed')
    }
  }

  // Music follows the moment, unless a cue above already chose it
  if (!cues.some((c) => c.kind === 'music')) {
    const want = musicFor(next)
    if (want !== musicFor(prev)) cues.push({ kind: 'music', id: want })
  }
  return cues
}
