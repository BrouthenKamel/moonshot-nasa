import { describe, expect, it } from 'vitest'
import { computeBudgets, createDefaultDesign } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import type { CheckResult, GoNoGoResult } from '../../sim/types'
import {
  AUTO_SCRUB_AT_S,
  COUNT_FROM_S,
  FIX_ROOM,
  HOLD_DAYS,
  SCRUB_DAYS,
  buildResult,
  consoleStates,
  headline,
  newCountdown,
  resolveHold,
  rng,
  rollHold,
  tickCountdown,
  type Countdown,
  type HoldEvent,
} from './logic'

function chk(p: Partial<CheckResult> & Pick<CheckResult, 'resource' | 'status'>): CheckResult {
  const value = p.value ?? 0
  const limit = p.limit ?? 0
  return { unit: 'W', reason: 'because', margin: limit - value, value, limit, ...p }
}

function result(checks: CheckResult[]): GoNoGoResult {
  const blockers = checks.filter((c) => c.status === 'red')
  return { canGo: blockers.length === 0, checks, blockers, warnings: checks.filter((c) => c.status === 'yellow') }
}

describe('headline: honest caution wording', () => {
  it('says how far over the limit a caution check is, instead of "little to spare"', () => {
    expect(headline(chk({ resource: 'Power', status: 'yellow', value: 62, limit: 42, unit: 'W', fixStep: 'spacecraft' }))).toBe(
      'Power: 20 W over the limit',
    )
  })
  it('says how little is left when a caution check is under its limit', () => {
    expect(headline(chk({ resource: 'Mass', status: 'yellow', value: 13.4, limit: 14, unit: 'kg' }))).toBe('Mass: only 0.6 kg to spare')
    expect(headline(chk({ resource: 'Time', status: 'yellow', value: 9, limit: 9, unit: 'month' }))).toBe('Time: only 0 months to spare')
  })
  it('words budget, science, comms and red checks', () => {
    expect(headline(chk({ resource: 'Budget', status: 'red', value: 27, limit: 25, unit: '$M' }))).toBe('Budget: 2 M over the limit')
    expect(headline(chk({ resource: 'Budget', status: 'red', value: 21.3, limit: 25, unit: '$M' }))).toBe('Budget: more than you can spend')
    expect(headline(chk({ resource: 'Propulsion', status: 'red', value: 100, limit: 200, unit: 'm/s' }))).toBe('Propulsion: blocked')
    expect(headline(chk({ resource: 'Science', status: 'yellow', value: 40, limit: 70, margin: -30, unit: '% ice' }))).toBe(
      'Science: 40% of the 70% ice target',
    )
    expect(headline(chk({ resource: 'Science', status: 'yellow', value: 80, limit: 70, margin: 10, unit: '% ice' }))).toBe(
      'Science: short of the data target',
    )
    expect(headline(chk({ resource: 'Comms', status: 'yellow', value: 8, limit: 8, unit: 'kbps' }))).toBe(
      'Comms: the radio cannot use the whole pass',
    )
    expect(headline(chk({ resource: 'Comms', status: 'red', value: 0, limit: 0, unit: 'kbps' }))).toBe('Comms: no link home')
    expect(headline(chk({ resource: 'Mass', status: 'green', value: 10, limit: 14, unit: 'kg' }))).toBe('Mass: OK')
    expect(headline(chk({ resource: 'Months', status: 'yellow', value: 10, limit: 9, unit: 'month' }))).toBe('Months: 1 month over the limit')
  })
})

