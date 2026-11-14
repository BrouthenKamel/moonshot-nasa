/**
 * Headline balance metrics for the reference designs: single changes that still fly, and the
 * dials (test turns, reserve). Usage: npx tsx tools/metrics.ts [model root, default: this repo]
 * Pointing it at a copy of an older src/ (with src/sim/balance.ts copied in) gives before/after numbers.
 */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const bal = await import(pathToFileURL(`${root}/src/sim/balance.ts`).href)
const { computeBudgets } = await import(pathToFileURL(`${root}/src/sim/budgets.ts`).href)
const { goNoGo } = await import(pathToFileURL(`${root}/src/sim/checks.ts`).href)
const seeds = Number(process.env.SEEDS ?? 400)

for (const name of ['flashlight', 'lunahMap']) {
  const d = bal.archetypes[name]
  const sc = bal.singleChangeGo(d)
  console.log(`${name}: ${sc.go} of ${sc.total} single changes still fly (${sc.total - sc.go} No-Go)`)
  const cell = (t: number, r: number) => {
    const x = { ...d, planning: { ...d.planning, testTurns: t, reservePercent: r } }
    return goNoGo(x, computeBudgets(x, 'engineer')).canGo ? `${Math.round(bal.winRate(x, seeds) * 100)}%` : 'No-Go'
  }
  console.log(`  test 0/1/2/3 at its reserve ${d.planning.reservePercent}%: ${[0, 1, 2, 3].map((t) => cell(t, d.planning.reservePercent)).join(' / ')}`)
  console.log(`  reserve 0/5/10/15/20% at its ${d.planning.testTurns} test turns: ${[0, 5, 10, 15, 20].map((r) => cell(d.planning.testTurns, r)).join(' / ')}`)
}
