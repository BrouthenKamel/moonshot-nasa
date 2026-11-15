import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { assetUrl } from '../../../assets/url'
import { audio } from '../../../assets/audio'
import { choiceArt } from '../../../assets/catalogueArt'
import { groundStations } from '../../../data/ground'
import { prefersReducedMotion } from '../../../scene/space/quality'
import { storageFlow } from '../../../scene/interaction/reactions'
import { fillWhen } from '../../../sim/budgets'
import { useDropTarget } from '../../interaction/drag'
import type { Budgets, CheckResult, BarStatus } from '../../../sim/types'
import { Eng, LineItem, Stamp, stepNumber, type StampVerdict } from '../../kit'
import { aimIndexForKey } from './consoleControls'

const N = stepNumber('comms')

/** Muted go / caution / no-go, from the design tokens */
const TONE: Record<BarStatus, { text: string; bar: string; stroke: string; verdict: StampVerdict }> = {
  green: { text: 'text-go', bar: 'bg-go', stroke: 'var(--color-go)', verdict: 'go' },
  yellow: { text: 'text-caution', bar: 'bg-caution', stroke: 'var(--color-caution)', verdict: 'caution' },
  red: { text: 'text-nogo', bar: 'bg-nogo', stroke: 'var(--color-nogo)', verdict: 'nogo' },
}

/** The one plain-word answer to "how does the data get home?" */
function dataHomeWord(status: BarStatus, kbps: number): string {
  if (kbps <= 0 || status === 'red') return 'no'
  return status === 'yellow' ? 'only part' : 'yes'
}

const fmt = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0))

function Portrait({
  id,
  label,
  caption,
  dropHandlers,
  dropState,
}: {
  id: string
  label: string
  caption: string
  dropHandlers?: Record<string, unknown>
  dropState?: { compatible: boolean; over: boolean; ok: boolean }
}) {
  const art = choiceArt(id)
  const [failed, setFailed] = useState(false)
  const ring = dropState?.over
    ? dropState.ok
      ? 'border-kapton'
      : 'border-nogo'
    : dropState?.compatible
      ? 'border-dashed border-rule-strong'
      : 'border-rule'
  return (
    <div {...dropHandlers} className="flex w-28 shrink-0 flex-col items-center text-center sm:w-36">
      <div className={`relative h-20 w-20 border bg-ink-1 transition-colors sm:h-24 sm:w-24 ${ring}`}>
        {art?.portrait && !failed && (
          <img src={assetUrl(art.portrait)} alt="" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-contain p-1" />
        )}
      </div>
      <div className="fp-label mt-1 text-[10px] text-paper-faint">{label}</div>
      <div className="line-clamp-2 text-xs font-semibold leading-tight text-paper">{caption}</div>
    </div>
  )
}

/** The path from the Moon to the dish: paper-square packets flow when the link closes, stall when it does not */
function Beam({ status, kbps, hours, packetRate }: { status: BarStatus; kbps: number; hours: number; packetRate: number }) {
  const colour = TONE[status].stroke
  const open = kbps > 0
  const reduced = prefersReducedMotion()
  const packetCount = open ? Math.min(8, Math.max(2, packetRate)) : 0
  const dur = open ? Math.max(0.7, 3.2 - packetRate * 0.22) : 0
  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-center">
      <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden="true">
        {open ? (
          <>
            <line x1="0" y1="20" x2="400" y2="20" stroke="var(--color-rule-strong)" strokeWidth="1" />
            <line
              x1="0"
              y1="20"
              x2="400"
              y2="20"
              stroke={colour}
              strokeWidth="2"
              strokeDasharray="2 22"
              style={reduced ? undefined : { animation: `comms-flow ${dur}s linear infinite` }}
            />
            {Array.from({ length: packetCount }, (_, i) => {
              const x = ((i + 0.5) / packetCount) * 370 + 12
              return (
                <rect
                  key={i}
                  x={x}
                  y={16}
                  width={7}
                  height={7}
                  fill="var(--color-paper)"
                  stroke={colour}
                  strokeWidth="1"
                  style={
                    reduced
                      ? undefined
                      : {
                          animation: `comms-packet ${dur}s linear infinite`,
                          animationDelay: `${-(i / packetCount) * dur}s`,
                        }
                  }
                />
              )
            })}
          </>
        ) : (
          <>
            <line x1="0" y1="20" x2="170" y2="20" stroke={colour} strokeWidth="1.5" strokeDasharray="6 6" />
            <path d="M190 10 L210 30 M210 10 L190 30" stroke={colour} strokeWidth="2" />
          </>
        )}
      </svg>
      <Eng as="div" className={`mt-1 fp-data text-lg ${TONE[status].text}`}>
        {open ? `${kbps} kbps` : 'No link'}
      </Eng>
      <div className="text-[11px] text-paper-dim">{open ? `${hours} h a day of contact` : 'Nothing reaches the ground'}</div>
    </div>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-2.5 py-1.5">
      <div className="fp-label text-[9px] text-paper-faint">{label}</div>
      <div className={`fp-data text-sm font-medium ${tone ?? 'text-paper'}`}>{value}</div>
    </div>
  )
}