describe('consoleStates', () => {
  it('keeps the sim status: a red check makes its console NO-GO and points at the room that fixes it', () => {
    const r = result([
      chk({ resource: 'Budget', status: 'red', value: 27, limit: 25, unit: '$M', fixStep: 'spacecraft' }),
      chk({ resource: 'Data Link', status: 'green', fixStep: 'comms' }),
    ])
    const cs = consoleStates(r)
    expect(cs.map((c) => c.role)).toEqual(['ground', 'science', 'space', 'launch'])
    const space = cs.find((c) => c.role === 'space')!
    expect(space.status).toBe('red')
    expect(space.call).toBe('NO-GO')
    expect(space.fixRoom).toBe('clean-room')
    expect(cs.find((c) => c.role === 'science')!.call).toBe('GO')
  })

  it('calls a caution over its limit "GO, OVER A LIMIT", and a plain caution "GO WITH CAUTION"', () => {
    const over = consoleStates(result([chk({ resource: 'Power', status: 'yellow', value: 62, limit: 42, fixStep: 'spacecraft' })]))
    expect(over.find((c) => c.role === 'space')!.call).toBe('GO, OVER A LIMIT')
    const tight = consoleStates(result([chk({ resource: 'Mass', status: 'yellow', value: 13, limit: 14, unit: 'kg', fixStep: 'spacecraft' })]))
    expect(tight.find((c) => c.role === 'space')!.call).toBe('GO WITH CAUTION')
    const sci = consoleStates(result([chk({ resource: 'Science', status: 'yellow', value: 0, limit: 70, margin: -70, unit: '% ice', fixStep: 'instruments' })]))
    expect(sci.find((c) => c.role === 'science')!.call).toBe('GO, BELOW TARGET')
  })

  it('sorts a console\'s lines worst first', () => {
    const cs = consoleStates(
      result([
        chk({ resource: 'Mass', status: 'green', fixStep: 'spacecraft' }),
        chk({ resource: 'Power', status: 'yellow', value: 50, limit: 42, fixStep: 'spacecraft' }),
        chk({ resource: 'Budget', status: 'red', value: 27, limit: 25, fixStep: 'spacecraft' }),
      ]),
    )
    expect(cs.find((c) => c.role === 'space')!.lines.map((l) => l.check.resource)).toEqual(['Budget', 'Power', 'Mass'])
  })

  it('reads a real design through sim/checks', () => {
    const d = createDefaultDesign()
    const r = goNoGo(d, computeBudgets(d, 'engineer'))
    const cs = consoleStates(r)
    expect(cs).toHaveLength(4)
    // Same verdict as the sim: any red console blocks, and only then
    expect(cs.some((c) => c.status === 'red')).toBe(!r.canGo)
  })

  it('maps every design step to a campus room', () => {
    expect(FIX_ROOM.planning).toBe('thermal-vac')
    expect(FIX_ROOM.ride).toBe('launch-hangar')
    expect(FIX_ROOM.instruments).toBe('science-lab')
  })
})

