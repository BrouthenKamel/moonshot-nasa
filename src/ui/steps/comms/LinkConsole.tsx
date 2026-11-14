import { useState } from 'react'
import { assetUrl } from '../../../assets/url'
import { choiceArt } from '../../../assets/catalogueArt'
import { prefersReducedMotion } from '../../../scene/space/quality'
import type { Budgets, CheckResult, BarStatus } from '../../../sim/types'

const TONE: Record<BarStatus, { text: string; bar: string; dot: string; beam: string }> = {
  green: { text: 'text-emerald-300', bar: 'bg-emerald-400', dot: 'bg-emerald-400', beam: '#34d399' },
  yellow: { text: 'text-amber-300', bar: 'bg-amber-400', dot: 'bg-amber-400', beam: '#fbbf24' },
  red: { text: 'text-rose-300', bar: 'bg-rose-500', dot: 'bg-rose-500', beam: '#f43f5e' },
}

const fmt = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0))

function Portrait({ id, label, caption, side }: { id: string; label: string; caption: string; side: 'moon' | 'earth' }) {
  const art = choiceArt(id)
  const [failed, setFailed] = useState(false)
  return (
    <div className="flex w-28 shrink-0 flex-col items-center text-center sm:w-36">
      <div className="relative h-20 w-20 sm:h-24 sm:w-24">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              side === 'moon'
                ? 'radial-gradient(circle at 35% 30%, #cbd5e1 0%, #64748b 45%, #1e293b 75%, transparent 76%)'
                : 'radial-gradient(circle at 35% 30%, #93c5fd 0%, #2563eb 40%, #172554 74%, transparent 75%)',
            opacity: 0.35,
          }}
        />
        {art?.portrait && !failed && (
          <img src={assetUrl(art.portrait)} alt="" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]" />
        )}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="line-clamp-2 text-xs font-semibold leading-tight text-slate-200">{caption}</div>
    </div>
  )
}

