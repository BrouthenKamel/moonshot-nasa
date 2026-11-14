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
    <div className="space-y-2 rounded-lg bg-slate-900 p-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="w-24 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500"
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
          aria-label="Turn"
          className="flex-1 accent-blue-500"
        />
        <span className="w-28 text-right text-sm text-slate-400">
          Turn {logs[current].turn} / {logs[last].turn}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pt-2">
        {segments.map((seg) => (
          <div key={`${seg.phase}-${seg.start}`} className="min-w-0" style={{ flexGrow: seg.end - seg.start + 1 }}>
            <div className="mb-1 truncate text-xs capitalize text-slate-500">{seg.phase}</div>
            <div className="flex gap-0.5">
              {logs.slice(seg.start, seg.end + 1).map((log, k) => {
                const i = seg.start + k
                const selected = i === current
                return (
                  <button
                    key={i}
                    onClick={() => onSelect(i)}
                    title={`Turn ${log.turn}: ${log.phase}${log.events.length ? `, ${log.events.length} event(s)` : ''}`}
                    className={`relative h-6 min-w-3 flex-1 rounded-sm ${PHASE_COLOURS[log.phase]} ${
                      selected ? 'ring-2 ring-white' : i < current ? 'opacity-90' : 'opacity-50'
                    }`}
                  >
                    {log.events.length > 0 && (
                      <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-red-400" />
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
