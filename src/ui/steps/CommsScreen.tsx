import { useEffect } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { useDesignPreview } from '../useDesignPreview'
import { getPartById, radios, type AttitudePart, type RadioPart } from '../../data/parts'
import { getGroundStationById, groundStations, type GroundStation } from '../../data/ground'
import { computeBudgets } from '../../sim/budgets'
import type { Budgets, Design } from '../../sim/types'

type DesignPatch = Partial<Design>
import { hoursAfterSwitch } from './comms/hours'
import { PickRow, PickTile, SignalPath, type PickTone } from './comms/CommsPick'
import { PlanChecks, PlanHeadline, PlanMeter, PlanNav, PlanOdds, PlanPanel, PlanRow, PlanRows } from './plan/PlanPanel'

/*
 * Step 07 · Communications: how the data gets home, on one screen. On the left the signal path
 * and two rows of choices (the radio on the craft, the dish on Earth), each saying how much data
 * it would bring home; on the right one dashboard with the figures and the dish time booked.
 * Hovering a choice previews it on the dashboard. Every number is from computeBudgets / goNoGo;
 * the step writes only radio, groundStation and contactHours.
 */

const RADIO_TAG: Record<string, string> = { 'radio-uhf': 'Low orbit', 'radio-sband': 'JPL Iris', 'radio-xband': 'Iris + dish' }
const STATION_TAG: Record<string, string> = { 'ground-small': 'University', 'ground-medium': 'Lunar IceCube', 'ground-dsn': 'NASA DSN' }

const mb = (n: number) => `${Math.round(n).toLocaleString('en-US')} MB/month`
const money = (m: number) => (m < 0.1 ? `$${Math.round(m * 1000)}k` : `$${m.toFixed(2)}M`)

/** Green when everything the instruments make gets home, yellow when part of it, red when nothing */
function homeTone(b: Budgets): PickTone {
  if (b.downlinkPerTurn <= 0) return 'red'
  return b.dataMarginPerTurn >= 0 ? 'green' : 'yellow'
}

/** The one thing to know about a radio in this design, if anything */
function radioNote(radio: RadioPart, design: Design, b: Budgets): { text: string; tone: PickTone } | undefined {
  if (!radio.reachesMoon) return { text: 'Does not reach Earth from the Moon', tone: 'red' }
  if (b.volumeMargin < 0) return { text: `Does not fit: ${(-b.volumeMargin).toFixed(1)} U over`, tone: 'red' }
  if (b.massMargin < 0) return { text: `Too heavy: ${(-b.massMargin).toFixed(1)} kg over`, tone: 'red' }
  if (b.budgetMargin < 0) return { text: `Over budget by $${(-b.budgetMargin).toFixed(1)}M`, tone: 'red' }
  if (radio.needsPrecisePointing) {
    const attitude = getPartById(design.attitude) as AttitudePart | undefined
    if (!attitude?.precise) return { text: 'Needs precise pointing (Factory)', tone: 'yellow' }
  }
  return undefined
}

/** A dish's note, in words only: the tile's one number is its data home (the hours limit is on hover) */
function stationNote(s: GroundStation): { text: string; tone?: PickTone } {
  const outages = s.outageChance >= 0.08 ? 'often' : s.outageChance >= 0.04 ? 'sometimes' : 'rarely'
  return { text: `Outages ${outages}`, tone: s.outageChance >= 0.08 ? 'yellow' : undefined }
}

/** What a dish tile keeps off its face, for the hover: "64 kbps · $30k a month · up to 2 h a day" */
function stationDetail(s: GroundStation, costPerMonth: number): string {
  return `${s.rateKbps} kbps · ${money(costPerMonth)} a month · up to ${s.contactHoursPerDay} h a day`
}

