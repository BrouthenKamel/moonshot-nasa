import type { ReactNode } from 'react'
import type { DesignStep } from '../../../sim/types'
import { Sheet, STEP_QUESTION, stepNumber } from '../../kit'

/**
 * The StepHeader's title block, compact enough to sit over a full-bleed 3D scene:
 * step number, title and the step's one question, on a flat ink sheet.
 */
export function SceneTitle({
  step,
  title,
  question,
  className = '',
  children,
}: {
  step: DesignStep
  title: ReactNode
  /** Overrides the step's one question, for a moment within the step */
  question?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <Sheet tone="flat" className={`border-t-2 border-t-[var(--role-accent)] bg-ink-1 px-3.5 py-2 ${className}`}>
      <div className="flex items-baseline gap-2.5 whitespace-nowrap">
        <span className="fp-data text-sm text-paper-faint">{String(stepNumber(step)).padStart(2, '0')}</span>
        <h1 className="fp-display text-lg leading-none text-paper">{title}</h1>
      </div>
      <p className="mt-1 text-xs text-paper-dim">{question ?? STEP_QUESTION[step]}</p>
      {children}
    </Sheet>
  )
}
