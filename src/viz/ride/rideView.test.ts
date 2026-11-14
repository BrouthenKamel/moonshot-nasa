import { describe, it, expect } from 'vitest'
import { buildRideView, timelineLayout, type RideView } from './rideView'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign, iceCubeDesign, lunahMapDesign } from '../../sim/fixtures'
import type { Budgets, CheckResult, Design } from '../../sim/types'

function view(design: Design, patch: Partial<Budgets> = {}, checks?: CheckResult[]): RideView {
  const budgets = { ...computeBudgets(design, 'engineer'), ...patch }
  return buildRideView(design, 'engineer', budgets, checks ?? goNoGo(design, budgets).checks)
}

const layer = (v: RideView, key: string) => v.tank.layers.find((l) => l.key === key)?.value
const row = (v: RideView, id: string) => v.rows.find((r) => r.id === id)!

describe('buildRideView', () => {
  it('default craft on the lunar ride with low-energy transfer', () => {
    const v = view(iceCubeDesign)
    expect(v.reach).toBe('ok')
    expect(v.tank.available).toBeCloseTo(2628, 0)
    expect(v.tank.layers.map((l) => l.key)).toEqual(['capture', 'hold', 'spare'])
    expect(layer(v, 'capture')).toBe(1000)
    expect(layer(v, 'hold')).toBe(60)
    expect(layer(v, 'spare')).toBeCloseTo(1568, 0)
    expect(v.path.dots).toBe(11)
    expect(v.timeline).toMatchObject({ readyTurn: 7, rideTurn: 8, transferTurns: 11, arrivalTurn: 19 })
    expect(v.status).toBe(v.bars.some((b) => b.status === 'red') ? 'nogo' : v.bars.some((b) => b.status === 'yellow') ? 'caution' : 'go')
    expect(v.orbit.colour).toBe('#a3e635')
  })

  it('layers match the budget fields in every state', () => {
    for (const d of [iceCubeDesign, flashlightDesign, lunahMapDesign])
      for (const ride of ['ride-gto', 'ride-lunar', 'ride-commercial'])
        for (const transfer of ['transfer-direct', 'transfer-low-energy']) {
          const design = { ...d, ride, transfer }
          const b = computeBudgets(design, 'engineer')
          const v = view(design)
          if (v.reach !== 'ok' && v.reach !== 'flyPast') continue
          const used = (layer(v, 'climb') ?? 0) + (layer(v, 'capture') ?? 0) + (layer(v, 'hold') ?? 0)
          expect(used).toBeCloseTo(b.deltaVTotal, 6)
          const leftover = layer(v, 'spare') ?? v.tank.shortBy
          expect(leftover).toBeCloseTo(Math.abs(b.deltaVMargin), 6)
        }
  })

  it('ion engine on a direct transfer has no way through', () => {
    const v = view({ ...iceCubeDesign, transfer: 'transfer-direct' })
    expect(v.reach).toBe('noWay')
    expect(v.path.blockedLabel).toBe('NO WAY THROUGH')
    expect(v.tank.greyLabel).toBe('CANNOT GET THERE')
    expect(v.path.dots).toBe(0)
    expect(v.timeline.arrivalTurn).toBeNull()
    expect(v.signs.find((s) => s.type === 'direct')).toMatchObject({ selected: true, selectable: false })
  })

  it('ion engine with the body-mounted array has no power', () => {
    const v = view({ ...iceCubeDesign, solar: 'solar-body' })
    expect(v.reach).toBe('noPower')
    expect(v.tank.greyLabel).toBe('ENGINE HAS NO POWER')
    expect(v.path.blockedLabel).toBe('ENGINE HAS NO POWER')
  })

  it('chemical craft on lunar + direct flies past', () => {
    const v = view({ ...flashlightDesign, transfer: 'transfer-direct' })
    expect(v.reach).toBe('flyPast')
    expect(v.tank.shortBy).toBeCloseTo(215, 0)
    expect(v.timeline.direct).toBe(true)
    expect(v.timeline.showMapping).toBe(false)
    expect(v.status).toBe('nogo')
  })

  it('board statuses', () => {
    const f = view(flashlightDesign)
    expect(row(f, 'ride-gto').status).toBe('wrongEngine')
    expect(row(f, 'ride-lunar').status).toBe('onTime')
    expect(row(f, 'ride-commercial').status).toBe('tooHeavy')

    const i = view(iceCubeDesign)
    expect(row(i, 'ride-gto')).toMatchObject({ status: 'tooEarly', limitKg: 14, burn: 2500, overBudget: true, arrivalTurn: 27 })
    // The reserve line is a hard limit: under the cap but over what is spendable reads INTO THE RESERVE
    const reserve = view({ ...flashlightDesign, planning: { ...flashlightDesign.planning, reservePercent: 20 } })
    expect(row(reserve, 'ride-lunar')).toMatchObject({ status: 'overBudget', statusLabel: 'INTO THE RESERVE', overBudget: true })
    expect(row(i, 'ride-gto').planCost).toBeCloseTo(27.5, 1)
    expect(row(i, 'ride-lunar').planCost).toBeCloseTo(24.9, 1)
    expect(row(i, 'ride-lunar').arrivalTurn).toBe(19)
    expect(row(i, 'ride-commercial').burn).toBe(400)
    expect(i.rows.map((r) => r.turn)).toEqual([6, 8, 10])
    expect(i.rows.filter((r) => r.selected)).toHaveLength(1)

    const untested = view({ ...iceCubeDesign, planning: { ...iceCubeDesign.planning, testTurns: 0 } })
    expect(row(untested, 'ride-gto').status).toBe('overBudget')
    expect(row(untested, 'ride-gto').statusLabel).toBe('OVER BUDGET')
  })

  it('GTO ride adds the spiral', () => {
    const v = view({ ...iceCubeDesign, ride: 'ride-gto' })
    expect(v.path.spiral).toBe(true)
    expect(v.tank.layers[0]).toMatchObject({ key: 'climb', value: 1500 })
    expect(v.path.dots).toBe(21)
    expect(v.timeline.turns).toBe(40)
  })

  it('dots are capped at 24', () => {
    const v = view(iceCubeDesign, { transferTurns: 30, arrivalTurn: 38 })
    expect(v.path.dots).toBe(24)
    expect(v.timeline.turns).toBe(51)
  })

  it('unknown ride and transfer ids', () => {
    const v = view({ ...iceCubeDesign, ride: 'x', transfer: 'y' })
    expect(v.rows.some((r) => r.selected)).toBe(false)
    expect(v.signs.some((s) => s.selected)).toBe(false)
    expect(v.rideName).toBe('')
    expect(JSON.stringify(v)).not.toContain('NaN')
    expect(v.tank.scaleMax).toBeGreaterThanOrEqual(1)
  })

  it('no propellant means no way through', () => {
    const v = view(iceCubeDesign, { captureDeltaV: null, deltaVAvailable: 0, deltaVTotal: 0 })
    expect(v.reach).toBe('noWay')
    expect(v.tank.scaleMax).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(v)).not.toContain('NaN')
  })

  it('overall status follows the four bars only', () => {
    const d = flashlightDesign
    const b = computeBudgets(d, 'engineer')
    const checks: CheckResult[] = ['Delta-v', 'Mass', 'Time', 'Budget', 'Science'].map((resource) => ({
      resource,
      status: resource === 'Science' ? 'red' : 'green',
      value: 0,
      limit: 0,
      margin: 0,
      unit: '',
      reason: resource === 'Science' ? 'no ice' : '',
    }))
    const v = buildRideView(d, 'engineer', b, checks)
    expect(v.status).toBe('go')
    expect(v.statusLabel).toBe('GO FOR LAUNCH')
    expect(v.bars.map((x) => x.resource)).toEqual(['Delta-v', 'Mass', 'Time', 'Budget'])
    expect(v.reasons).toHaveLength(0)
  })

  it('reasons list red first, then yellow, at most three', () => {
    const v = view({ ...iceCubeDesign, ride: 'ride-gto' })
    expect(v.reasons.length).toBeLessThanOrEqual(3)
    const order = v.reasons.map((r) => r.status)
    expect(order).toEqual([...order].sort((a, b) => (a === b ? 0 : a === 'red' ? -1 : 1)))
    expect(v.reasons[0].status).toBe('red')
    expect(v.costLine).toBe('PLAN COST $27.5M OF $25M')
  })
})

