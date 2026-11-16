import { useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { useUiStore } from '../../state/uiStore'
import { autoFix, causeStreak, fixLabel, type FixCause } from './fixIt'

/**
 * The Fix button with its hint ladder (Ideas round 32). First failure for a cause: a plain button into the step.
 * The second time in a row for the same cause: the button pulses, and the step it opens highlights the control.
 * The third time: it also offers "Let me set it for you", which applies the fix and says what changed.
 */
export function FixAction({ cause, onBefore, className = 'fp-btn-primary' }: { cause: FixCause; onBefore?: () => void; className?: string }) {
  const reviseAt = useGameStore((s) => s.reviseAt)
  const updateDesign = useGameStore((s) => s.updateDesign)
  const design = useGameStore((s) => s.design)
  const history = useGameStore((s) => s.runHistory)
  const setFixHint = useUiStore((s) => s.setFixHint)
  const [changes, setChanges] = useState<string[] | null>(null)

  const streak = causeStreak(history, cause)
  const hinted = streak >= 2
  const fix = streak >= 3 && !changes ? autoFix(design, cause) : null

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        data-testid="fix-button"
        data-pulsing={hinted ? 'true' : 'false'}
        onClick={() => {
          onBefore?.()
          if (hinted) setFixHint({ step: cause.step, decision: cause.decision, why: cause.why })
          reviseAt(cause.step)
        }}
        className={`${className} shrink-0 ${hinted ? 'animate-pulse ring-2 ring-kapton ring-offset-2 ring-offset-ink-2' : ''}`}
        aria-label={`Fix ${cause.decision} at the ${cause.buildingName}`}
      >
        {fixLabel(cause)}
      </button>
      {fix && (
        <button
          type="button"
          data-testid="fix-for-me"
          onClick={() => {
            updateDesign(fix.patch)
            setChanges(fix.changes)
          }}
          className="fp-btn-secondary"
        >
          Let me set it for you
        </button>
      )}
      {changes && (
        <div className="flex flex-wrap items-center gap-3">
          <ul data-testid="fix-changes" className="text-xs text-go" role="status">
            {changes.map((c) => (
              <li key={c}>Changed · {c}</li>
            ))}
          </ul>
          {/* Straight to Go with the fixed design */}
          <button
            type="button"
            data-testid="relaunch-now"
            onClick={() => {
              onBefore?.()
              reviseAt('go-nogo')
            }}
            className="fp-btn-primary"
          >
            Relaunch now
          </button>
        </div>
      )}
    </div>
  )
}
