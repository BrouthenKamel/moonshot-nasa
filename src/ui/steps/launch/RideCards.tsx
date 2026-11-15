import { useMemo } from 'react'
import { useGameStore } from '../../../state/gameStore'
import { useRideView, chooseRide, chooseTransfer } from '../../../viz/ride/useRideView'
import type { BoardRow, RowStatus, TransferSign } from '../../../viz/ride/rideView'
import { getRideById } from '../../../data/rides'
import { transfers, getTransferById } from '../../../data/transfers'
import { getPartById, type PropulsionPart } from '../../../data/parts'
import { computeBudgets } from '../../../sim/budgets'
import { useDropTarget } from '../../interaction/drag'
import { useDragStore } from '../../interaction/dragStore'
import type { ChoiceStat } from '../../kit/ChoiceCard'
import { Flap } from '../../kit'
import { LaunchCard, type Plaque } from './LaunchCard'
import { playPick, useRadioKeys } from './radioKeys'

/**
 * The ride and transfer choices as painted cards. Every number comes from the ride view
 * (computeBudgets / goNoGo, a what-if per ride) or a what-if computeBudgets per transfer.
 * Writes only `ride` and `transfer`, through chooseRide / chooseTransfer.
 */

export type CardSize = 'xs' | 'sm' | 'md' | 'lg'

const ROW_TONE: Record<RowStatus, Plaque['tone']> = {
  onTime: 'good',
  tooEarly: 'bad',
  tooHeavy: 'bad',
  wrongEngine: 'bad',
  cantReach: 'bad',
  overBudget: 'bad',
}

