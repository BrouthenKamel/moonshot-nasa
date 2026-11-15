import { describe, expect, it } from 'vitest'
import {
  EVENTS,
  FAIRING_ALT,
  TARGET_V,
  botFlight,
  currentEvent,
  eventById,
  eventTime,
  holdBand,
  newLaunch,
  pitchProgram,
  press,
  setupFromDesign,
  simSpeed,
  step,
  summarize,
  tapTime,
  type LaunchState,
} from './logic'

/** Flies to just before `cond`, tapping nothing, so a test can press by hand */
function flyUntil(s: LaunchState, cond: (s: LaunchState) => boolean, limit = 200_000) {
  let guard = 0
  while (!cond(s) && s.running && guard++ < limit) step(s, 1 / 120)
  return s
}

describe('the seven events', () => {
  it('has one hold among seven taps, in flight order', () => {
    expect(EVENTS.map((e) => e.id)).toEqual(['ignite', 'pitch', 'maxq', 'stage', 'fairing', 'cutoff', 'deploy'])
    expect(EVENTS.filter((e) => e.kind === 'hold').map((e) => e.id)).toEqual(['maxq'])
  })

  it('gives every event a title, a short line and a longer fact', () => {
    for (const e of EVENTS) {
      expect(e.title.length).toBeGreaterThan(3)
      expect(e.short.length).toBeGreaterThan(30)
      expect(e.fact.length).toBeGreaterThan(40)
    }
  })
})

describe('the gravity turn', () => {
  it('holds the rocket straight up for the first seconds, then tips it over', () => {
    expect(pitchProgram(0)).toBe(0)
    expect(pitchProgram(5)).toBe(0)
    expect(pitchProgram(30)).toBeGreaterThan(10)
    expect(pitchProgram(120)).toBeGreaterThan(80)
  })

  it('never pitches past horizontal by much', () => {
    expect(pitchProgram(400)).toBeLessThanOrEqual(100)
  })
})

describe('a perfect flight', () => {
  const { state, result } = botFlight('perfect')

  it('reaches a stable orbit and ends', () => {
    expect(state.running).toBe(false)
    expect(result.stable).toBe(true)
    expect(result.orbit.bound).toBe(true)
    expect(result.orbit.perigeeKm).toBeGreaterThan(120)
    expect(result.orbit.apogeeKm).toBeLessThan(600)
  })

  it('scores every event perfect, for three stars and an unbroken combo', () => {
    expect(Object.values(result.grades)).toEqual(Array(7).fill('perfect'))
    expect(result.stars).toBe(3)
    expect(result.bestCombo).toBe(7)
  })

  it('leaves the airframe unstressed and fuel for the trip to the Moon', () => {
    expect(result.stress).toBeLessThan(0.1)
    expect(result.fuelLeftPct).toBeGreaterThan(5)
  })

  it('passes through the real milestones: Max Q low down, staging high, fairing above the line', () => {
    expect(result.maxQkPa).toBeGreaterThan(30)
    expect(result.maxQkPa).toBeLessThan(80)
    expect(state.cutoffAt).not.toBeNull()
    expect(state.fairingAt).not.toBeNull()
  })

  it('cuts the engine within a whisker of orbital speed', () => {
    // The bot taps the first tick past the mark, so it can only be a hair over
    expect(Math.hypot(state.vx, state.vy)).toBeGreaterThan(TARGET_V - 50)
    expect(Math.hypot(state.vx, state.vy)).toBeLessThan(TARGET_V + 50)
  })
})

describe('a sloppy flight', () => {
  const sloppy = botFlight('sloppy')

  it('still reaches orbit: one button can never strand you', () => {
    expect(sloppy.result.orbit.bound).toBe(true)
    expect(sloppy.state.deployed).toBe(true)
  })

  it('scores below a perfect one and stresses the airframe by skipping the Max Q hold', () => {
    expect(sloppy.result.score).toBeLessThan(botFlight('perfect').result.score)
    expect(sloppy.result.grades.maxq).toBe('off')
    expect(sloppy.result.stress).toBeGreaterThan(0.5)
  })
})

describe('a flight nobody plays', () => {
  const asleep = botFlight('asleep')

  it('is flown by the computer to the end, every event missed', () => {
    expect(asleep.state.running).toBe(false)
    expect(asleep.state.deployed).toBe(true)
    expect(Object.values(asleep.result.grades)).toEqual(Array(7).fill('off'))
  })

  it('never builds a combo and earns one star', () => {
    expect(asleep.result.bestCombo).toBe(0)
    expect(asleep.result.stars).toBe(1)
  })
})