/** The beam from the Moon to the dish: packets flow when the link closes, a broken line when it does not */
function Beam({ status, kbps, hours }: { status: BarStatus; kbps: number; hours: number }) {
  const colour = TONE[status].beam
  const open = kbps > 0
  const reduced = prefersReducedMotion()
  // Faster packets for a faster link (purely decorative)
  const dur = open ? Math.max(0.5, 2.6 - Math.log10(kbps + 1) * 0.9) : 0
  const width = open ? 1.5 + Math.min(4, Math.log2(kbps + 1) / 2.5) : 1.5
  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-center">
      <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden="true">
        <defs>
          <linearGradient id="comms-beam" x1="0" x2="1">
            <stop offset="0" stopColor={colour} stopOpacity="0.15" />
            <stop offset="0.5" stopColor={colour} stopOpacity="0.9" />
            <stop offset="1" stopColor={colour} stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {open ? (
          <>
            <line x1="0" y1="20" x2="400" y2="20" stroke="url(#comms-beam)" strokeWidth={width * 3} opacity="0.25" />
            <line x1="0" y1="20" x2="400" y2="20" stroke="url(#comms-beam)" strokeWidth={width} />
            <line
              x1="0"
              y1="20"
              x2="400"
              y2="20"
              stroke={colour}
              strokeWidth={width + 1.5}
              strokeLinecap="round"
              strokeDasharray="2 22"
              style={reduced ? undefined : { animation: `comms-flow ${dur}s linear infinite` }}
            />
          </>
        ) : (
          <>
            <line x1="0" y1="20" x2="170" y2="20" stroke={colour} strokeWidth="2" strokeDasharray="6 6" opacity="0.7" />
            <path d="M190 10 L210 30 M210 10 L190 30" stroke={colour} strokeWidth="3" strokeLinecap="round" />
          </>
        )}
      </svg>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${TONE[status].text}`}>
        {open ? `${kbps} kbps` : 'No link'}
      </div>
      <div className="text-[11px] text-slate-400">{open ? `${hours} h a day of contact` : 'Nothing reaches the ground'}</div>
    </div>
  )
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/65 px-2.5 py-1.5 font-mono">
      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone ?? 'text-slate-100'}`}>{value}</div>
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
 * The comms console: the signal path from the craft at the Moon to the ground dish, and the
 * link budget as a gauge (data made each month against data the link can carry home). Every
 * number comes from computeBudgets and the Go / No-Go checks.
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
  const homePct = Math.min(100, (budgets.projectedData / Math.max(dataTarget, 1)) * 100)

  return (
    <section
      aria-labelledby="link-console-title"
      className="hud-panel border-[var(--role-border)] bg-[#050a18]/95 p-4 shadow-[0_0_40px_rgba(59,130,246,0.1)] backdrop-blur"
    >
      <style>{`@keyframes comms-flow { to { stroke-dashoffset: -24 } }`}</style>
      <div className="flex items-center justify-between gap-3">
        <h2 id="link-console-title" className="font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--role-accent)]">
          Data link budget
        </h2>
        <span className={`flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${TONE[dataStatus].text}`}>
          <span className={`h-2 w-2 rounded-full ${TONE[dataStatus].dot}`} />
          {dataStatus === 'green' ? 'All data gets home' : dataStatus === 'yellow' ? 'Tight' : 'No data home'}
        </span>
      </div>

      {/* Signal path */}
      <div className="mt-3 flex items-center gap-2">
        <Portrait id={radioId} label="At the Moon" caption={radioName} side="moon" />
        <Beam status={commsStatus} kbps={budgets.linkKbps} hours={budgets.contactHours} />
        <Portrait id={stationId} label="On Earth" caption={stationName} side="earth" />
      </div>

      {/* Gauge: made vs carried */}
      <div className="mt-4 space-y-2 font-mono" role="group" aria-label="Data made against data sent home each month">
        <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
          <span className="text-xs text-slate-400">Instruments make</span>
          <div className="relative h-3 overflow-hidden rounded-full bg-white/5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-amber-300/90 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${madePct}%` }} />
            <div className="hud-bar-segments pointer-events-none absolute inset-0" />
          </div>
          <span className="w-28 text-right text-sm font-semibold tabular-nums text-amber-200">{fmt(made)} MB/month</span>
        </div>
        <div className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3">
          <span className="text-xs text-slate-400">Link carries</span>
          <div className="relative h-3 overflow-hidden rounded-full bg-white/5">
            <div className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 motion-reduce:transition-none ${TONE[dataStatus].bar}`} style={{ width: `${carriedPct}%` }} />
            <div className="hud-bar-segments pointer-events-none absolute inset-0" />
            {/* Where the instruments' output sits on the link bar */}
            <div className="absolute inset-y-[-2px] w-0.5 bg-amber-200" style={{ left: `${madePct}%` }} aria-hidden="true" />
          </div>
          <span className={`w-28 text-right text-sm font-semibold tabular-nums ${TONE[dataStatus].text}`}>{fmt(carried)} MB/month</span>
        </div>
      </div>

      {/* 12-Month Science Data Funnel */}
      <div className="mt-4 rounded-xl border border-slate-700/60 bg-slate-950/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
          <span className="uppercase tracking-[0.18em] text-slate-400">12-Month Science Data Funnel</span>
          <span className={budgets.projectedData >= dataTarget ? 'font-bold text-cyan-300' : 'font-bold text-amber-300'}>
            {budgets.projectedData.toFixed(0)} / {dataTarget} MB goal
          </span>
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-center gap-1.5 font-mono text-[11px] tabular-nums">
          <div className="rounded border border-slate-700/70 bg-slate-900/80 px-2 py-1.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Observed</div>
            <div className="font-bold text-amber-200">{observed12} MB</div>
          </div>
          <span aria-hidden="true" className="text-slate-500">→</span>
          <div className="rounded border border-slate-700/70 bg-slate-900/80 px-2 py-1.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Stored</div>
            <div className="font-bold text-slate-100">{budgets.storageCapacity} MB</div>
          </div>
          <span aria-hidden="true" className="text-slate-500">→</span>
          <div className="rounded border border-sky-400/35 bg-sky-950/40 px-2 py-1.5 text-center">
            <div className="text-[9px] uppercase tracking-wider text-sky-300">Downlinked Home</div>
            <div className="font-bold text-cyan-300">{budgets.projectedData.toFixed(0)} / {dataTarget} MB</div>
          </div>
          <span aria-hidden="true" className="text-slate-500">→</span>
          <div
            className={`rounded border px-2 py-1.5 text-center ${
              budgets.projectedLost > 0.5
                ? 'border-rose-400/40 bg-rose-950/45 text-rose-300'
                : 'border-emerald-400/30 bg-emerald-950/35 text-emerald-300'
            }`}
          >
            <div className="text-[9px] uppercase tracking-wider opacity-80">Overflow Lost</div>
            <div className="font-bold">{budgets.projectedLost.toFixed(0)} MB</div>
          </div>
        </div>
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-900">
          <div
            className={`h-full transition-all duration-300 ${budgets.projectedData >= dataTarget ? 'bg-cyan-400' : 'bg-amber-400'}`}
            style={{ width: `${homePct}%` }}
          />
          <div className="hud-bar-segments pointer-events-none absolute inset-0" />
        </div>
      </div>

      {/* Why: the checks' own words */}
      <div className="mt-3 space-y-1 text-xs" aria-live="polite">
        {data && (
          <p className={dataStatus === 'green' ? 'text-slate-400' : TONE[dataStatus].text}>
            <span className="font-semibold">Data link:</span> {data.reason}
          </p>
        )}
        {comms && commsStatus !== 'green' && (
          <p className={TONE[commsStatus].text}>
            <span className="font-semibold">Comms:</span> {comms.reason}
          </p>
        )}
        {budgets.transmitShare < 1 && (
          <p className="text-amber-300">
            Power only lets the radio transmit {Math.round(budgets.transmitShare * 100)}% of the contact time.
          </p>
        )}
        {short && (
          <p className="text-rose-300">
            More data is made than sent. It waits in storage until that is full; after that it is lost, and the ice coverage it held is lost with it.
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip label="Spare each month" value={`${short ? '' : '+'}${fmt(budgets.dataMarginPerTurn)} MB`} tone={TONE[dataStatus].text} />
        <Chip label="Storage on board" value={`${budgets.storageCapacity} MB`} />
        <Chip label="Ground time" value={`$${budgets.groundCostPerTurn.toFixed(2)}M a month`} />
        <Chip
          label="Transmit time"
          value={`${Math.round(budgets.transmitShare * 100)}%`}
          tone={budgets.transmitShare < 1 ? 'text-amber-300' : undefined}
        />
      </div>
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
      <div className={`-mx-2 bg-slate-950 px-2 pb-2 pt-4 transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <div
        className={`hud-panel flex items-center gap-4 border-[var(--role-border)] bg-[#050a18]/95 px-4 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur transition-[opacity,transform] duration-200 motion-reduce:transition-none ${
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[status].dot}`} />
        <span className={`w-24 shrink-0 font-mono text-lg font-bold tabular-nums ${TONE[status].text}`}>
          {budgets.linkKbps > 0 ? `${budgets.linkKbps} kbps` : 'No link'}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-amber-300/90 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(made / scale) * 100}%` }} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${TONE[status].bar}`} style={{ width: `${(carried / scale) * 100}%` }} />
          </div>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-300">
          <span className="text-amber-200">{fmt(made)}</span> made · <span className={TONE[status].text}>{fmt(carried)}</span> sent MB/month
        </span>
      </div>
      </div>
    </div>
  )
}
