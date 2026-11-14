/**
 * Full balance run: every hardware design at a set of plans, every viable one flown.
 * Usage: pnpm balance
 *   SEEDS=40      flights per promising design (default 40)
 *   SCREEN=8      flights to screen each viable design first (0 = fly all SEEDS times)
 *   PLANS=all     all 20 plans (test 0-3 x reserve 0/5/10/15/20); default: 8 plans
 *                 (test 0-3 at a 10% reserve, and reserve 0/5/15/20% at 2 test turns)
 * See docs/superpowers/specs/2026-11-14-balance-redesign.md.
 */
import { balanceRun, formatReport, slotOptions } from '../src/sim/balance'

const seeds = Number(process.env.SEEDS ?? 40)
const screenSeeds = Number(process.env.SCREEN ?? 8)
const o = slotOptions()
const plans =
  process.env.PLANS === 'all'
    ? o.testTurns.flatMap((t) => o.reservePercent.map((r) => ({ testTurns: Number(t), reservePercent: Number(r) })))
    : [
        ...[0, 1, 2, 3].map((t) => ({ testTurns: t, reservePercent: 10 })),
        ...[0, 5, 15, 20].map((r) => ({ testTurns: 2, reservePercent: r })),
      ]
const t0 = Date.now()
const r = balanceRun({ plans, seeds, screenSeeds })
console.log(formatReport(r))
console.log(`best design: ${JSON.stringify(r.best.design)}`)
console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`)
