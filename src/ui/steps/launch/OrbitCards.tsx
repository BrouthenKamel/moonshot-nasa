import { useRef } from 'react'
import { lunarOrbits } from '../../../data/orbits'
import { coverageAt, COVERAGE_GOAL, MISSION_MONTHS, type OrbitOption } from '../../../viz/orbit/orbitView'
import type { ChoiceStat } from '../../kit/ChoiceCard'
import { LaunchCard } from './LaunchCard'
import { radioKeys } from './radioKeys'

/**
 * The three science orbits as painted cards in their orbit colours (violet halo, lime elliptical,
 * sky-blue low circular). Every number comes from buildOrbitView (computeBudgets / goNoGo on a
 * trial design per orbit). Orbits are never locked: an orbit the craft cannot reach can still be
 * picked, and its plaque says what goes wrong (the lesson the Go / No-Go bars then show).
 */

const flownBy = (id: string) => lunarOrbits.find((o) => o.id === id)?.flownBy

function stats(o: OrbitOption, full: boolean): ChoiceStat[] {
  const ice12 = Math.round(coverageAt(o, MISSION_MONTHS))
  const tooHigh = o.iceInstruments.length > 0 && !o.iceInRange
  const out: ChoiceStat[] = [
    { label: full ? 'Over the pole' : 'Height', value: `${o.altitudeKm} km`, tone: tooHigh ? 'bad' : o.iceInRange ? 'good' : undefined },
    { label: full ? 'Passes a month' : 'Passes', value: full ? `${o.passesPerTurn}` : `${o.passesPerTurn}/month` },
    { label: full ? 'Ice in 12 months' : 'Ice mapped', value: `${ice12}%`, tone: ice12 >= COVERAGE_GOAL ? 'good' : o.iceInstruments.length ? 'bad' : undefined },
    {
      label: full ? 'To capture' : 'Capture',
      value: o.captureDeltaV === null ? 'not possible' : `${Math.round(o.captureDeltaV).toLocaleString('en-US')} m/s`,
      tone: o.reachable ? undefined : 'bad',
    },
  ]
  if (full)
    out.push(
      { label: 'Upkeep', value: `${o.holdDeltaV} m/s/month` },
      { label: 'Earth in view', value: `${o.earthPct}%` },
      { label: 'Sunlit · eclipse', value: `${o.sunlitPct}% · ${o.eclipseHours} h`, tone: o.batteryOk ? undefined : 'bad' },
      {
        label: 'Ice a month',
        value: o.iceInstruments.length ? `${(o.bestIceRate * 100).toFixed(1)}% of what is left` : 'none sees shadow',
        tone: o.bestIceRate > 0.09 ? 'good' : 'bad',
      },
    )
  return out
}

export function OrbitCardTray({
  options,
  selectedId,
  onPick,
  size = 'xs',
  full = false,
  columns = 3,
}: {
  options: OrbitOption[]
  selectedId: string
  /** fromKeyboard: the card did not play its pick sound itself */
  onPick: (id: string, fromKeyboard: boolean) => void
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** The plain screen shows every number of the orbit on its card */
  full?: boolean
  columns?: number
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const keys = radioKeys(options, selectedId, () => true, onPick, refs)
  return (
    <div role="radiogroup" aria-label="Science orbit" className="grid items-end gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o, i) => (
        <LaunchCard
          key={o.id}
          id={o.id}
          title={o.shortName}
          subtitle={full ? `Flown by ${flownBy(o.id)}` : undefined}
          tag={flownBy(o.id)?.replace(' (planned)', ', planned')}
          stats={stats(o, full)}
          plaque={{ tone: o.verdict.tone, text: o.verdict.text }}
          size={size}
          selected={o.id === selectedId}
          onPick={() => onPick(o.id, false)}
          radio
          tabIndex={keys.tabIndex(o.id)}
          buttonRef={keys.ref(i)}
          onKeyDown={keys.onKeyDown(i)}
        />
      ))}
    </div>
  )
}
