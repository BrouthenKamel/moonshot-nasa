import { useState, useRef, useMemo } from 'react'
import { getGlossaryEntry } from '../data/glossary'

interface TooltipProps {
  term: string
  children: React.ReactNode
}

export function Tooltip({ term, children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const entry = useMemo(() => getGlossaryEntry(term) ?? null, [term])

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setIsOpen(true), 300)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setIsOpen(false), 100)
  }

  if (!entry) {
    return <>{children}</>
  }

  return (
    <span
      className="pointer-events-auto relative cursor-help border-b border-dotted border-current/60"
      tabIndex={0}
      aria-describedby={isOpen ? `glossary-${term}` : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {children}
      {isOpen && (
        <div
          id={`glossary-${term}`}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900/95 p-3 text-left text-sm normal-case tracking-normal shadow-2xl backdrop-blur"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="font-semibold text-orange-300">{entry.term}</div>
          <div className="mt-1 text-slate-300">{entry.definition}</div>
          {entry.example && (
            <div className="mt-2 text-xs text-slate-400">
              Example: {entry.example}
            </div>
          )}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </span>
  )
}

interface ExplainProps {
  children: React.ReactNode
  explanation: string
}

export function Explain({ children, explanation }: ExplainProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <span className="relative">
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-xs text-slate-400 hover:bg-slate-600 hover:text-slate-300"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Explain"
      >
        ?
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-800 p-3 text-sm shadow-lg">
            <div className="font-semibold text-slate-300">{children}</div>
            <div className="mt-1 text-slate-400">{explanation}</div>
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
          </div>
        </>
      )}
    </span>
  )
}
