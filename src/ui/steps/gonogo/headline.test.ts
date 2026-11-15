import { describe, expect, it } from 'vitest'
import type { CheckResult } from '../../../sim/types'
import { goCall, headline } from './headline'

function chk(p: Partial<CheckResult> & Pick<CheckResult, 'resource' | 'status'>): CheckResult {
  const value = p.value ?? 0
  const limit = p.limit ?? 0
  return { unit: 'W', reason: 'because', margin: limit - value, value, limit, ...p }
}

const result = (checks: CheckResult[]) => ({ canGo: checks.every((c) => c.status !== 'red'), checks })

describe('headline: honest caution wording', () => {
  it('says how far over the limit a caution check is', () => {
    expect(headline(chk({ resource: 'Power', status: 'yellow', value: 62, limit: 42, unit: 'W' }))).toBe('Power: 20 W over the limit')
  })
  it('says how little is left when under the limit', () => {
    expect(headline(chk({ resource: 'Mass', status: 'yellow', value: 13.4, limit: 14, unit: 'kg' }))).toBe('Mass: only 0.6 kg to spare')
    expect(headline(chk({ resource: 'Time', status: 'yellow', value: 9, limit: 9, unit: 'month' }))).toBe('Time: only 0 months to spare')
  })
  it('words budget, science, comms and red checks', () => {
    expect(headline(chk({ resource: 'Budget', status: 'red', value: 27, limit: 25, unit: '$M' }))).toBe('Budget: 2 M over the limit')
    expect(headline(chk({ resource: 'Budget', status: 'red', value: 21.3, limit: 25, unit: '$M' }))).toBe('Budget: more than you can spend')
    expect(headline(chk({ resource: 'Propulsion', status: 'red', value: 100, limit: 200, unit: 'm/s' }))).toBe('Propulsion: blocked')
    expect(headline(chk({ resource: 'Science', status: 'yellow', value: 40, limit: 70, margin: -30, unit: '% ice' }))).toBe('Science: 40% of the 70% ice target')
    expect(headline(chk({ resource: 'Science', status: 'yellow', value: 80, limit: 70, margin: 10, unit: '% ice' }))).toBe('Science: short of the data target')
    expect(headline(chk({ resource: 'Comms', status: 'yellow', value: 8, limit: 8, unit: 'kbps' }))).toBe('Comms: the radio cannot use the whole pass')
    expect(headline(chk({ resource: 'Comms', status: 'red', value: 0, limit: 0, unit: 'kbps' }))).toBe('Comms: no link home')
    expect(headline(chk({ resource: 'Mass', status: 'green', value: 10, limit: 14, unit: 'kg' }))).toBe('Mass: OK')
    expect(headline(chk({ resource: 'Months', status: 'yellow', value: 10, limit: 9, unit: 'month' }))).toBe('Months: 1 month over the limit')
  })
})

describe('goCall: the overall wording', () => {
  const ok = chk({ resource: 'Mass', status: 'green', value: 10, limit: 14, unit: 'kg' })
  const over = chk({ resource: 'Power', status: 'yellow', value: 62, limit: 42, unit: 'W' })
  const tight = chk({ resource: 'Mass', status: 'yellow', value: 13.4, limit: 14, unit: 'kg' })
  const science = chk({ resource: 'Science', status: 'yellow', value: 40, limit: 70, margin: -30, unit: '% ice' })
  const red = chk({ resource: 'Budget', status: 'red', value: 27, limit: 25, unit: '$M' })

  it('is plain GO only when every check is green', () => {
    expect(goCall(result([ok]))).toEqual({ label: 'GO', reason: null })
  })
  it('names an over-limit row with its reason, ahead of other cautions', () => {
    expect(goCall(result([ok, tight, science, over]))).toEqual({ label: 'GO, OVER A LIMIT', reason: 'Power: 20 W over the limit' })
  })
  it('says below target when science is short and nothing is over', () => {
    expect(goCall(result([ok, tight, science])).label).toBe('GO, BELOW TARGET')
  })
  it('falls back to GO WITH CAUTION', () => {
    expect(goCall(result([ok, tight]))).toEqual({ label: 'GO WITH CAUTION', reason: 'Mass: only 0.6 kg to spare' })
  })
  it('stays NO-GO when a row is red', () => {
    expect(goCall(result([ok, over, red])).label).toBe('NO-GO')
  })
})