interface LinkConsoleProps {
  budgets: Budgets
  comms: CheckResult | undefined
  data: CheckResult | undefined
  radioId: string
  radioName: string
  stationId: string
  stationName: string
  dataTarget?: number
  onPickRadio?: (id: string) => void
  onPickStation?: (id: string) => void
  onPreviewStation?: (id: string | null) => void
  /** The contact-time control, shown as a console row under the dish aim */
  contact?: ReactNode
}

/**
 * The comms console. Story view: the path from the craft to the dish, one verdict
 * ("Data gets home: yes / only part / no") and the made-vs-sent gauge as shapes.
 * Engineer view adds every figure: kbps, MB/month, the 12-month funnel and the costs.
 */
export function LinkConsole({
  budgets,
  comms,
  data,
  radioId,
  radioName,
  stationId,
  stationName,
  dataTarget = 300,
  onPickRadio,
  onPickStation,
  onPreviewStation,
  contact,
}: LinkConsoleProps) {
  const commsStatus = comms?.status ?? 'green'
  const dataStatus = data?.status ?? 'green'
  const made = budgets.dataPerTurn
  const carried = budgets.downlinkPerTurn
  const scale = Math.max(made, carried, 1) * 1.1
  const madePct = (made / scale) * 100
  const carriedPct = (carried / scale) * 100
  const short = budgets.dataMarginPerTurn < 0
  const observed12 = Math.round(made * 12)
  const word = dataHomeWord(dataStatus, budgets.linkKbps)
  const flow = storageFlow(made, carried, budgets.storageCapacity)
  const reduced = prefersReducedMotion()

  const radioDrop = useDropTarget({
    id: 'comms:radio-slot',
    accepts: ['radio'],
    onDrop: (p) => onPickRadio?.(p.value),
  })
  const globeDrop = useDropTarget({
    id: 'comms:globe-pad',
    accepts: ['groundStation'],
    onDrop: (p) => onPickStation?.(p.value),
  })

  const aimRailRef = useRef<HTMLDivElement>(null)
  const [aimingIdx, setAimingIdx] = useState<number | null>(null)
  const currentIdx = Math.max(
    0,
    groundStations.findIndex((g) => g.id === stationId),
  )
  const shownIdx = aimingIdx ?? currentIdx
  const dishPct = groundStations.length > 1 ? (shownIdx / (groundStations.length - 1)) * 100 : 50

  const handleAimDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !aimRailRef.current) return
      e.preventDefault()
      const rail = aimRailRef.current
      let lastIdx = currentIdx
      const indexForX = (x: number) => {
        const rect = rail.getBoundingClientRect()
        const t = Math.min(1, Math.max(0, (x - rect.left) / Math.max(1, rect.width)))
        return Math.min(groundStations.length - 1, Math.max(0, Math.round(t * (groundStations.length - 1))))
      }
      const applyIdx = (idx: number) => {
        setAimingIdx(idx)
        const s = groundStations[idx]
        if (s) onPreviewStation?.(s.id)
      }
      applyIdx(lastIdx)
      const move = (ev: PointerEvent) => {
        const idx = indexForX(ev.clientX)
        if (idx !== lastIdx) {
          lastIdx = idx
          audio.play('sfx.click')
          applyIdx(idx)
        }
      }
      const finish = (commit: boolean) => () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', cancel)
        setAimingIdx(null)
        onPreviewStation?.(null)
        const chosen = groundStations[lastIdx]
        if (commit && chosen) {
          audio.play('sfx.pick-ground')
          onPickStation?.(chosen.id)
        }
      }
      const up = finish(true)
      const cancel = finish(false)
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', cancel)
    },
    [currentIdx, onPickStation, onPreviewStation],
  )

  // The keyboard's way to aim: arrows step one station, Home / End jump to the ends
  const handleAimKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = aimIndexForKey(e.key, currentIdx, groundStations.length)
    if (next === null) return
    e.preventDefault()
    const s = groundStations[next]
    if (!s || next === currentIdx) return
    audio.play('sfx.pick-ground')
    onPickStation?.(s.id)
  }

  return (
    <section aria-labelledby="link-console-title" className="fp-sheet p-4">
      <style>{`@keyframes comms-flow { to { stroke-dashoffset: -24 } } @keyframes comms-packet { 0% { opacity: 0.2 } 50% { opacity: 1 } 100% { opacity: 0.2 } } @keyframes comms-spill { 0% { transform: translateY(0); opacity: 1 } 100% { transform: translateY(14px); opacity: 0 } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="link-console-title" className="flex items-baseline gap-2">
          <span className="fp-data text-[11px] text-paper-faint">{`${N}.1`}</span>
          <span className="fp-label text-paper">Data link</span>
        </h2>
        <Stamp key={word} verdict={TONE[dataStatus].verdict} animate>
          {`Data gets home: ${word}`}
        </Stamp>
      </div>

      {/* Signal path */}
      <div className="mt-3 flex items-center gap-2">
        <Portrait id={radioId} label="At the Moon" caption={radioName} dropHandlers={radioDrop.handlers} dropState={radioDrop.state} />
        <Beam status={commsStatus} kbps={budgets.linkKbps} hours={budgets.contactHours} packetRate={flow.rate} />
        <Portrait id={stationId} label="On Earth" caption={stationName} dropHandlers={globeDrop.handlers} dropState={globeDrop.state} />
      </div>

      {/* Dish aim gimbal: drag handle across ground networks to aim at the Moon */}
      <div className="mt-3 border border-rule bg-ink-1 px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="fp-label text-[10px] text-paper-faint">Dish aim on Earth</span>
          <span className="fp-data text-paper-dim">{groundStations[shownIdx]?.name ?? stationName}</span>
        </div>
        <div ref={aimRailRef} className="relative mt-2 h-7">
          <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-rule-strong" />
          <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
            {groundStations.map((gs, idx) => (
              <span
                key={gs.id}
                className={`h-2 w-2 rounded-full border ${
                  idx === shownIdx ? 'border-kapton bg-kapton' : 'border-rule-strong bg-ink-0'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            data-testid="dish-aim-handle"
            aria-label={`Aim dish toward ground network (currently ${stationName}). Arrow keys to change.`}
            onPointerDown={handleAimDown}
            onKeyDown={handleAimKey}
            style={{ left: `calc(12px + (100% - 24px) * ${dishPct / 100})`, touchAction: 'none' }}
            className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab border border-kapton bg-ink-2 px-2 py-0.5 fp-data text-[10px] font-semibold text-kapton hover:bg-kapton hover:text-kapton-ink active:cursor-grabbing"
          >
            ◎ Aim dish
          </button>
        </div>
      </div>

      {contact}

      {/* Gauge: made vs carried + onboard storage tray fill & overflow spill */}
      <div className="mt-4 space-y-2" role="group" aria-label="Data made against data sent home each month">
        <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
          <span className="text-xs text-paper-dim">Instruments make</span>
          <div className="relative h-2.5 border border-rule bg-ink-1">
            <div className="absolute inset-y-0 left-0 bg-paper-dim transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${madePct}%` }} />
          </div>
          <Eng className="w-28 text-right fp-data text-sm text-paper">{fmt(made)} MB/month</Eng>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
          <span className="text-xs text-paper-dim">Link carries</span>
          <div className="relative h-2.5 border border-rule bg-ink-1">
            <div className={`absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none ${TONE[dataStatus].bar}`} style={{ width: `${carriedPct}%` }} />
            {/* Where the instruments' output sits on the link bar */}
            <div className="absolute inset-y-[-3px] w-px bg-paper" style={{ left: `${madePct}%` }} aria-hidden="true" />
          </div>
          <Eng className={`w-28 text-right fp-data text-sm ${TONE[dataStatus].text}`}>{fmt(carried)} MB/month</Eng>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
          <span className="text-xs text-paper-dim">Storage tray</span>
          <div className="relative h-2.5 border border-rule bg-ink-1">
            <div
              className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${
                flow.spill > 0 ? 'bg-nogo' : flow.fill > 0.7 ? 'bg-caution' : 'bg-paper-dim'
              }`}
              style={{ width: `${Math.round(flow.fill * 100)}%` }}
            />
            {flow.spill > 0 && (
              <div className="pointer-events-none absolute -top-0.5 right-0 flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 bg-paper"
                    style={
                      reduced
                        ? undefined
                        : { animation: 'comms-spill 0.9s ease-in infinite', animationDelay: `${i * 0.28}s` }
                    }
                  />
                ))}
              </div>
            )}
          </div>
          <Eng className={`w-28 text-right fp-data text-sm ${flow.spill > 0 ? 'text-nogo' : 'text-paper-dim'}`}>
            {Math.round(flow.fill * 100)}% full
          </Eng>
        </div>
      </div>

      {flow.spill > 0 && (
        <div data-testid="data-spill" className="mt-2 border-l-2 border-nogo bg-ink-2 px-3 py-1.5 text-xs text-nogo">
          Storage tray overflowing — it fills {fillWhen(flow)}, then {Math.round(flow.lostPerMonth)} MB a month ({Math.round(flow.spill * 100)}% of the science) spills overboard.
        </div>
      )}
      <Eng as="div" className="mt-1.5 fp-data text-[11px] text-paper-faint">
        Storage fill: {Math.round(flow.fill * 100)}% · Overflow spill: {Math.round(flow.spill * 100)}% · Packet rate: {flow.rate}/s
      </Eng>

      {/* Why: the checks' own words */}
      <div className="mt-3 space-y-1 text-xs" aria-live="polite">
        {data &&
          (dataStatus === 'green' ? (
            <Eng as="p" className="text-paper-dim">
              <span className="font-semibold">Data link:</span> {data.reason}
            </Eng>
          ) : (
            <p className={TONE[dataStatus].text}>
              <span className="font-semibold">Data link:</span> {data.reason}
            </p>
          ))}
        {comms && commsStatus !== 'green' && (
          <p className={TONE[commsStatus].text}>
            <span className="font-semibold">Comms:</span> {comms.reason}
          </p>
        )}
        {budgets.transmitShare < 1 && (
          <p className="text-caution">Power only lets the radio transmit {Math.round(budgets.transmitShare * 100)}% of the contact time.</p>
        )}
        {short && (
          <p className="text-nogo">
            More data is made than sent. It waits in storage until that is full; after that it is lost, and the ice coverage it held is lost with it.
          </p>
        )}
      </div>

      {/* Engineer: the 12-month funnel and the running figures */}
      <Eng as="div" className="mt-3 block border-t border-rule pt-3">
        <LineItem
          n={`${N}.1.1`}
          label="12-month science data"
          aside={
            <span className={budgets.projectedData >= dataTarget ? 'text-go' : 'text-caution'}>
              {budgets.projectedData.toFixed(0)} / {dataTarget} MB goal
            </span>
          }
        />
        <div className="mt-2 grid grid-cols-2 divide-x divide-rule border border-rule sm:grid-cols-4">
          <Cell label="Observed" value={`${observed12} MB`} />
          <Cell label="Stored" value={`${budgets.storageCapacity} MB`} />
          <Cell label="Downlinked home" value={`${budgets.projectedData.toFixed(0)} / ${dataTarget} MB`} />
          <Cell label="Overflow lost" value={`${budgets.projectedLost.toFixed(0)} MB`} tone={budgets.projectedLost > 0.5 ? 'text-nogo' : 'text-go'} />
        </div>
        <div className="mt-2 grid grid-cols-2 divide-x divide-rule border border-rule sm:grid-cols-4">
          <Cell label="Spare each month" value={`${short ? '' : '+'}${fmt(budgets.dataMarginPerTurn)} MB`} tone={TONE[dataStatus].text} />
          <Cell label="Storage on board" value={`${budgets.storageCapacity} MB`} />
          <Cell label="Ground time" value={`$${budgets.groundCostPerTurn.toFixed(2)}M a month`} />
          <Cell label="Transmit time" value={`${Math.round(budgets.transmitShare * 100)}%`} tone={budgets.transmitShare < 1 ? 'text-caution' : undefined} />
        </div>
      </Eng>
    </section>
  )
}

/**
 * A slim read-out of the link that stays at the top while the player scrolls through the
 * trays, so every pick shows its effect on the data that gets home.
 */
export function LinkRibbon({ budgets, data, visible }: { budgets: Budgets; data: CheckResult | undefined; visible: boolean }) {
  const status = data?.status ?? 'green'
  const made = budgets.dataPerTurn
  const carried = budgets.downlinkPerTurn
  const scale = Math.max(made, carried, 1) * 1.1
  const radioDrop = useDropTarget({ id: 'comms:ribbon-radio', accepts: ['radio'] })
  const globeDrop = useDropTarget({ id: 'comms:ribbon-globe', accepts: ['groundStation'] })
  const dropChipCls = (st: typeof radioDrop.state) =>
    `shrink-0 border px-2 py-1 fp-label text-[10px] transition-colors ${
      st.over
        ? st.ok
          ? 'border-kapton bg-kapton/15 text-kapton'
          : 'border-nogo text-nogo'
        : st.compatible
          ? 'border-dashed border-kapton text-paper'
          : 'border-rule bg-ink-2 text-paper-dim'
    }`
  return (
    <div className="sticky -top-4 z-30 h-0" aria-hidden={!visible}>
      <div className={`-mx-2 bg-ink-1 px-2 pb-2 pt-4 transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="fp-sheet flex items-center gap-3 px-4 py-2">
          <span className={`shrink-0 text-sm font-semibold ${TONE[status].text}`}>{`Data gets home: ${dataHomeWord(status, budgets.linkKbps)}`}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="h-1 bg-ink-3">
              <div className="h-full bg-paper-dim transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(made / scale) * 100}%` }} />
            </div>
            <div className="h-1 bg-ink-3">
              <div className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${TONE[status].bar}`} style={{ width: `${(carried / scale) * 100}%` }} />
            </div>
          </div>
          <div {...radioDrop.handlers} className={dropChipCls(radioDrop.state)} title="Drop a spacecraft radio here">
            Moon slot
          </div>
          <div {...globeDrop.handlers} className={dropChipCls(globeDrop.state)} title="Drop a ground station here">
            Earth pad
          </div>
          <Eng className="shrink-0 fp-data text-xs text-paper-dim">
            {budgets.linkKbps > 0 ? `${budgets.linkKbps} kbps · ` : ''}
            {fmt(made)} made · <span className={TONE[status].text}>{fmt(carried)}</span> sent MB/month
          </Eng>
        </div>
      </div>
    </div>
  )
}
