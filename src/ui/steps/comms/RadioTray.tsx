import { useState } from 'react'
import { ChoiceCard, type ChoiceStat } from '../../kit/ChoiceCard'
import { choiceArt } from '../../../assets/catalogueArt'
import { radios, getPartById, type RadioPart, type AttitudePart } from '../../../data/parts'
import { computeBudgets } from '../../../sim/budgets'
import type { Budgets, Design } from '../../../sim/types'
import type { Difficulty } from '../../../data/brief'
import { Inspector, type InspectorNote } from './Inspector'
import { hoverSound, useCardRadioGroup } from './useCardRadioGroup'

const TAG: Record<string, string> = {
  'radio-uhf': 'Low orbit',
  'radio-sband': 'JPL Iris',
  'radio-xband': 'Iris + dish',
}

/** Warnings for a radio in this design: the radio's own limits plus what the what-if budgets say */
function notesFor(radio: RadioPart, design: Design, whatIf: Budgets): InspectorNote[] {
  const notes: InspectorNote[] = []
  if (!radio.reachesMoon) notes.push({ tone: 'bad', text: 'Does not reach Earth from the Moon: it works only in low Earth orbit.' })
  if (radio.needsPrecisePointing) {
    const attitude = getPartById(design.attitude) as AttitudePart | undefined
    if (attitude?.precise) notes.push({ tone: 'info', text: `Needs precise pointing: the ${attitude.name} gives it · chosen at the Factory` })
    else
      notes.push({
        tone: 'warn',
        text: `Needs precise pointing: with the ${attitude?.name ?? 'current attitude control'} (chosen at the Factory) its gain drops to x${radio.gain * radio.gainWithoutPrecisePointing}.`,
      })
  }
  if (radio.deployable) notes.push({ tone: 'info', text: 'Deployable dish: unfolds after launch.' })
  if (whatIf.volumeMargin < 0) notes.push({ tone: 'bad', text: `Does not fit: ${(-whatIf.volumeMargin).toFixed(1)} U over the craft's volume.` })
  if (whatIf.massMargin < 0) notes.push({ tone: 'bad', text: `Too heavy: ${(-whatIf.massMargin).toFixed(1)} kg over the limit.` })
  if (whatIf.budgetMargin < 0) notes.push({ tone: 'bad', text: `Over budget by $${(-whatIf.budgetMargin).toFixed(1)}M.` })
  return notes
}

/** The spacecraft radio, as a tray of portrait cards (the hardware itself) */
export function RadioTray({
  design,
  difficulty,
  onPick,
}: {
  design: Design
  difficulty: Difficulty
  onPick: (id: string) => void
}) {
  const [inspect, setInspect] = useState<string | null>(null)
  const group = useCardRadioGroup(
    radios.map((r) => r.id),
    design.radio,
    onPick,
  )

  const rows = radios.map((radio) => {
    const whatIf = computeBudgets({ ...design, radio: radio.id }, difficulty)
    return { radio, whatIf, notes: notesFor(radio, design, whatIf) }
  })
  const shown = rows.find((r) => r.radio.id === (inspect ?? design.radio)) ?? rows[0]

  return (
    <section aria-labelledby="radio-tray-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="radio-tray-title" className="font-display text-xl font-bold text-white">
          Spacecraft radio
        </h2>
        <span className="text-xs text-slate-500">Arrow keys to switch</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="radio-tray-title"
        className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-5"
        onPointerLeave={() => setInspect(null)}
      >
        {rows.map(({ radio, whatIf, notes }, i) => {
          const selected = design.radio === radio.id
          const stats: ChoiceStat[] = [
            { label: 'Moon', value: radio.reachesMoon ? 'Reaches' : 'No reach', tone: radio.reachesMoon ? 'good' : 'bad' },
            { label: 'Link', value: whatIf.linkKbps > 0 ? `${whatIf.linkKbps} kbps` : 'none', tone: whatIf.linkKbps > 0 ? undefined : 'bad' },
            { label: 'Mass', value: `${radio.mass} kg` },
            { label: 'Power', value: `${radio.listenPower} / ${radio.transmitPower} W` },
            { label: 'Cost', value: `$${radio.cost}M` },
            { label: 'Size', value: `${radio.volume} U` },
          ]
          const worst = notes.find((n) => n.tone === 'bad') ?? notes.find((n) => n.tone === 'warn')
          return (
            <div key={radio.id} className="flex min-w-0 flex-col gap-2 [&>button]:w-full">
              <ChoiceCard
                id={radio.id}
                title={radio.name}
                subtitle={radio.description}
                tag={TAG[radio.id]}
                stats={stats}
                selected={selected}
                look="portrait"
                size="lg"
                onHover={() => {
                  hoverSound()
                  setInspect(radio.id)
                }}
                onFocus={() => setInspect(radio.id)}
                ariaLabel={`${radio.name}. ${stats.map((s) => `${s.label} ${s.value}`).join(', ')}.${worst ? ` ${worst.text}` : ''}`}
                {...group(i)}
              />
              {worst && (
                <div
                  aria-hidden="true"
                  className={`rounded-lg border px-2 py-1 text-[11px] leading-snug ${
                    worst.tone === 'bad' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  }`}
                >
                  {worst.tone === 'bad' ? '✕ ' : '! '}
                  {worst.text}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Inspector
        accent={choiceArt(shown.radio.id)?.accent ?? '#38bdf8'}
        kicker={shown.radio.id === design.radio ? 'Fitted radio' : 'If you fit this radio'}
        title={shown.radio.name}
        description={shown.radio.description}
        figures={[
          { label: 'Sends home', value: `${shown.whatIf.downlinkPerTurn.toFixed(0)} MB/month`, tone: shown.whatIf.dataMarginPerTurn >= 0 ? 'good' : 'bad' },
          { label: 'Link', value: `${shown.whatIf.linkKbps} kbps` },
          { label: 'Listen / transmit', value: `${shown.radio.listenPower} / ${shown.radio.transmitPower} W` },
          { label: 'Antenna gain', value: `x${shown.radio.gain}` },
        ]}
        notes={shown.notes}
      />
    </section>
  )
}
