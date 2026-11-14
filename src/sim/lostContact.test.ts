import { describe, it, expect } from 'vitest'
import { initSim, stepTurn, flyUntilDecision, getDefaultAction, isSimComplete } from './simulate'
import { buildReport } from './evaluate'
import { flashlightDesign } from './fixtures'
import { choiceResultText } from '../viz/eventChoice'
import type { SimState } from './types'

/** A flight that stops at the no-signal card, answered with `choice`, then flown to the end */
function lostAfter(choice: 'give-up' | 'recover'): SimState {
  for (let seed = 1; seed <= 3000; seed++) {
    let s = flyUntilDecision(initSim(flashlightDesign, 'engineer', seed), getDefaultAction())
    if (s.pendingDecision?.key !== 'no-signal') continue
    s = stepTurn(s, { ...getDefaultAction(), choices: { 'no-signal': choice } })
    while (!isSimComplete(s)) {
      const p = s.pendingDecision
      s = stepTurn(s, p ? { ...getDefaultAction(), choices: { [p.key]: p.options[0].id } } : getDefaultAction())
    }
    if (s.flight.end === 'lost contact after deployment') return s
  }
  throw new Error(`no seed loses the craft after ${choice}`)
}

const captureCauses = (s: SimState) => buildReport(s).requirements.find((r) => r.id === 'capture')!.causes

describe('a craft lost after deployment (QC #35, #39)', () => {
  it('the report says the player chose to stop searching', () => {
    const causes = captureCauses(lostAfter('give-up'))
    expect(causes).toContain('You chose to stop searching; the craft was lost.')
    expect(causes.join(' ')).not.toContain('Emergency tracking did not find the craft')
  })

  it('the report says tracking failed only when tracking was booked', () => {
    expect(captureCauses(lostAfter('recover'))).toContain('Emergency tracking did not find the craft.')
  })

  it('the replay does not call giving up a failed choice', () => {
    const ev = lostAfter('give-up').allEvents.find((e) => e.eventId === 'no-signal')!
    expect(choiceResultText(ev)).toBe(' (you chose to stop; the craft was lost)')
    const tried = lostAfter('recover').allEvents.find((e) => e.eventId === 'no-signal')!
    expect(choiceResultText(tried)).toBe(' - failed')
  })
})