describe('weather and range hold', () => {
  it('rng is deterministic per seed', () => {
    const a = rng(7)
    const b = rng(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('a high first roll means a clean count', () => {
    expect(rollHold(() => 0.99)).toBeNull()
  })

  it('rolls wind or a range boat with a bounded scrub chance', () => {
    const seq = (xs: number[]) => {
      let i = 0
      return () => xs[i++ % xs.length]
    }
    const wind = rollHold(seq([0.1, 0.1, 0.99]))!
    expect(wind.kind).toBe('wind')
    expect(wind.value).toBe(38)
    expect(wind.scrubChance).toBeLessThanOrEqual(0.85)
    const calm = rollHold(seq([0.1, 0.1, 0]))!
    expect(calm.value).toBe(26)
    expect(calm.scrubChance).toBeCloseTo(0.14, 2)
    const range = rollHold(seq([0.1, 0.9, 0.5]))!
    expect(range.kind).toBe('range')
    expect(range.value).toBe(5)
    expect(range.scrubChance).toBeGreaterThanOrEqual(0.2)
    for (let s = 1; s < 200; s++) {
      const ev = rollHold(rng(s))
      if (ev) expect(ev.scrubChance).toBeGreaterThan(0)
    }
  })

  it('hold costs a sure day; proceed is free unless the roll scrubs it', () => {
    const ev: HoldEvent = { kind: 'wind', value: 33, limit: 30, unit: 'kn', scrubChance: 0.5, text: '' }
    expect(resolveHold(ev, 'hold', 0)).toEqual({ days: HOLD_DAYS, scrubAtT3: false })
    expect(resolveHold(ev, 'proceed', 0.9)).toEqual({ days: 0, scrubAtT3: false })
    expect(resolveHold(ev, 'proceed', 0.1)).toEqual({ days: SCRUB_DAYS, scrubAtT3: true })
  })
})

describe('hold-to-launch countdown', () => {
  const run = (c: Countdown, seconds: number, holding: boolean, dt = 0.1) => {
    let x = c
    for (let t = 0; t < seconds - 1e-9; t += dt) x = tickCountdown(x, dt, holding)
    return x
  }

  it('waits for the key, then counts from T-10 while held, then lifts off', () => {
    let c = newCountdown()
    c = tickCountdown(c, 0.5, false)
    expect(c.phase).toBe('armed')
    c = tickCountdown(c, 0.016, true)
    expect(c).toMatchObject({ phase: 'counting', t: COUNT_FROM_S })
    c = run(c, 5, true)
    expect(c.t).toBeCloseTo(5, 5)
    c = run(c, 5.2, true)
    expect(c.phase).toBe('liftoff')
    expect(tickCountdown(c, 1, false)).toBe(c)
  })

  it('letting go scrubs, and the count only recycles after a fresh press', () => {
    let c = run(tickCountdown(newCountdown(), 0, true), 4, true)
    c = tickCountdown(c, 0.016, false)
    expect(c).toMatchObject({ phase: 'scrubbed', scrubs: 1, reason: 'released', t: COUNT_FROM_S })
    // Still holding from before the scrub does not restart it
    expect(tickCountdown({ ...c }, 0.1, true).phase).toBe('scrubbed')
    c = tickCountdown(c, 0.1, false)
    expect(c.phase).toBe('armed')
    c = tickCountdown(c, 0.1, true)
    expect(c.phase).toBe('counting')
  })

  it('pressing on into bad weather can make the sequencer scrub at T-3, once', () => {
    let c = tickCountdown(newCountdown(true), 0, true)
    c = run(c, COUNT_FROM_S - AUTO_SCRUB_AT_S + 0.05, true)
    expect(c).toMatchObject({ phase: 'scrubbed', reason: 'weather', autoScrub: false, scrubs: 0 })
    c = tickCountdown(tickCountdown(c, 0.1, false), 0.1, true)
    c = run(c, 10.2, true)
    expect(c.phase).toBe('liftoff')
  })
})

describe('buildResult', () => {
  const consoles = consoleStates(
    result([
      chk({ resource: 'Power', status: 'yellow', value: 62, limit: 42, fixStep: 'spacecraft' }),
      chk({ resource: 'Mass', status: 'yellow', value: 13.5, limit: 14, unit: 'kg', fixStep: 'spacecraft' }),
    ]),
  )
  const ev: HoldEvent = { kind: 'wind', value: 33, limit: 30, unit: 'kn', scrubChance: 0.5, text: '' }

  it('quotes the slip and the closest call, with no design change', () => {
    const r = buildResult({ consoles, hold: ev, choice: 'hold', daysLost: 1, scrubs: 2, durationS: 61.4 })
    expect(r.patch).toEqual({})
    expect(r.durationS).toBe(61)
    expect(r.insights[0]).toMatchObject({ id: 'launch-slip', room: 'mission-control', metric: { value: 1, unit: 'days' } })
    expect(r.insights[0].text).toContain('1 day late')
    expect(r.insights[1]).toMatchObject({ id: 'launch-caution', metric: { label: 'Power margin at launch', value: -20, unit: 'W' } })
    expect(r.insights[1].text).toContain('20 W over the limit')
    const sci = consoleStates(result([chk({ resource: 'Science', status: 'yellow', value: 0, limit: 70, margin: -70, unit: '% ice', fixStep: 'instruments' })]))
    expect(buildResult({ consoles: sci, hold: null, choice: null, daysLost: 0, scrubs: 0, durationS: 1 }).insights[1].text).toBe(
      'You launched with Science on caution (0% of the 70% ice target).',
    )
  })

  it('words each weather outcome', () => {
    expect(buildResult({ consoles: [], hold: null, choice: null, daysLost: 0, scrubs: 0, durationS: 1 }).insights).toHaveLength(1)
    expect(buildResult({ consoles: [], hold: null, choice: null, daysLost: 0, scrubs: 0, durationS: 1 }).insights[0].text).toContain('Clean')
    expect(buildResult({ consoles: [], hold: ev, choice: 'proceed', daysLost: 2, scrubs: 0, durationS: 1 }).insights[0].text).toContain('T-3')
    expect(buildResult({ consoles: [], hold: { ...ev, kind: 'range' }, choice: 'proceed', daysLost: 0, scrubs: 0, durationS: 1 }).insights[0].text).toContain(
      'on time',
    )
    expect(buildResult({ consoles: [], hold: { ...ev, kind: 'range' }, choice: 'hold', daysLost: 2, scrubs: 0, durationS: 1 }).insights[0].text).toContain(
      'range and launched 2 days late',
    )
  })
})
