import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { computeBudgets, createDefaultDesign } from '../sim/budgets'
import { deltaVNeed, goNoGo } from '../sim/checks'
import { archetypes, flashlightDesign } from '../sim/fixtures'
import { ION_MIN_DAYS, TRANSFER_MAX_DAYS, TRANSFER_MIN_DAYS, getTransferById, ionCanBrake, timedTransfer, timedTransferId } from '../data/transfers'
import { buildBayView } from './spacecraft/bayView'
import { minDaysFor, transferPlan } from './ride/transferPlan'
import { budgetLeft, deltaVNeedText, moneyLeft, tripTime } from './numbers'
import type { Design } from '../sim/types'

/** QC batch 4 (16 Nov): numbers that two screens show must agree. One test per pair. */

const ion: Design = createDefaultDesign() // ion engine
const chemical: Design = flashlightDesign

describe('1. one trip-time figure', () => {
  it('the Trip headline and the rows read the sim’s own trip time', () => {
    for (const d of [ion, chemical, ...Object.values(archetypes)]) {
      const b = computeBudgets(d, 'engineer')
      expect(transferPlan(d, 'engineer').trip).toBe(tripTime(b))
    }
  })

  it('a direct shot shows its real days; under 2 months shows days, from 2 on months', () => {
    const direct = computeBudgets({ ...chemical, transfer: 'transfer-direct' }, 'engineer')
    expect(direct.transferTurns).toBe(0)
    expect(tripTime(direct)).toBe(`${getTransferById('transfer-direct')!.days} days`)
    expect(tripTime({ transferTurns: 0, transferDays: 7 })).toBe('7 days')
    expect(tripTime({ transferTurns: 1, transferDays: 30 })).toBe('30 days')
    expect(tripTime({ transferTurns: 4, transferDays: 120 })).toBe('4 months')
    expect(tripTime({ transferTurns: null, transferDays: null })).toBe('no way to the Moon')
  })

  it('no screen hardcodes "about 5 days" any more', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && /about 5 days|'5 days'|About 5 days/.test(readFileSync(p, 'utf8'))) hits.push(p)
      }
    }
    walk(join(__dirname, '..'))
    expect(hits).toEqual([])
  })
})

describe('2. one ion-engine rule', () => {
  it('the slider minimum is exactly where the sim starts to capture', () => {
    expect(minDaysFor(ion)).toBe(ION_MIN_DAYS)
    for (let d = TRANSFER_MIN_DAYS; d <= TRANSFER_MAX_DAYS; d++) {
      const design = { ...ion, transfer: timedTransferId(d) }
      const b = computeBudgets(design, 'engineer')
      const slow = d >= ION_MIN_DAYS
      expect(ionCanBrake(timedTransfer(d)), `day ${d}`).toBe(slow)
      // The sim refuses capture exactly where the UI says "cannot brake"
      expect(b.captureDeltaV !== null, `capture at ${d} days`).toBe(slow)
      // and the Go/No-Go check says "too weak to brake" exactly there too
      const dv = goNoGo(design, b).checks.find((c) => c.resource === 'Delta-v')!
      expect(/too weak to brake/.test(dv.reason), `check at ${d} days`).toBe(!slow)
    }
  })
})

describe('3. "needs" says what it includes', () => {
  it('the Craft line shows capture + station-keeping = the Delta-v check’s figure', () => {
    for (const d of [ion, chemical]) {
      const b = computeBudgets(d, 'engineer')
      const checks = goNoGo(d, b).checks
      const dv = checks.find((c) => c.resource === 'Delta-v')!
      const n = deltaVNeed(b)
      expect(n.total).toBeCloseTo(dv.value, 6)
      const text = deltaVNeedText(b)
      expect(text).toBe(`capture ${Math.round(n.capture)} + station-keeping ${Math.round(n.keeping)} = ${Math.round(n.total)} m/s`)
      const craftLine = buildBayView(d, b, checks).rows.find((r) => r.key === 'deltav')!
      if (b.captureDeltaV !== null && b.deltaVAvailable > 0) expect(craftLine.text).toContain(`needs ${text}`)
    }
  })
})

describe('4. one budget base', () => {
  it('"Budget left" uses spendable, like the Budget check; negatives read "−$1.5M"', () => {
    const b = computeBudgets(chemical, 'engineer')
    expect(budgetLeft(b)).toBeCloseTo(b.spendable - b.totalCost, 9)
    expect(moneyLeft(-1.5)).toBe('−$1.5M')
    expect(moneyLeft(2)).toBe('$2.0M')
    const over = { ...b, totalCost: b.budgetCap + 2 }
    const reason = goNoGo(chemical, over).checks.find((c) => c.resource === 'Budget')!.reason
    expect(reason).toContain('spendable')
    const tight = { ...b, totalCost: b.spendable + 0.5 }
    expect(goNoGo(chemical, tight).checks.find((c) => c.resource === 'Budget')!.reason).toContain('spendable')
  })
})
