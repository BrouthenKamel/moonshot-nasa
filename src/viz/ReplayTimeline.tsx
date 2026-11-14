import { useMemo } from 'react'
import type { TurnLog } from '../sim/types'

interface ReplayTimelineProps {
  logs: TurnLog[]
  turnIndex: number
  onSelect: (i: number) => void
  playing: boolean
  onTogglePlay: () => void
}

const PHASE_COLOURS: Record<TurnLog['phase'], string> = {
  build: 'bg-slate-600',
  test: 'bg-purple-700',
  wait: 'bg-slate-700',
  transfer: 'bg-amber-600',
  capture: 'bg-orange-600',
  orbit: 'bg-green-700',
  complete: 'bg-green-800',
  failed: 'bg-red-800',
}

/** Each turn button's name, for the tooltip and for screen readers (QC #40) */
const turnTitle = (log: TurnLog) => `Month ${log.turn}: ${log.phase}${log.events.length ? `, ${log.events.length} event(s)` : ''}`

interface Segment {
  phase: TurnLog['phase']
  start: number
  end: number // inclusive
}

function groupSegments(logs: TurnLog[]): Segment[] {
  const segments: Segment[] = []
  logs.forEach((log, i) => {
    const last = segments[segments.length - 1]
    if (last && last.phase === log.phase) last.end = i
    else segments.push({ phase: log.phase, start: i, end: i })
  })
  return segments
}

export function ReplayTimeline({ logs, turnIndex, onSelect, playing, onTogglePlay }: ReplayTimelineProps) {
  const segments = useMemo(() => groupSegments(logs), [logs])
  if (logs.length === 0) return null
  const last = logs.length - 1
  const current = Math.min(Math.max(0, turnIndex), last)
  const atEnd = current >= last

  return (
    <div className="hud-panel space-y-2.5 rounded-2xl p-3.5">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="w-24 rounded-lg border border-blue-400/50 bg-blue-600 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-white shadow-[0_0_14px_rgba(59,130,246,0.35)] transition hover:bg-blue-500"
        >
          {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={current}
          onChange={(e) => onSelect(Number(e.target.value))}
          aria-label="Month"
          className="tactical-range flex-1"
        />
        <span className="w-32 text-right font-mono text-xs font-semibold tabular-nums text-slate-300">
          Month {logs[current].turn} / {logs[last].turn}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pt-2">
        {segments.map((seg) => (
          <div key={`${seg.phase}-${seg.start}`} className="min-w-0" style={{ flexGrow: seg.end - seg.start + 1 }}>
            <div className="mb-1 truncate font-mono text-[10px] uppercase tracking-wider text-slate-400">{seg.phase}</div>
            <div className="flex gap-0.5">
              {logs.slice(seg.start, seg.end + 1).map((log, k) => {
                const i = seg.start + k
                const selected = i === current
                return (
                  <button
                    key={i}
                    onClick={() => onSelect(i)}
                    title={turnTitle(log)}
                    aria-label={turnTitle(log)}
                    aria-pressed={selected}
                    className={`relative h-6 min-w-3 flex-1 rounded-sm transition ${PHASE_COLOURS[log.phase]} ${
                      selected ? 'ring-2 ring-white' : i < current ? 'opacity-90' : 'opacity-50'
                    }`}
                  >
                    {log.events.length > 0 && (
                      <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.9)]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
