import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getGlossaryEntry } from '../data/glossary'

interface TooltipProps {
  term: string
  children: React.ReactNode
}

/**
 * A word with its glossary explanation. It opens on hover and on keyboard focus,
 * closes with Escape, and screen readers read the explanation as its description.
 */
export function Tooltip({ term, children }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const id = useId()

  const entry = useMemo(() => getGlossaryEntry(term) ?? null, [term])

  const later = (open: boolean, ms: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setIsOpen(open), ms)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsOpen(false)
  }

  if (!entry) {
    return <>{children}</>
  }

  return (
    <span
      tabIndex={0}
      aria-describedby={id}
      className="pointer-events-auto relative cursor-help border-b border-dotted border-current focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-blue-400"
      onMouseEnter={() => later(true, 300)}
      onMouseLeave={() => later(false, 100)}
      onFocus={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setIsOpen(true)
      }}
      onBlur={() => setIsOpen(false)}
      onKeyDown={onKeyDown}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={`absolute bottom-full left-1/2 z-50 mb-2 block w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900/95 p-3 text-left text-sm font-normal normal-case tracking-normal shadow-2xl backdrop-blur ${
          isOpen ? '' : 'hidden'
        }`}
        onMouseEnter={() => later(true, 0)}
        onMouseLeave={() => later(false, 100)}
      >
        <span className="block font-semibold text-orange-300">{entry.term}</span>
        <span className="mt-1 block text-slate-200">{entry.definition}</span>
        {entry.example && <span className="mt-2 block text-xs text-slate-300">Example: {entry.example}</span>}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
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
