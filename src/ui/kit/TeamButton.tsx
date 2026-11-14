import { useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { TeamSetup } from '../TeamMode'

/** Solo or a team of up to four (one per role, playing in turns on one screen) */
export function TeamButton() {
  const mode = useGameStore((s) => s.mode)
  const players = useGameStore((s) => s.players)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Play alone or as a team of up to four, one role each"
        className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-bold text-slate-100 hover:bg-white/10"
      >
        👥 {mode === 'team' && players.length > 0 ? `Team of ${players.length}` : 'Solo'}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="event-in w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b1226] p-6 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <TeamSetup onComplete={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
