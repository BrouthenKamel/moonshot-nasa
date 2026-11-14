import { describe, expect, it } from 'vitest'
import { cuesFor, musicFor, type FlightSnapshot, type Snapshot } from './cues'

const base: Snapshot = { screen: 'base', designStep: 'brief', design: { solar: 'a', radio: 'x' }, canGo: false, flight: null, outcome: null }
const flight = (over: Partial<FlightSnapshot> = {}): FlightSnapshot => ({
  logCount: 0,
  newLogs: [],
  pendingKey: null,
  pendingTurn: null,
  launched: false,
  captured: false,
  coverage: 0,
  data: 0,
  dataTarget: 300,
  main: 5,
  ended: false,
  end: '',
  ...over,
})
const ids = (prev: Snapshot, next: Snapshot) => cuesFor(prev, next).map((c) => c.id)

describe('audio cues', () => {
  it('music follows the screen', () => {
    expect(musicFor(base)).toBe('music.theme')
    expect(musicFor({ ...base, screen: 'design' })).toBe('music.atelier')
    expect(musicFor({ ...base, flight: flight({ launched: true }) })).toBe('music.voyage')
    expect(musicFor({ ...base, screen: 'report', outcome: 'failed' })).toBe('music.failure')
    expect(musicFor({ ...base, screen: 'report', outcome: 'success' })).toBe('music.success')
  })

  it('Go / No-Go turning green chimes; turning red errors; plain design changes are silent', () => {
    const d = { ...base, screen: 'design' }
    expect(ids(d, { ...d, design: { ...d.design, solar: 'b' } })).toEqual([]) // card plays its own sound
    expect(ids(d, { ...d, design: { ...d.design, radio: 'y' } })).toEqual([]) // card plays its own sound
    expect(ids(d, { ...d, canGo: true, design: { ...d.design, radio: 'y' } })).toContain('sfx.go')
    expect(ids(d, { ...d, canGo: true })).toEqual([]) // no design change, no chime
  })

  it('liftoff: ignition, countdown, liftoff, then the departure music', () => {
    const before = { ...base, flight: flight() }
    const after = { ...base, flight: flight({ launched: true }) }
    const cues = cuesFor(before, after)
    expect(cues.map((c) => c.id)).toEqual(['sfx.ignition', 'voice.countdown', 'voice.liftoff', 'music.departure'])
    expect(cues[3]).toMatchObject({ kind: 'music', then: 'music.voyage' })
  })

  it('an event card speaks once: not again when the answered turn lands in the log', () => {
    const before = { ...base, flight: flight({ launched: true }) }
    const card = { ...base, flight: flight({ launched: true, pendingKey: 'thruster', pendingTurn: 12 }) }
    expect(ids(before, card)).toEqual(['sfx.event', 'voice.thruster'])
    const answered = {
      ...base,
      flight: flight({ launched: true, newLogs: [{ turn: 12, notes: [], dataSent: 0, events: [{ eventId: 'thruster' }] }] }),
    }
    expect(ids(card, answered)).not.toContain('voice.thruster')
  })

  it('silent orbit events and milestones speak; the end is announced from the report', () => {
    const before = { ...base, flight: flight({ launched: true, captured: true, coverage: 65, data: 250 }) }
    const after = {
      ...base,
      outcome: 'success' as const,
      flight: flight({
        launched: true,
        captured: true,
        coverage: 72,
        data: 320,
        ended: true,
        newLogs: [{ turn: 30, notes: [], dataSent: 40, events: [{ eventId: 'radiation-reset' }] }],
      }),
    }
    const out = ids(before, after)
    expect(out).toEqual(expect.arrayContaining(['voice.radiation', 'voice.ice-70', 'voice.data-target', 'voice.end-success', 'sfx.downlink']))
  })

  it('capture and a failed capture', () => {
    const before = { ...base, flight: flight({ launched: true }) }
    expect(ids(before, { ...base, flight: flight({ launched: true, captured: true }) })).toContain('voice.capture')
    expect(
      ids(before, { ...base, outcome: 'failed', flight: flight({ launched: true, ended: true, end: 'not enough delta-v left to capture' }) }),
    ).toEqual(expect.arrayContaining(['voice.capture-fail', 'voice.end-failed']))
  })
})