describe('tapping', () => {
  it('calls a tap on the mark perfect and a late one off', () => {
    const early = newLaunch()
    flyUntil(early, (s) => s.t >= -3)
    expect(press(early)!.grade).toBe('perfect')

    const late = newLaunch()
    flyUntil(late, (s) => s.t >= -3 + 1.5)
    expect(press(late)!.grade).toBe('off')
  })

  it('refuses a tap long before the mark without using up the event', () => {
    const s = newLaunch()
    const fb = press(s)!
    expect(fb.grade).toBe('early')
    expect(s.idx).toBe(0)
    expect(s.engineOn).toBe(false)
  })

  it('hands the event to the computer two seconds after the mark', () => {
    const s = newLaunch()
    flyUntil(s, (s) => s.idx > 0)
    expect(s.grades.ignite).toBe('off')
    expect(s.engineOn).toBe(true)
  })

  it('breaks the combo on a miss and builds it back up', () => {
    const s = newLaunch()
    flyUntil(s, (s) => s.t >= -3)
    press(s)
    expect(s.combo).toBe(1)
    flyUntil(s, (s) => s.idx > 1) // let the pitch mark go by
    expect(s.combo).toBe(0)
  })

  it('pays more for a hit inside a combo than for the same hit alone', () => {
    const solo = newLaunch()
    flyUntil(solo, (s) => s.t >= -3)
    const first = press(solo)!.points

    flyUntil(solo, (s) => s.t >= 10)
    const second = press(solo)!.points
    expect(second).toBeGreaterThan(first)
  })
})

describe('holding through Max Q', () => {
  it('rewards covering the band and throttles the engine down while held', () => {
    const s = newLaunch()
    let throttledDown = false
    let guard = 0
    while (s.running && s.idx < 3 && guard++ < 200_000) {
      const ev = currentEvent(s)
      if (ev?.kind === 'tap') {
        const tt = tapTime(s, ev)
        if (s.t >= tt) press(s)
      } else if (ev?.kind === 'hold') {
        const [a, b] = holdBand(s, ev)
        const inBand = s.t >= a && s.t <= b
        if (inBand && !s.holding) press(s)
        if (!inBand && s.holding) s.holding = false
      }
      step(s, 1 / 120)
      if (s.holding) throttledDown ||= s.throttle < 1
    }
    expect(throttledDown).toBe(true)
    expect(s.grades.maxq).toBe('perfect')
  })

  it('marks the hold off when the band passes untouched', () => {
    const s = newLaunch()
    flyUntil(s, (s) => s.idx > 2)
    expect(s.grades.maxq).toBe('off')
  })
})

describe('the marks', () => {
  it('fixes ignition and the pitch-over at the same time every flight', () => {
    const s = newLaunch()
    expect(eventTime(s, eventById('ignite'))).toBe(-3)
    expect(eventTime(s, eventById('pitch'))).toBe(10)
  })

  it('locks the staging mark once stage one runs dry', () => {
    const { state } = botFlight('perfect')
    expect(state.burnoutAt).not.toBeNull()
    expect(state.stagedAt).toBeGreaterThan(60)
  })

  it('puts the fairing mark at the 110 km line', () => {
    const s = newLaunch()
    let guard = 0
    while (s.running && s.idx < 5 && guard++ < 200_000) {
      const ev = currentEvent(s)!
      const tt = eventTime(s, ev)
      if (Array.isArray(tt)) {
        const inBand = s.t >= tt[0] && s.t <= tt[1]
        if (inBand && !s.holding) press(s)
        if (!inBand && s.holding) s.holding = false
      } else if (s.t >= tt) press(s)
      step(s, 1 / 120)
    }
    // The fairing came off within a few km of the line
    expect(Math.abs(s.h - FAIRING_ALT)).toBeLessThan(6e3)
  })
})

describe('time warp', () => {
  it('runs at twice real time while an event is near and faster while it is far', () => {
    const s = newLaunch()
    flyUntil(s, (s) => s.t >= -3.5)
    expect(simSpeed(s)).toBe(2)

    // Once the fairing is gone, orbit is still minutes of quiet burning away
    const coasting = newLaunch()
    flyUntil(coasting, (s) => s.idx >= 5)
    expect(simSpeed(coasting)).toBeGreaterThan(2)
  })
})

describe('the ride in the player’s design', () => {
  it('names the ride and carries its mass limit into the launch', () => {
    const gto = setupFromDesign({ ride: 'ride-gto' })
    expect(gto.rideName).toBe('GTO Rideshare')
    expect(gto.payloadMass).toBeGreaterThan(4e3)
  })

  it('falls back to the brief’s ride when there is no design yet', () => {
    expect(setupFromDesign(null).rideName).toBe('Lunar Rideshare')
    expect(setupFromDesign({ ride: 'nonsense' }).rideName).toBe('Lunar Rideshare')
  })

  it('reaches orbit on every ride', () => {
    for (const ride of ['ride-gto', 'ride-lunar', 'ride-commercial']) {
      const { result } = botFlight('perfect', setupFromDesign({ ride }))
      expect(result.orbit.bound, ride).toBe(true)
      expect(result.stable, ride).toBe(true)
    }
  })
})

describe('the result slip', () => {
  it('gives one star and says why when the orbit is no good', () => {
    const s = newLaunch()
    // Cut off far too early: the craft never gets going
    flyUntil(s, (s) => s.idx >= 5)
    press(s)
    const r = summarize(s)
    expect(r.stars).toBe(1)
    expect(r.stable).toBe(false)
    expect(r.verdict).toMatch(/re-enter|not the one we planned/)
  })
})
