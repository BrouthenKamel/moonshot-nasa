import { useMemo } from 'react'
import type { TurnLog } from '../sim/types'

interface ReplayTimelineProps {
  logs: TurnLog[]
  turnIndex: number
  onSelect: (i: number) => void
  playing: boolean
  onTogglePlay: () => void
}

/** A thin muted band under each phase, like the colour key on a printed flight plan */
const PHASE_BAND: Record<TurnLog['phase'], string> = {
  build: 'bg-paper-faint/50',
  test: 'bg-paper-faint/50',
  wait: 'bg-rule-strong',
  transfer: 'bg-kapton-dim',
  capture: 'bg-kapton',
  orbit: 'bg-go/70',
  complete: 'bg-go',
  failed: 'bg-nogo',
}

const PHASE_NAME: Record<TurnLog['phase'], string> = {
  build: 'Build',
  test: 'Test',
  wait: 'Pad',
  transfer: 'Transfer',
  capture: 'Capture',
  orbit: 'Science orbit',
  complete: 'Complete',
  failed: 'Failed',
}

/** Each month tick's name, for the tooltip and for screen readers (QC #40) */
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

/** The flight as a ruled timeline: phases as labelled segments, a tick per month, the chosen month in Kapton */
export function ReplayTimeline({ logs, turnIndex, onSelect, playing, onTogglePlay }: ReplayTimelineProps) {
  const segments = useMemo(() => groupSegments(logs), [logs])
  if (logs.length === 0) return null
  const last = logs.length - 1
  const current = Math.min(Math.max(0, turnIndex), last)
  const atEnd = current >= last

  return (
    <div className="fp-sheet space-y-2 p-3.5" data-tone="raised">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onTogglePlay} className="fp-btn-primary w-24 justify-center py-1.5 text-xs">
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
        <span className="w-36 text-right fp-data text-xs text-paper">
          <span className="text-kapton">Month {logs[current].turn}</span> / {logs[last].turn}
        </span>
      </div>

      <div className="flex overflow-x-auto pt-1">
        {segments.map((seg, si) => (
          <div
            key={`${seg.phase}-${seg.start}`}
            className={si > 0 ? "border-l border-rule-strong pl-1" : ""}
            style={{ flexGrow: seg.end - seg.start + 1, flexBasis: 0 }}
          >
            <div className="mb-1 whitespace-nowrap pr-1 fp-label text-[0.6rem]">
              {PHASE_NAME[seg.phase]}
            </div>
            <div className={`h-0.5 ${PHASE_BAND[seg.phase]}`} aria-hidden="true" />
            <div className="flex">
              {logs.slice(seg.start, seg.end + 1).map((log, k) => {
                const i = seg.start + k
                const selected = i === current
                const event = log.events.length > 0
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSelect(i)}
                    title={turnTitle(log)}
                    aria-label={turnTitle(log)}
                    aria-pressed={selected}
                    className="group relative flex h-6 min-w-2.5 flex-1 justify-center hover:bg-ink-3"
                  >
                    <span
                      className={
                        selected
                          ? 'h-6 w-[3px] bg-kapton'
                          : `w-px ${event ? 'h-4 bg-caution' : 'h-2.5'} ${!event ? (i < current ? 'bg-paper-dim' : 'bg-rule-strong') : ''}`
                      }
                    />
                    {event && !selected && <span className="absolute bottom-0 h-1.5 w-1.5 bg-caution" aria-hidden="true" />}
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