describe('board rows say whether that ride gets the craft there', () => {
  it('a ride whose burn the tank cannot brake reads CANT BRAKE with no arrival', () => {
    const v = view({ ...flashlightDesign, transfer: 'transfer-direct' })
    expect(row(v, 'ride-lunar')).toMatchObject({ status: 'cantReach', statusLabel: "CAN'T BRAKE", arrivalTurn: null })
    // The commercial ride halves the burn: the tank can brake there, so its own status shows
    expect(row(v, 'ride-commercial')).toMatchObject({ status: 'tooHeavy', arrivalTurn: 10 })
  })

  it('an ion engine on the direct transfer has no way through on any ride', () => {
    const v = view({ ...iceCubeDesign, transfer: 'transfer-direct' })
    for (const r of v.rows) {
      expect(r.status).toBe('cantReach')
      expect(r.statusLabel).toBe('NO WAY THROUGH')
      expect(r.arrivalTurn).toBeNull()
    }
  })

  it('an ion engine without power reads NO POWER', () => {
    const v = view({ ...iceCubeDesign, solar: 'solar-body' })
    expect(row(v, 'ride-lunar')).toMatchObject({ status: 'cantReach', statusLabel: 'NO POWER', arrivalTurn: null })
  })

  it('over the cap reads OVER BUDGET', () => {
    const untested = view({ ...iceCubeDesign, planning: { ...iceCubeDesign.planning, testTurns: 0 } })
    expect(row(untested, 'ride-gto').statusLabel).toBe('OVER BUDGET')
  })
})

