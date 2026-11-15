import { useEffect, useMemo, useState } from 'react'
import { getOrbitById } from '../../data/orbits'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { computeBudgets } from '../../sim/budgets'
import { firstPassCoverage, firstPassLine, passMix, type FirstPass } from '../../sim/firstPass'
import type { SimState } from '../../sim/types'
import { useGameStore } from '../../state/gameStore'
import { STEP_NAMES } from '../../viz/missionMap'
import { IceMapperGame, type PassOutcome } from './IceMapperGame'
import { autoplay, setupFromDesign, summarize } from './logic'
import { passDue, useIcePassStore } from './passStore'

/**
 * The flight's hand-off to the Ice Mapper (KrabbyKrabby's mini game). On arrival in the science
 * orbit the flight holds: first the capture, then one mapping pass flown with the player's own
 * design, then the line saying what it mapped. The pass sets the first science month's ice map
 * between the autopilot and this design's ceiling (src/sim/firstPass.ts), and that month is flown
 * as soon as the player goes on, so its data comes home and shows; later months fly as before.
 */
export function FirstMappingPass({ sim }: { sim: SimState }) {
  const played = useIcePassStore((s) => s.played)
  const markPlayed = useIcePassStore((s) => s.markPlayed)
  const [stage, setStage] = useState<'arrival' | 'pass'>('arrival')
  const due = passDue(sim)

  // Auto-fly stops at arrival already (a phase change); this makes sure no tick lands during the pass
  useEffect(() => {
    if (due) useGameStore.getState().stopAutoFly()
  }, [due])

  const budgets = useMemo(() => computeBudgets(sim.design, sim.difficulty), [sim.design, sim.difficulty])
  const setup = useMemo(() => setupFromDesign(sim.design), [sim.design])
  // The game's own floor and best, to place the player's pass between the sim's floor and ceiling
  const gameAutopilot = useMemo(() => summarize(autoplay(setup)), [setup])

  if (!due) return null
  const f = sim.flight

  if (stage === 'arrival') {
    return (
      <div role="dialog" aria-modal="true" aria-label="Arrived in lunar orbit" className="fixed inset-0 z-50 flex items-center justify-center bg-ink-0/70 p-4">
        <div className="fp-sheet w-full max-w-md p-5" data-tone="raised">
          <p className="fp-data text-sm text-paper">
            Captured into the science orbit in month {f.captureTurn ?? sim.currentTurn}, {Math.max(0, Math.round(f.dvLeft))} m/s left.
          </p>
          <button type="button" autoFocus onClick={() => setStage('pass')} className="fp-btn-primary mt-4 w-full justify-center py-2">
            Begin first mapping pass
          </button>
        </div>
      </div>
    )
  }

  const toFirstPass = (o: PassOutcome): FirstPass =>
    o.how === 'flown' && o.result ? { how: 'flown', mix: passMix(o.result.mapped, gameAutopilot.mapped, 100 - gameAutopilot.unreachable) } : { how: o.how, mix: 0 }

  return (
    <IceMapperGame
      design={sim.design}
      intro={<DesignRows sim={sim} />}
      skippable={played}
      toBeat={`Autopilot: about ${Math.round(firstPassCoverage(sim.design, budgets, 0))}% of month 1 · your pass can only add to it`}
      lineAfter={(o) => firstPassLine(sim.design, budgets, toFirstPass(o))}
      onDone={(o) => {
        if (o.how === 'flown') markPlayed()
        const firstPass = toFirstPass(o)
        useGameStore.setState((s) => (s.simState ? { simState: { ...s.simState, firstPass } } : {}))
        // The pass is the first science month's observing: fly that month now, so its data comes down
        // and the ice map shows what the pass found, instead of 0% until the player advances
        useGameStore.getState().advanceTurn()
      }}
    />
  )
}

/** What the pass is flown with, each tied to the step that chose it */
function DesignRows({ sim }: { sim: SimState }) {
  const d = sim.design
  const instruments = d.instruments.map((id) => getPartById(id)).filter((p): p is InstrumentPart => p?.category === 'instrument')
  const battery = getPartById(d.battery)
  const orbit = getOrbitById(d.orbit)
  const limited = instruments.filter((i) => i.maxAltitudeKm !== null)
  const lowest = limited.length ? limited.reduce((a, i) => (i.maxAltitudeKm! < a.maxAltitudeKm! ? i : a)) : null
  const short = (name: string) => name.replace(/\s*\(.*\)$/, '')
  const rows: Array<[string, string]> = [
    [instruments.map((i) => short(i.name)).join(' + ') || 'No instrument', STEP_NAMES.instruments],
    [battery ? short(battery.name) : 'No battery', STEP_NAMES.spacecraft],
  ]
  if (orbit && lowest) {
    const ok = orbit.altitude <= lowest.maxAltitudeKm!
    rows.push([`${orbit.altitude} km up · ${short(lowest.name)} ${ok ? 'works below' : 'is blind above'} ${lowest.maxAltitudeKm} km`, STEP_NAMES.orbit])
  }
  return (
    <ul className="mt-3 space-y-1 border-t border-rule pt-2 text-xs">
      {rows.map(([what, step]) => (
        <li key={step} className="flex items-baseline justify-between gap-3">
          <span className="text-paper">{what}</span>
          <span className="fp-label shrink-0 text-[0.6rem] text-paper-faint">{step}</span>
        </li>
      ))}
    </ul>
  )
}
