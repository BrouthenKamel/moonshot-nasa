/**
 * The planning dials on each archetype: win rate by test turns (rows) and reserve (columns).
 * "--" = the plan cannot launch (No-Go). Usage: SEEDS=300 npx tsx tools/dials.ts [archetype...]
 */
import { computeBudgets } from '../src/sim/budgets'
import { goNoGo } from '../src/sim/checks'
import { archetypes, winRate } from '../src/sim/balance'

const seeds = Number(process.env.SEEDS ?? 300)
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(archetypes)
const reserves = [0, 5, 10, 15, 20]
for (const name of names) {
  const base = archetypes[name]
  console.log(`${name}   reserve: ${reserves.map((r) => `${r}%`.padStart(5)).join('')}`)
  for (const t of [0, 1, 2, 3]) {
    const cells = reserves.map((r) => {
      const d = { ...base, planning: { ...base.planning, testTurns: t, reservePercent: r } }
      if (!goNoGo(d, computeBudgets(d, 'engineer')).canGo) return '   --'
      return `${Math.round(winRate(d, seeds) * 100)}%`.padStart(5)
    })
    console.log(`  test ${t}            ${cells.join('')}`)
  }
}
