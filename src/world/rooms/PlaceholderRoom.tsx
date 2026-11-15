import type { MinigameProps } from '../../minigames/contract'

/**
 * Wave 0 stand-in for a room's mini game: keeps the current design and finishes.
 * Each Wave 2 work package replaces this in the registry with its own mini game.
 */
export default function PlaceholderRoom({ onComplete, onExit }: MinigameProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-paper">
      <div className="fp-label">Mini game coming soon</div>
      <div className="flex gap-3">
        <button type="button" className="fp-btn-secondary" onClick={onExit}>
          Back to campus
        </button>
        <button
          type="button"
          className="fp-btn-primary"
          data-testid="room-complete"
          onClick={() => onComplete({ patch: {}, insights: [], durationS: 0 })}
        >
          Complete
        </button>
      </div>
    </div>
  )
}
