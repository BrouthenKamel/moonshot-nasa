import { useState } from 'react'
import { useGameStore } from '../state/gameStore'
import type { Role, Player } from '../sim/types'

const roles: { id: Role; name: string; color: string }[] = [
  { id: 'ground', name: 'Ground Control', color: 'bg-blue-500' },
  { id: 'science', name: 'Science Lead', color: 'bg-green-500' },
  { id: 'space', name: 'Spacecraft Engineer', color: 'bg-purple-500' },
  { id: 'launch', name: 'Launch Director', color: 'bg-orange-500' },
]

interface TeamSetupProps {
  onComplete: () => void
}

export function TeamSetup({ onComplete }: TeamSetupProps) {
  const setMode = useGameStore((s) => s.setMode)
  const setPlayers = useGameStore((s) => s.setPlayers)

  const [playerNames, setPlayerNames] = useState<Record<Role, string>>({
    ground: '',
    science: '',
    space: '',
    launch: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const players: Player[] = roles
      .filter((r) => playerNames[r.id].trim())
      .map((r) => ({
        name: playerNames[r.id].trim(),
        role: r.id,
      }))

    if (players.length === 0) {
      // Solo mode
      setMode('solo')
      setPlayers([])
    } else {
      setMode('team')
      setPlayers(players)
    }

    onComplete()
  }

  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-4 text-xl font-bold text-slate-200">Team Setup (Optional)</h2>
      <p className="mb-6 text-sm text-slate-400">
        Enter names for each role to play as a team. Leave empty for solo mode.
        Each role takes turns making decisions in their domain.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {roles.map((role) => (
          <div key={role.id} className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${role.color}`} />
            <label className="w-32 text-sm text-slate-300">{role.name}</label>
            <input
              type="text"
              value={playerNames[role.id]}
              onChange={(e) =>
                setPlayerNames((prev) => ({ ...prev, [role.id]: e.target.value }))
              }
              placeholder="Player name"
              className="flex-1 rounded bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={() => {
              setMode('solo')
              setPlayers([])
              onComplete()
            }}
            className="flex-1 rounded-lg bg-slate-700 py-2 text-slate-300 hover:bg-slate-600"
          >
            Play Solo
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-blue-600 py-2 text-white hover:bg-blue-500"
          >
            Start Team Game
          </button>
        </div>
      </form>
    </div>
  )
}

interface SignOffPanelProps {
  requiredRoles: Role[]
}

export function SignOffPanel({ requiredRoles }: SignOffPanelProps) {
  const players = useGameStore((s) => s.players)
  const signOffs = useGameStore((s) => s.signOffs)
  const toggleSignOff = useGameStore((s) => s.toggleSignOff)
  const mode = useGameStore((s) => s.mode)

  if (mode === 'solo') return null

  const relevantPlayers = players.filter((p) => requiredRoles.includes(p.role))
  if (relevantPlayers.length === 0) return null

  const allSigned = requiredRoles.every((role) =>
    signOffs.find((s) => s.role === role)?.approved
  )

  return (
    <div className="rounded-lg bg-slate-900 p-4">
      <div className="text-sm font-medium text-slate-300">Team Sign-Off Required</div>
      <div className="mt-3 space-y-2">
        {relevantPlayers.map((player) => {
          const signOff = signOffs.find((s) => s.role === player.role)
          const role = roles.find((r) => r.id === player.role)

          return (
            <button
              key={player.role}
              onClick={() => toggleSignOff(player.role)}
              className={`flex w-full items-center gap-3 rounded p-2 transition-colors ${
                signOff?.approved
                  ? 'bg-green-900 text-green-300'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span className={`h-3 w-3 rounded-full ${role?.color ?? 'bg-slate-500'}`} />
              <span className="flex-1 text-left">
                {player.name} ({role?.name})
              </span>
              <span className="text-xs">
                {signOff?.approved ? 'Approved' : 'Tap to approve'}
              </span>
            </button>
          )
        })}
      </div>
      {allSigned && (
        <div className="mt-3 text-center text-sm text-green-400">
          All required approvals received
        </div>
      )}
    </div>
  )
}
