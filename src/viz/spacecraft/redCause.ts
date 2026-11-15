import type { BoardRow, RowKey } from './bayView'

/** The stamp's word for a red row, in two or three words */
export const RED_WORD: Record<RowKey, string> = {
  mass: 'Too heavy',
  volume: 'Does not fit',
  power: 'Not enough power',
  money: 'Over budget',
  deltav: 'Cannot reach',
  time: 'Not ready in time',
}

/** "about 560": braking figures rounded to tens, so the sentence reads, not computes */
const about = (x: number) => `about ${Math.max(10, Math.round(x / 10) * 10)}`
const kg = (x: number) => `${x.toFixed(1)} kg`
const money = (x: number) => `$${x.toFixed(1)}M`

/** The first sentence of the check's own reason, for causes the numbers alone cannot tell */
function firstSentence(reason: string): string {
  const s = reason.trim()
  const end = s.search(/[.!?](\s|$)/)
  return (end >= 0 ? s.slice(0, end) : s).replace(/[.!?]$/, '')
}

/**
 * One plain sentence under a red "Does it fly?" stamp, naming the cause with the real numbers:
 * "Cannot reach: this engine has about 50 m/s of braking; the trip to the Moon needs about 560."
 * Each row carries what its bar draws (value against limit). Where those do not show the cause
 * (no engine, the wrong ride for it, too little power for an ion engine), the check's own first
 * sentence does.
 */
export function redCause(row: BoardRow): string {
  const word = RED_WORD[row.key]
  const short = row.value > row.limit && row.limit > 0
  const say = (cause: string) => `${word}: ${cause}.`
  // An ion engine starved of power: both numbers are in the check's reason
  const ion = row.key === 'deltav' ? /ion engine needs (\d+) W[\s\S]*?(\d+) W are left for the engine/.exec(row.reason) : null
  if (ion) return say(`the ion engine needs ${ion[1]} W to thrust; the panels leave it ${ion[2]} W`)
  if (short) {
    switch (row.key) {
      case 'mass':
        return say(`the craft weighs ${kg(row.value)}; the ride takes at most ${kg(row.limit)}`)
      case 'volume':
        return say(`the parts fill ${row.value.toFixed(1)} U of the ${row.limit.toFixed(0)} U box`)
      case 'power':
        return say(`the craft draws ${Math.round(row.value)} W; the panels make ${Math.round(row.limit)} W`)
      case 'money':
        return say(`the craft costs ${money(row.value)}; the budget is ${money(row.limit)}`)
      case 'deltav':
        return say(`this engine has ${about(row.limit)} m/s of braking; the trip to the Moon needs ${about(row.value)}`)
      case 'time':
        return say(`the craft is ready in month ${Math.round(row.value)}; the ride leaves in month ${Math.round(row.limit)}`)
    }
  }
  const reason = firstSentence(row.reason)
  return reason ? say(reason.charAt(0).toLowerCase() + reason.slice(1)) : say(row.text)
}