describe('timelineLayout', () => {
  const layout = (d: Design) => timelineLayout(view(d).timeline)
  const flag = (l: ReturnType<typeof timelineLayout>, key: string) => l.flags.find((f) => f.key === key)!
  const block = (l: ReturnType<typeof timelineLayout>, key: string) => l.blocks.find((b) => b.key === key)!

  it('the READY flag sits at the end of the design block, one turn of margin before launch', () => {
    const v = view(iceCubeDesign)
    const l = timelineLayout(v.timeline)
    expect(flag(l, 'ready').at).toBeCloseTo(block(l, 'design').to, 9)
    expect(flag(l, 'launch').at - flag(l, 'ready').at).toBeCloseTo(1 / v.timeline.turns, 9)
    expect(block(l, 'transit')).toMatchObject({ label: '11 TURNS IN TRANSIT' })
    expect(flag(l, 'arrive').label).toBe('ARRIVE · TURN 19')
  })

  it('a short transit joins launch and arrival in one label', () => {
    const l = layout({ ...flashlightDesign, ride: 'ride-commercial' })
    expect(flag(l, 'launch').label).toBe('LAUNCH · TURN 10 → ARRIVE · TURN 11')
    expect(flag(l, 'arrive').label).toBe('')
    expect(block(l, 'transit').label).toBe('1 TURN IN TRANSIT')
  })

  it('a direct transfer arrives five days after launch', () => {
    const l = layout({ ...flashlightDesign, ride: 'ride-commercial', transfer: 'transfer-direct' })
    expect(flag(l, 'launch').label).toBe('LAUNCH · TURN 10 · AT THE MOON 5 DAYS LATER')
    expect(l.flags.some((f) => f.key === 'arrive')).toBe(false)
    expect(l.blocks.some((b) => b.key === 'transit')).toBe(false)
    expect(block(l, 'mapping').from).toBeCloseTo(10 / 28, 9)
  })

  it('flying past shows no mapping', () => {
    const l = layout({ ...flashlightDesign, transfer: 'transfer-direct' })
    expect(flag(l, 'launch').label).toBe('LAUNCH · TURN 8 · FLIES PAST THE MOON 5 DAYS LATER')
    expect(l.blocks.some((b) => b.key === 'mapping')).toBe(false)
  })

  it('blocked paths show only ready and launch', () => {
    const l = layout({ ...iceCubeDesign, transfer: 'transfer-direct' })
    expect(l.flags.map((f) => f.key).sort()).toEqual(['launch', 'ready'])
    expect(l.blocks.map((b) => b.key)).toEqual(['design'])
  })

  it('every position is inside the strip', () => {
    for (const d of [iceCubeDesign, flashlightDesign, lunahMapDesign])
      for (const ride of ['ride-gto', 'ride-lunar', 'ride-commercial'])
        for (const transfer of ['transfer-direct', 'transfer-low-energy']) {
          const l = layout({ ...d, ride, transfer })
          for (const b of l.blocks) {
            expect(b.from).toBeGreaterThanOrEqual(0)
            expect(b.to).toBeLessThanOrEqual(1)
            expect(b.to).toBeGreaterThan(b.from)
          }
          for (const f of l.flags) {
            expect(f.at).toBeGreaterThanOrEqual(0)
            expect(f.at).toBeLessThanOrEqual(1)
          }
        }
  })
})