/** Dish time booked a day: a slider inside the dashboard */
function ContactTime({ hours, maxHours, onChange }: { hours: number; maxHours: number; onChange: (h: number) => void }) {
  const min = 0.25
  return (
    <div className="bg-ink-1 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="contact-hours" className="truncate text-[0.64rem] uppercase tracking-wider text-paper-faint">
          Dish time booked
        </label>
        <span className="fp-data text-[0.86rem] text-paper">{hours} h a day</span>
      </div>
      <input
        id="contact-hours"
        type="range"
        min={min}
        max={maxHours}
        step={0.25}
        value={hours}
        disabled={maxHours <= min}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${hours} hours a day`}
        className="mt-1 w-full accent-[var(--color-kapton)]"
      />
      <div className="flex justify-between fp-data text-[0.6rem] text-paper-faint">
        <span>{min} h</span>
        <span>more hours, more data and cost</span>
        <span>{maxHours} h</span>
      </div>
    </div>
  )
}

export function CommsScreen() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const setPreviewPatch = useUiStore((s) => s.setPreviewPatch)
  const { budgets, checks, previewBudgets, previewChecks, previewPatch } = useDesignPreview()
  const b = previewBudgets ?? budgets
  const shownChecks = (previewChecks ?? checks).checks

  useEffect(() => () => setPreviewPatch(null), [setPreviewPatch])

  const radioId = previewPatch?.radio ?? design.radio
  const stationId = previewPatch?.groundStation ?? design.groundStation
  const radio = getPartById(radioId) as RadioPart | undefined
  const station = getGroundStationById(stationId)
  const stationPatch = (s: GroundStation): DesignPatch => ({ groundStation: s.id, contactHours: hoursAfterSwitch(design, s) })
  const preview = (patch: DesignPatch) => (on: boolean) => setPreviewPatch(on ? patch : null)

  const tone = homeTone(b)
  const share = b.dataPerTurn > 0 ? Math.min(100, (b.downlinkPerTurn / b.dataPerTurn) * 100) : 100
  const line =
    b.downlinkPerTurn <= 0
      ? 'Nothing gets home: the ice map stays on board.'
      : b.dataMarginPerTurn >= 0
        ? `All ${Math.round(b.dataPerTurn)} MB the instruments make each month gets home.`
        : `The instruments make ${Math.round(b.dataPerTurn)} MB a month: ${Math.round(-b.dataMarginPerTurn)} MB stay on board.`
  const statusOf = (resource: string) => shownChecks.find((c) => c.resource === resource)
  const commsChecks = ['Comms', 'Data Link']
    .map(statusOf)
    .filter((c) => c !== undefined)
    .map((c) => ({ label: c.resource, status: c.status, reason: c.reason }))

  return (
    <div className="flex h-full min-h-[560px] gap-4 overflow-hidden p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <SignalPath
          radioId={radioId}
          radioName={radio?.name ?? 'No radio'}
          stationId={stationId}
          stationName={station?.name ?? 'No dish'}
          kbps={b.linkKbps}
          hours={b.contactHours}
          tone={tone}
        />

        <PickRow title="Radio on the spacecraft" hint="Each card: data it would bring home">
          {radios.map((r) => {
            const whatIf = computeBudgets({ ...design, radio: r.id }, difficulty)
            const note = radioNote(r, design, whatIf)
            return (
              <PickTile
                key={r.id}
                id={r.id}
                tag={RADIO_TAG[r.id] ?? 'Radio'}
                name={r.name}
                figure={whatIf.downlinkPerTurn > 0 ? mb(whatIf.downlinkPerTurn) : 'No link home'}
                figureTone={homeTone(whatIf)}
                detail={`${r.mass} kg · ${r.volume} U · $${r.cost}M`}
                note={note?.text}
                noteTone={note?.tone}
                selected={design.radio === r.id}
                onPick={() => updateDesign({ radio: r.id })}
                onPreview={preview({ radio: r.id })}
              />
            )
          })}
        </PickRow>

        <PickRow title="Dish on Earth">
          {groundStations.map((s) => {
            const whatIf = computeBudgets({ ...design, ...stationPatch(s) }, difficulty)
            const note = stationNote(s)
            return (
              <PickTile
                key={s.id}
                id={s.id}
                scene
                tag={STATION_TAG[s.id] ?? 'Dish'}
                name={s.name}
                figure={whatIf.downlinkPerTurn > 0 ? mb(whatIf.downlinkPerTurn) : 'No link home'}
                figureTone={homeTone(whatIf)}
                detail={stationDetail(s, whatIf.groundCostPerTurn)}
                note={note.text}
                noteTone={note.tone}
                selected={design.groundStation === s.id}
                onPick={() => updateDesign(stationPatch(s))}
                onPreview={preview(stationPatch(s))}
              />
            )
          })}
        </PickRow>
      </div>

      <PlanPanel>
        <PlanHeadline kicker="Communications · data home" value={Math.round(b.downlinkPerTurn).toLocaleString('en-US')} unit="MB/month" line={line} />
        <PlanMeter label="Of the data made, gets home" pct={share} tone={tone} />
        <PlanRows>
          <PlanRow label="Link" value={b.linkKbps > 0 ? `${b.linkKbps} kbps` : 'none'} tone={b.linkKbps > 0 ? undefined : 'red'} />
          <PlanRow label="Instruments make" value={`${Math.round(b.dataPerTurn)} MB`} sub="a month" />
          <PlanRow label="Dish cost" value={money(b.groundCostPerTurn)} sub="a month" />
          <PlanRow label="Stored on board" value={`${Math.round(b.storageCapacity).toLocaleString('en-US')} MB`} sub="waits for a pass" />
          <PlanRow label="Radio power" value={radio ? `${radio.listenPower} / ${radio.transmitPower} W` : '—'} sub="listen / transmit" />
          <PlanRow label="Radio" value={radio ? `${radio.mass} kg · ${radio.volume} U` : '—'} sub={radio ? `$${radio.cost}M` : undefined} />
        </PlanRows>
        <ContactTime
          hours={design.contactHours ?? station?.defaultHours ?? 1}
          maxHours={getGroundStationById(design.groundStation)?.contactHoursPerDay ?? 1}
          onChange={(h) => updateDesign({ contactHours: h })}
        />
        <PlanChecks checks={commsChecks} />
        <PlanOdds />
        <PlanNav back={{ label: '← Back', to: 'ride' }} next={{ label: 'Launch review →', to: 'go-nogo' }} />
      </PlanPanel>
    </div>
  )
}