const ENGINE_WORDS: Record<string, string> = {
  electric: 'ion',
  chemical: 'chemical',
  'cold-gas': 'cold gas',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const ms = (x: number) => `${Math.round(x).toLocaleString('en-US')} m/s`

function rideStats(r: BoardRow): ChoiceStat[] {
  return [
    { label: 'Leaves', value: `Month ${r.turn}`, tone: r.status === 'tooEarly' ? 'bad' : undefined },
    { label: 'Arrives', value: r.arrivalTurn === null ? 'never' : `Month ${r.arrivalTurn}`, tone: r.arrivalTurn === null ? 'bad' : undefined },
    { label: 'Plan cost', value: `$${r.planCost.toFixed(1)}M`, tone: r.overBudget ? 'bad' : undefined },
    { label: 'Capture', value: r.burn === null ? 'no way' : ms(r.burn), tone: r.burn === null || r.status === 'cantReach' ? 'bad' : undefined },
  ]
}

/** Where the ride lets the craft go, short */
const DROP_SHORT: Record<string, string> = {
  gto: 'Earth orbit (GTO)',
  'trans-lunar': 'Path to the Moon',
  'lunar-vicinity': 'Close to the Moon',
}

function RideRowCard({
  row,
  index,
  size,
  totalMass,
  tabIndex,
  buttonRef,
  onKeyDown,
  onPick,
  onHover,
}: {
  row: BoardRow
  index: number
  size: CardSize
  totalMass: number
  tabIndex: number
  buttonRef: (el: HTMLButtonElement | null) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void
  onPick: () => void
  onHover?: (id: string | null) => void
}) {
  const ride = getRideById(row.id)
  const refusal = useDragStore((s) => s.lastRefusal)
  const drop = useDropTarget({
    id: `ride:row:${row.id}`,
    accepts: ['boarding-pass'],
    refuse: () => {
      if (totalMass > row.limitKg) return `OVERWEIGHT: ${totalMass.toFixed(1)} kg > ${row.limitKg} kg limit`
      if (row.status === 'wrongEngine') return row.statusLabel
      return null
    },
    onDrop: () => onPick(),
  })
  const bounced = refusal?.field === 'boarding-pass' && row.status === 'tooHeavy' ? 'bounce-back' : ''
  const overMass = totalMass > row.limitKg
  const flapText = drop.state.over && !drop.state.ok ? 'OVERWEIGHT' : overMass ? 'OVERWEIGHT' : row.selected ? 'BOARDING' : 'OPEN'
  const flapToneClass =
    flapText === 'OVERWEIGHT' ? '!text-nogo border-nogo/60' : row.selected ? '!text-go border-go/60' : 'text-paper-dim'
  return (
    <div
      {...drop.handlers}
      className={`flex flex-col gap-1 transition-colors ${bounced} ${
        drop.state.over
          ? drop.state.ok
            ? 'outline outline-1 outline-kapton'
            : 'outline outline-1 outline-nogo'
          : drop.state.compatible
            ? 'outline outline-1 outline-dashed outline-rule-strong'
            : ''
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="fp-data text-[10px] text-paper-faint">GATE {index + 1}</span>
        <Flap value={flapText} className={`text-[10px] ${flapToneClass}`} />
      </div>
      <LaunchCard
        id={row.id}
        title={ride?.name ?? row.name}
        subtitle={`${(ride && DROP_SHORT[ride.dropOffOrbit]) ?? cap(row.dropWords)} · ${row.limitKg} kg max`}
        stats={rideStats(row)}
        plaque={{ tone: ROW_TONE[row.status], text: row.statusLabel }}
        inset
        insetSize={size === 'xs' ? 68 : 84}
        size={size}
        selected={row.selected}
        drag={{
          field: 'ride',
          value: row.id,
          label: ride?.name ?? row.name,
          patch: { ride: row.id },
          sound: 'sfx.pick-ride',
        }}
        onPick={onPick}
        radio
        tabIndex={tabIndex}
        buttonRef={buttonRef}
        onKeyDown={onKeyDown}
        onFocus={() => onHover?.(row.id)}
        onHover={() => onHover?.(row.id)}
      />
    </div>
  )
}

export function RideCardTray({
  size,
  columns = 3,
  onHover,
}: {
  size: CardSize
  columns?: number
  onHover?: (id: string | null) => void
}) {
  const view = useRideView()
  const totalMass = view.payload.mass
  const selectedId = view.rows.find((r) => r.selected)?.id ?? ''
  const pick = (id: string, fromKeyboard: boolean) => {
    if (fromKeyboard) playPick(id)
    chooseRide(id)
  }
  const keys = useRadioKeys(view.rows, selectedId, () => true, pick)
  return (
    <div
      role="radiogroup"
      aria-label="Rideshare launch"
      className="grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      onPointerLeave={() => onHover?.(null)}
      onBlur={() => onHover?.(null)}
    >
      {view.rows.map((r, i) => (
        <RideRowCard
          key={r.id}
          row={r}
          index={i}
          size={size}
          totalMass={totalMass}
          tabIndex={keys.tabIndex(r.id)}
          buttonRef={keys.ref(i)}
          onKeyDown={keys.onKeyDown(i)}
          onPick={() => pick(r.id, false)}
          onHover={onHover}
        />
      ))}
    </div>
  )
}

function useTransferTrials() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  return useMemo(() => {
    const out: Record<string, ReturnType<typeof computeBudgets>> = {}
    // What each transfer would mean for the current design (a what-if on a copy)
    for (const t of transfers) out[t.id] = computeBudgets({ ...design, transfer: t.id }, difficulty)
    return out
  }, [design, difficulty])
}

function transferStats(s: TransferSign, b: ReturnType<typeof computeBudgets>): ChoiceStat[] {
  if (!s.selectable) return []
  const takes =
    b.captureDeltaV === null ? 'never' : b.transferTurns === null ? 'no power' : b.transferTurns === 0 ? '5 days' : `${b.transferTurns} months`
  const left = b.captureDeltaV === null ? null : b.deltaVAfterCapture
  return [
    { label: 'Takes', value: takes, tone: b.transferTurns === null ? 'bad' : undefined },
    { label: 'Left after', value: left === null ? 'no way' : ms(left), tone: left === null || left < 0 ? 'bad' : 'good' },
  ]
}

function transferSubtitle(s: TransferSign, b: ReturnType<typeof computeBudgets>, rideTakesEngine: boolean): string {
  if (!s.selectable) return s.type === 'direct' ? 'About 5 days, one big braking burn' : cap(s.sub)
  if (b.captureDeltaV !== null) return `Capture burn ${ms(b.captureDeltaV)}`
  // Why the craft never gets there: the ride, the tank, or the orbit
  if (!rideTakesEngine) return 'Wrong engine for this ride'
  if (b.propellantMass <= 0) return 'No propellant on board'
  return 'Cannot capture into this orbit'
}

export function TransferCardTray({
  size,
  columns = 2,
  onHover,
}: {
  size: CardSize
  columns?: number
  onHover?: (id: string | null) => void
}) {
  const view = useRideView()
  const design = useGameStore((s) => s.design)
  const trials = useTransferTrials()
  const engine = getPartById(design.propulsion) as PropulsionPart | undefined
  const engineWords = ENGINE_WORDS[engine?.type ?? 'chemical']
  const ride = getRideById(design.ride)
  const rideTakesEngine = !!ride && (engine?.type === 'electric' ? ride.electricCompatible : ride.chemicalCompatible)
  const selectedId = view.signs.find((s) => s.selected)?.id ?? ''
  const pick = (id: string, fromKeyboard: boolean) => {
    if (fromKeyboard) playPick(id)
    chooseTransfer(id)
  }
  const keys = useRadioKeys(view.signs, selectedId, (s) => s.selectable, pick)
  return (
    <div
      role="radiogroup"
      aria-label="Transfer to the Moon"
      className="grid items-start gap-2.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      onPointerLeave={() => onHover?.(null)}
      onBlur={() => onHover?.(null)}
    >
      {view.signs.map((s, i) => {
        const t = getTransferById(s.id)
        return (
          <LaunchCard
            key={s.id}
            id={s.id}
            title={t?.name ?? s.title}
            subtitle={transferSubtitle(s, trials[s.id], rideTakesEngine)}
            stats={transferStats(s, trials[s.id])}
            disabled={!s.selectable}
            reason={`Needs a chemical engine; yours is ${engineWords}.`}
            size={size}
            selected={s.selected}
            drag={
              s.selectable
                ? {
                    field: 'transfer',
                    value: s.id,
                    label: t?.name ?? s.title,
                    patch: { transfer: s.id },
                    sound: 'sfx.select',
                  }
                : undefined
            }
            onPick={() => pick(s.id, false)}
            radio
            tabIndex={keys.tabIndex(s.id)}
            buttonRef={keys.ref(i)}
            onKeyDown={keys.onKeyDown(i)}
            onFocus={() => onHover?.(s.id)}
            onHover={() => onHover?.(s.id)}
          />
        )
      })}
    </div>
  )
}

/** The engine, read-only: it decides which transfers are possible, and is chosen at the Factory */
export function EngineNote({ className = '' }: { className?: string }) {
  const design = useGameStore((s) => s.design)
  const engine = getPartById(design.propulsion) as PropulsionPart | undefined
  return (
    <div className={className}>
      <div className="fp-label text-[9px] text-paper-faint">Engine</div>
      <div className="text-[11px] leading-tight font-semibold hyphens-auto text-paper">{engine ? engine.name.replace(/\s*\(.*\)$/, '') : 'None'}</div>
      <div className="mt-0.5 text-[10px] leading-tight text-paper-faint">chosen at the Factory</div>
    </div>
  )
}
