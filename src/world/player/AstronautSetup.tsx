import { useState } from 'react'
import { useCampusStore } from '../../state/campusStore'
import { usePlayerStore } from './playerStore'

const SUIT_COLORS = ['#f2a541', '#5ee6f0', '#e0624d', '#7fcf8a', '#b58cf0'] as const

/** Name + suit stripe picker, shown once when the campus first loads. */
export function AstronautSetup() {
  const done = usePlayerStore((s) => s.setupDone)
  const complete = usePlayerStore((s) => s.completeSetup)
  const setAstronaut = useCampusStore((s) => s.setAstronaut)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(SUIT_COLORS[0])
  if (done) return null

  const begin = () => {
    setAstronaut(name.trim() || 'Rookie', color)
    complete()
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-ink-0/70 backdrop-blur-sm"
      data-testid="astronaut-setup"
    >
      <form
        className="w-[min(22rem,90vw)] rounded-2xl border border-rule-strong bg-ink-1/95 p-6 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          begin()
        }}
      >
        <div className="fp-label">Crew roster</div>
        <h2 className="fp-display mt-1 text-2xl text-paper">Who are you, rookie?</h2>
        <input
          autoFocus
          value={name}
          maxLength={18}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Astronaut name"
          className="mt-5 w-full rounded-lg border border-rule bg-ink-2 px-3 py-2 text-paper outline-none placeholder:text-paper-faint focus:border-kapton"
        />
        <div className="fp-label mt-5">Suit stripe</div>
        <div className="mt-2 flex gap-3" role="radiogroup" aria-label="Suit colour">
          {SUIT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={`Suit colour ${c}`}
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={`h-9 w-9 rounded-full transition-transform ${
                c === color ? 'scale-110 ring-2 ring-paper ring-offset-2 ring-offset-ink-1' : 'opacity-80 hover:opacity-100'
              }`}
            />
          ))}
        </div>
        <button
          type="submit"
          data-testid="astronaut-begin"
          className="mt-6 w-full rounded-lg bg-kapton py-2.5 font-semibold text-kapton-ink transition-colors hover:bg-orange-300"
        >
          Begin
        </button>
      </form>
    </div>
  )
}
