import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { canUseWebGL } from '../scene/webgl'
import { flightShot } from './flight/flightDirector'
import { useGameStore } from '../state/gameStore'
import type { Design, TurnLog } from '../sim/types'
import { ReplayTimeline } from './ReplayTimeline'
import { TurnDetail } from './TurnDetail'

const FlightView = lazy(() => import('../scene/flight/FlightView').then((m) => ({ default: m.FlightView })))

class ViewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Where the craft is, in words, where the 3D view cannot be drawn */
function PlainPose({ label }: { label: string }) {
  return <div className="rounded-xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-200">{label}</div>
}

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

  const cinematic = useMemo(() => canUseWebGL(), [])
  const shot = useMemo(() => flightShot(design, logs, turnIndex, { terminal }), [design, logs, turnIndex, terminal])

  const poseLabel = `Month ${shot.turn} · ${
    shot.stage === 'ground' ? 'on the ground' : shot.stage === 'transfer' ? `on the way to the Moon (${Math.round(shot.transferT * 100)}%)` : `in lunar orbit · ice ${(shot.coverage * 100).toFixed(1)}%`
  }`

  const select = (i: number) => {
    setPlaying(false)
    setReplayTurn(i)
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-lg bg-slate-900 p-4 text-sm text-slate-400">
        No turns yet. Advance a turn to see the mission.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {cinematic ? (
        <div className={`relative w-full overflow-hidden rounded-xl bg-black ${compact ? 'h-64' : 'h-[30rem]'}`}>
          <ViewBoundary fallback={<PlainPose label={poseLabel} />}>
            <Suspense fallback={null}>
              <FlightView design={design} shot={shot} />
            </Suspense>
          </ViewBoundary>
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs text-slate-200">{poseLabel}</div>
        </div>
      ) : (
        <PlainPose label={poseLabel} />
      )}
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
