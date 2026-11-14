import { useEffect, useState } from 'react'
import { MissionView } from '../scene/MissionView'
import { useGameStore } from '../state/gameStore'
import type { Design, TurnLog } from '../sim/types'
import { ReplayTimeline } from './ReplayTimeline'
import { TurnDetail } from './TurnDetail'

interface ReplayPanelProps {
  design: Design
  logs: TurnLog[]
  terminal?: 'complete' | 'failed'
  compact?: boolean
}

const PLAY_INTERVAL_MS = 1000

export function ReplayPanel({ design, logs, terminal, compact = false }: ReplayPanelProps) {
  const replayTurn = useGameStore((s) => s.replayTurn)
  const setReplayTurn = useGameStore((s) => s.setReplayTurn)
  const [playRequested, setPlaying] = useState(false)

  const last = logs.length - 1
  const turnIndex = Math.min(Math.max(0, replayTurn), Math.max(0, last))

  // Play stops by itself at the last turn
  const playing = playRequested && turnIndex < last

  useEffect(() => {
    if (!playing) return
    const id = setTimeout(() => setReplayTurn(turnIndex + 1), PLAY_INTERVAL_MS)
    return () => clearTimeout(id)
  }, [playing, turnIndex, last, setReplayTurn])

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (turnIndex >= last) setReplayTurn(0)
    setPlaying(true)
  }

  const select = (i: number) => {
    setPlaying(false)
    setReplayTurn(i)
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-lg bg-slate-900 p-4 text-sm text-slate-400">
        No months flown yet. Advance a month to see the mission.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <MissionView
        design={design}
        logs={logs}
        turnIndex={turnIndex}
        terminal={terminal}
        className={compact ? 'h-64' : 'h-[28rem]'}
      />
      <ReplayTimeline
        logs={logs}
        turnIndex={turnIndex}
        onSelect={select}
        playing={playing}
        onTogglePlay={togglePlay}
      />
      <TurnDetail log={logs[turnIndex]} design={design} />
    </div>
  )
}
