/** Best designs that use one option. Usage: npx tsx tools/best.ts <slot> <value> [testTurns] [reserve] */
import { hardwareDesigns, viable, winRate, slotValue, architecture, type Slot } from '../src/sim/balance'
import type { Design } from '../src/sim/types'

const [slot, value] = [process.argv[2] as Slot, process.argv[3]]
const plans = process.argv[4] ? [{ testTurns: Number(process.argv[4]), reservePercent: Number(process.argv[5] ?? 10) }] : [0, 1, 2, 3].flatMap((t) => [0, 5, 10].map((r) => ({ testTurns: t, reservePercent: r })))
const found: { d: Design; r: number }[] = []
for (const plan of plans)
  for (const d of hardwareDesigns(plan)) {
    if (slotValue(d, slot) !== value || !viable(d)) continue
    const r0 = winRate(d, 10)
    if (r0 < 0.4) continue
    found.push({ d, r: winRate(d, 60) })
  }
found.sort((a, b) => b.r - a.r)
console.log(`${found.length} promising`)
for (const { d, r } of found.slice(0, 8))
  console.log(`${Math.round(r * 100)}%  t${d.planning.testTurns} r${d.planning.reservePercent}  ${architecture(d)}  ${d.solar} ${d.battery} ${d.radio} ${d.computer} ${d.attitude} ${d.propulsion} ${d.groundStation} ${d.contactHours}h`)
