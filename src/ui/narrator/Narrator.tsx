import { useEffect, useMemo, useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { computeBudgets } from '../../sim/budgets'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { NARRATOR_NAME, NARRATOR_ROLE, beatKey, pickBeat, type InstrumentFacts } from './beats'
import { useNarratorPrefs } from './narratorPrefs'
import { Portrait } from './Portrait'

/**
 * The mission mentor: a small portrait with a speech bubble in the bottom-left corner.
 * Shows the line for the current moment once, never takes focus, and closes with ×,
 * Escape or a click on the bubble. Mounted once over every screen (src/App.tsx).
 */
export function Narrator() {
  const screen = useGameStore((s) => s.screen)
  const designStep = useGameStore((s) => s.designStep)
  const visitedSteps = useGameStore((s) => s.visitedSteps)
  const sim = useGameStore((s) => s.simState)
  const report = useGameStore((s) => s.currentReport)
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)

  const tipsOff = useNarratorPrefs((s) => s.tipsOff)
  const seen = useNarratorPrefs((s) => s.seen)
  const markSeen = useNarratorPrefs((s) => s.markSeen)
  const setTipsOff = useNarratorPrefs((s) => s.setTipsOff)

  const beat = useMemo(() => {
    const budgets = computeBudgets(design, difficulty)
    const instruments: InstrumentFacts[] = design.instruments
      .map((id) => getPartById(id) as InstrumentPart | undefined)
      .filter((p): p is InstrumentPart => !!p)
      .map((p) => ({ name: p.name, seesShadow: p.seesShadow, maxAltitudeKm: p.maxAltitudeKm, flownOn: p.flownOn }))
    return pickBeat({ screen, designStep, visitedSteps, sim, report, budgets, goNoGo: getGoNoGo(), instruments })
  }, [screen, designStep, visitedSteps, sim, report, design, difficulty, getGoNoGo])

  const key = beat ? beatKey(beat, sim?.seed) : null
  const [shownKey, setShownKey] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // A new moment with a line not heard yet: show it (state adjusted during render, as React advises)
  if (key && !tipsOff && !seen.includes(key) && key !== shownKey) {
    setShownKey(key)
    setMenuOpen(false)
  }
  // ...and remember in localStorage that it was heard
  useEffect(() => {
    if (shownKey) markSeen(shownKey)
  }, [shownKey, markSeen])

  const visible = !!beat && !tipsOff && key === shownKey

  const close = () => {
    setShownKey(null)
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible])

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 w-[min(22rem,calc(100vw-2rem))]">
      {/* Always mounted, so screen readers announce each new line politely */}
      <div aria-live="polite" aria-atomic="true">
        {visible && beat && (
          <section
            aria-label={`${NARRATOR_NAME}, mission mentor`}
            data-beat={beat.id}
            className="pointer-events-auto flex items-end gap-2"
          >
            <div className="shrink-0 drop-shadow-lg">
              <Portrait />
            </div>
            <div
              onClick={close}
              className="relative flex-1 cursor-pointer rounded-2xl rounded-bl-sm border border-orange-400/60 bg-[#fbf7ef] px-3 pb-2.5 pt-2 text-sm text-[#14213d] shadow-xl"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-display text-xs font-semibold uppercase tracking-wide text-orange-700">
                  {NARRATOR_NAME}
                  <span className="sr-only">: {NARRATOR_ROLE}.</span>
                </div>
                <div className="-mr-1 -mt-0.5 flex items-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    aria-label="Narrator options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((o) => !o)}
                    className="rounded px-1.5 text-base leading-none text-slate-500 hover:bg-black/5 hover:text-slate-800"
                  >
                    <span aria-hidden="true">⋯</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Close tip"
                    onClick={close}
                    className="rounded px-1.5 text-base leading-none text-slate-500 hover:bg-black/5 hover:text-slate-800"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                  {menuOpen && (
                    <div role="menu" className="absolute right-2 top-8 z-10 rounded-lg border border-slate-300 bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setTipsOff(true)
                          close()
                        }}
                        className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                      >
                        Don’t show tips
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-0.5 leading-snug">{beat.text}</p>
            </div>
          </section>
        )}
      </div>
      {tipsOff && (
        <button
          type="button"
          onClick={() => setTipsOff(false)}
          aria-label={`Show tips from ${NARRATOR_NAME} again`}
          title="Show tips again"
          className="pointer-events-auto rounded-full opacity-60 hover:opacity-100 focus:opacity-100"
        >
          <Portrait size={32} />
        </button>
      )}
    </div>
  )
}
