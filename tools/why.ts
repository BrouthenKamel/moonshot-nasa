/**
 * Why does an option never win? For every option, over every hardware design that uses it
 * (at one plan), count the designs that fly with a green Science bar and, for the others,
 * which checks stop them. Usage: npx tsx tools/why.ts [testTurns] [reservePercent]
 */
import { hardwareDesigns, slotValue, type Slot } from '../src/sim/balance'
import { computeBudgets } from '../src/sim/budgets'
import { goNoGo } from '../src/sim/checks'

const plan = { testTurns: Number(process.argv[2] ?? 1), reservePercent: Number(process.argv[3] ?? 10) }
const slots: Slot[] = ['instruments', 'solar', 'battery', 'radio', 'computer', 'attitude', 'propulsion', 'orbit', 'ride', 'transfer', 'groundStation']
const stats: Record<string, { n: number; ok: number; only: Record<string, number> }> = {}
for (const d of hardwareDesigns(plan)) {
  const r = goNoGo(d, computeBudgets(d, 'engineer'))
  const bad = r.checks.filter((c) => c.status === 'red' || (c.resource === 'Science' && c.status !== 'green')).map((c) => c.resource)
  for (const s of slots) {
    const k = `${s}=${slotValue(d, s)}`
    const st = (stats[k] ??= { n: 0, ok: 0, only: {} })
    st.n++
    if (bad.length === 0) st.ok++
    // designs stopped by exactly one check: the one thing to fix
    if (bad.length === 1) st.only[bad[0]] = (st.only[bad[0]] ?? 0) + 1
  }
}
for (const [k, v] of Object.entries(stats)) {
  const only = Object.entries(v.only).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}:${n}`).join(' ')
  console.log(`${k.padEnd(44)} ok ${String(v.ok).padStart(6)}  single-blocker ${only}`)
}
