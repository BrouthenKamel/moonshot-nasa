import { useState } from 'react'
import { assetUrl } from '../../../assets/url'
import { choiceArt } from '../../../assets/catalogueArt'
import { prefersReducedMotion } from '../../../scene/space/quality'
import type { Budgets, CheckResult, BarStatus } from '../../../sim/types'
import { Eng, LineItem, Stamp, stepNumber, type StampVerdict } from '../../kit'

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

function Portrait({ id, label, caption }: { id: string; label: string; caption: string }) {
  const art = choiceArt(id)
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex w-28 shrink-0 flex-col items-center text-center sm:w-36">
      <div className="relative h-20 w-20 border border-rule bg-ink-1 sm:h-24 sm:w-24">
        {art?.portrait && !failed && (
          <img src={assetUrl(art.portrait)} alt="" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-contain p-1" />
        )}
      </div>
      <div className="fp-label mt-1 text-[10px] text-paper-faint">{label}</div>
      <div className="line-clamp-2 text-xs font-semibold leading-tight text-paper">{caption}</div>
    </div>
  )
}

/** The path from the Moon to the dish: packets flow when the link closes, a broken line when it does not */
function Beam({ status, kbps, hours }: { status: BarStatus; kbps: number; hours: number }) {
  const colour = TONE[status].stroke
  const open = kbps > 0
  const reduced = prefersReducedMotion()
  // Faster packets for a faster link (purely decorative)
  const dur = open ? Math.max(0.5, 2.6 - Math.log10(kbps + 1) * 0.9) : 0
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
              strokeWidth="3"
              strokeDasharray="2 22"
              style={reduced ? undefined : { animation: `comms-flow ${dur}s linear infinite` }}
            />
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

  return (
    <section aria-labelledby="link-console-title" className="fp-sheet p-4">
      <style>{`@keyframes comms-flow { to { stroke-dashoffset: -24 } }`}</style>
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
        <Portrait id={radioId} label="At the Moon" caption={radioName} />
        <Beam status={commsStatus} kbps={budgets.linkKbps} hours={budgets.contactHours} />
        <Portrait id={stationId} label="On Earth" caption={stationName} />
      </div>

      {/* Gauge: made vs carried */}
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
      </div>

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
  return (
    <div className="sticky -top-4 z-30 h-0" aria-hidden={!visible}>
      <div className={`-mx-2 bg-ink-1 px-2 pb-2 pt-4 transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <div className="fp-sheet flex items-center gap-4 px-4 py-2">
          <span className={`shrink-0 text-sm font-semibold ${TONE[status].text}`}>{`Data gets home: ${dataHomeWord(status, budgets.linkKbps)}`}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="h-1 bg-ink-3">
              <div className="h-full bg-paper-dim transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(made / scale) * 100}%` }} />
            </div>
            <div className="h-1 bg-ink-3">
              <div className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${TONE[status].bar}`} style={{ width: `${(carried / scale) * 100}%` }} />
            </div>
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
