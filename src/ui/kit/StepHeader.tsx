import type { ReactNode } from 'react'
import type { DesignStep } from '../../sim/types'
import { STEP_QUESTION, stepNumber } from './stepNumbers'

/** A flight-plan title block: step number, title, the step's one question, and a right-hand slot */
export function StepHeader({
  step,
  title,
  kicker,
  question,
  children,
  className = '',
}: {
  step: DesignStep
  title: ReactNode
  kicker?: ReactNode
  question?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const n = stepNumber(step)
  return (
    <div className={`hud-step-header flex flex-wrap items-end justify-between gap-4 px-5 py-4 ${className}`}>
      <div className="min-w-0">
        {kicker && <div className="fp-label text-[var(--role-accent)]">{kicker}</div>}
        <h1 className="mt-1 flex items-baseline gap-3 fp-display text-2xl text-paper">
          <span className="fp-data text-base font-medium text-paper-faint">{String(n).padStart(2, '0')}</span>
          <span>{title}</span>
        </h1>
        <p className="mt-1 text-sm text-paper-dim">{question ?? STEP_QUESTION[step]}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
