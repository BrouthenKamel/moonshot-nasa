import { useState } from 'react'
import { ChoiceCard, type ChoiceStat } from '../../kit/ChoiceCard'
import { choiceArt } from '../../../assets/catalogueArt'
import { assetUrl } from '../../../assets/url'
import { groundStations, type GroundStation } from '../../../data/ground'
import { getPartById, type RadioPart } from '../../../data/parts'
import { computeBudgets } from '../../../sim/budgets'
import type { Design } from '../../../sim/types'
import type { Difficulty } from '../../../data/brief'
import { Inspector, type InspectorNote } from './Inspector'
import { hoverSound, useCardRadioGroup } from './useCardRadioGroup'
import { hoursAfterSwitch } from './hours'

const TAG: Record<string, string> = {
  'ground-small': 'University',
  'ground-medium': 'Lunar IceCube',
  'ground-dsn': 'NASA DSN',
}

/** The dish's 3D portrait as an inset over the painted card */
function DishInset({ id }: { id: string }) {
  const portrait = choiceArt(id)?.portrait
  const [failed, setFailed] = useState(false)
  if (!portrait || failed) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[16/10] transition-transform duration-200 ease-out group-hover/station:-translate-y-1 motion-reduce:transition-none" aria-hidden="true">
      <div className="absolute bottom-2 right-2 h-[46%] aspect-square rounded-xl border border-white/20 bg-[#0a0f1e]/80 shadow-lg backdrop-blur-sm">
        <img src={assetUrl(portrait)} alt="" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-contain p-1" />
      </div>
    </div>
  )
}

/** The ground station, as painted scene cards with the dish itself in the corner */
export function StationTray({
  design,
  difficulty,
  onPick,
}: {
  design: Design
  difficulty: Difficulty
  onPick: (station: GroundStation) => void
}) {
  const [inspect, setInspect] = useState<string | null>(null)
  const pickById = (id: string) => {
    const s = groundStations.find((g) => g.id === id)
    if (s) onPick(s)
  }
  const group = useCardRadioGroup(
    groundStations.map((g) => g.id),
    design.groundStation,
    pickById,
  )
  const radio = getPartById(design.radio) as RadioPart | undefined

  const rows = groundStations.map((station) => {
    const whatIf = computeBudgets({ ...design, groundStation: station.id, contactHours: hoursAfterSwitch(design, station) }, difficulty)
    const notes: InspectorNote[] = []
    if (radio && !radio.reachesMoon) notes.push({ tone: 'bad', text: `No dish hears the ${radio.name} from the Moon: choose a deep-space radio first.` })
    if (whatIf.budgetMargin < 0) notes.push({ tone: 'bad', text: `Over budget by $${(-whatIf.budgetMargin).toFixed(1)}M.` })
    if (station.contactHoursPerDay <= 1) notes.push({ tone: 'info', text: `Oversubscribed: ${station.contactHoursPerDay} h a day at most.` })
    return { station, whatIf, notes }
  })
  const shown = rows.find((r) => r.station.id === (inspect ?? design.groundStation)) ?? rows[0]

  return (
    <section aria-labelledby="station-tray-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="station-tray-title" className="font-display text-xl font-bold text-white">
          Ground station
        </h2>
        <span className="text-xs text-slate-500">Rates are with the patch antenna from the Moon</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="station-tray-title"
        className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-5"
        onPointerLeave={() => setInspect(null)}
      >
        {rows.map(({ station, whatIf }, i) => {
          // The radio's reach is shown on the radio cards; under a dish, only what this dish changes
          const overBudget = whatIf.budgetMargin < 0 ? `Over budget by $${(-whatIf.budgetMargin).toFixed(1)}M.` : null
          const stats: ChoiceStat[] = [
            { label: 'Rate', value: `${station.rateKbps} kbps` },
            { label: 'Up to', value: `${station.contactHoursPerDay} h/day` },
            { label: 'Price', value: `$${station.pricePerHour}M per h/day` },
            { label: 'Outage', value: `${Math.round(station.outageChance * 100)}% a month` },
          ]
          return (
            <div key={station.id} className="group/station relative flex min-w-0 flex-col gap-2 [&>button]:w-full">
              <ChoiceCard
                id={station.id}
                title={station.name}
                subtitle={station.description}
                tag={TAG[station.id]}
                stats={stats}
                selected={design.groundStation === station.id}
                look="scene"
                size="lg"
                onHover={() => {
                  hoverSound()
                  setInspect(station.id)
                }}
                onFocus={() => setInspect(station.id)}
                ariaLabel={`${station.name}. ${stats.map((s) => `${s.label} ${s.value}`).join(', ')}.${overBudget ? ` ${overBudget}` : ''}`}
                {...group(i)}
              />
              <DishInset id={station.id} />
              {overBudget && (
                <div aria-hidden="true" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] leading-snug text-rose-200">
                  ✕ {overBudget}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Inspector
        accent={choiceArt(shown.station.id)?.accent ?? '#3b82f6'}
        kicker={shown.station.id === design.groundStation ? 'Booked station' : 'If you book this station'}
        title={shown.station.name}
        description={shown.station.description}
        figures={[
          { label: 'Sends home', value: `${shown.whatIf.downlinkPerTurn.toFixed(0)} MB/month`, tone: shown.whatIf.dataMarginPerTurn >= 0 ? 'good' : 'bad' },
          { label: 'Link', value: `${shown.whatIf.linkKbps} kbps` },
          { label: 'Booked', value: `${shown.whatIf.contactHours} h a day` },
          { label: 'Ground time', value: `$${shown.whatIf.groundCostPerTurn.toFixed(2)}M a month` },
        ]}
        notes={shown.notes}
      />
    </section>
  )
}
