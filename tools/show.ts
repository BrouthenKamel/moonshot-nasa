/**
 * Print the numbers behind a few archetype designs: cost breakdown, mass, volume, delta-v,
 * transfer, coverage, the checks that are not green, and the win rate over SEEDS flights.
 * Usage: npx tsx tools/show.ts
 */
import { computeBudgets } from '../src/sim/budgets'
import { goNoGo } from '../src/sim/checks'
import { runSimulation } from '../src/sim/simulate'
import { buildReport } from '../src/sim/evaluate'
import { archetypes } from '../src/sim/balance'

const seeds = Number(process.env.SEEDS ?? 300)
for (const [name, d] of Object.entries(archetypes)) {
  const b = computeBudgets(d, 'engineer')
  const r = goNoGo(d, b)
  let ok = 0
  let score = 0
  const why: Record<string, number> = {}
  for (let s = 1; s <= seeds; s++) {
    const sim = runSimulation(d, 'engineer', s)
    const rep = buildReport(sim)
    if (rep.outcome === 'success') ok++
    else {
      const k = `${sim.flight.end}${sim.flight.missedRides ? ' (missed ride)' : ''} [${rep.requirements.filter((q) => !q.met).map((q) => q.id).join(',')}]`
      why[k] = (why[k] ?? 0) + 1
    }
    score += rep.score.total
  }
  const notGreen = r.checks.filter((c) => c.status !== 'green').map((c) => `${c.resource}:${c.status}`)
  console.log(
    `${name.padEnd(14)} win ${String(Math.round((ok / seeds) * 100)).padStart(3)}%  score ${Math.round(score / seeds)}  ` +
      `cost ${b.totalCost.toFixed(1)}/${b.spendable.toFixed(1)} (parts ${b.partsCost.toFixed(1)} pre ${b.costPrelaunch.toFixed(1)} ops ${b.operationsCost.toFixed(1)})  ` +
      `mass ${b.totalMass.toFixed(1)}/${b.massLimit}  vol ${b.totalVolume.toFixed(2)}  dv ${b.deltaVAvailable.toFixed(0)} need ${b.deltaVTotal.toFixed(0)}  ` +
      `xfer ${b.transferTurns} ready ${b.readyTurn}/${b.rideTurn}  cov ${b.projectedCoverage.toFixed(0)} data ${b.projectedData.toFixed(0)}  ${notGreen.join(' ')}`
  )
  if (process.env.WHY)
    for (const [k, n] of Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`      ${String(n).padStart(4)} ${k}`)
}
