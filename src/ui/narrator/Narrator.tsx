import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '../../state/gameStore'
import { computeBudgets } from '../../sim/budgets'
import { getPartById, type InstrumentPart } from '../../data/parts'
import { NARRATOR_NAME, NARRATOR_ROLE, beatKey, pickBeat, type InstrumentFacts } from './beats'
import { useNarratorPrefs } from './narratorPrefs'
import { coversContent, pageContent, quietCorner, type Corner } from './overlap'
import { Portrait } from './Portrait'

/**
 * The mission mentor: a small portrait with a radio-transcript slip in the bottom-left corner.
 * Shows the line for the current moment once, never takes focus, and closes with × or Escape.
 * Mounted once over every screen (src/App.tsx).
 *
 * The slip never covers anything the player is reading: when it would land on text or a control
 * it folds into the portrait with a dot, and a click on the portrait opens it. The check looks at
 * the page itself (see overlap.ts), so it works the same on every screen and window size.
 */

/** How often the page is re-checked while a line waits (content moves as screens load and resize) */
const RECHECK_MS = 400

/** Size of the folded portrait, in pixels */
const FOLDED_PX = 30

const CORNER_STYLE: Record<Corner, React.CSSProperties> = {
  bl: { left: 8, bottom: 8 },
  br: { right: 8, bottom: 8 },
  tr: { right: 8, top: 8 },
  tl: { left: 8, top: 8 },
}

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
  // The player opened a folded slip: it stays open, wherever it sits
  const [opened, setOpened] = useState(false)
  // The slip would sit on text or a control
  const [crowded, setCrowded] = useState(false)
  // Where the folded icon sits: the first window corner with no text or control under it
  const [corner, setCorner] = useState<Corner>('bl')
  const rootRef = useRef<HTMLDivElement>(null)
  const slipRef = useRef<HTMLElement>(null)

  // A new moment with a line not heard yet: show it (state adjusted during render, as React advises)
  if (key && !tipsOff && !seen.includes(key) && key !== shownKey) {
    setShownKey(key)
    setOpened(false)
  }
  // ...and remember in localStorage that it was heard
  useEffect(() => {
    if (shownKey) markSeen(shownKey)
  }, [shownKey, markSeen])

  const visible = !!beat && !tipsOff && key === shownKey

  const close = () => {
    setShownKey(null)
    setOpened(false)
  }

  // Is the slip on top of content? Re-checked while a line waits, because screens fill in late.
  useEffect(() => {
    if (!visible || opened) return
    let timer: number | undefined
    const check = () => {
      const slip = slipRef.current
      if (!slip) return
      const r = slip.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const content = Array.from(pageContent(rootRef.current))
      const crowdedNow = coversContent({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, content)
      setCrowded(crowdedNow)
      if (crowdedNow) setCorner(quietCorner(content, { width: window.innerWidth, height: window.innerHeight }, FOLDED_PX))
    }
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, RECHECK_MS)
    }
    check()
    later()
    const watch = new MutationObserver(later)
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', later)
    return () => {
      window.clearTimeout(timer)
      watch.disconnect()
      window.removeEventListener('resize', later)
    }
  }, [visible, opened, shownKey, screen, designStep])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible])

  // In the design steps the mentor lives in the step rail's empty lower half (the rail is
  // w-48), so the bubble never covers a card tray or catches clicks meant for the step.
  const inRail = screen === 'design'

  const folded = visible && crowded && !opened

  return (
    <div
      ref={rootRef}
      className={
        inRail
          ? 'pointer-events-none fixed bottom-3 left-2 z-40 w-44'
          : 'pointer-events-none fixed bottom-4 left-4 z-40 w-[min(22rem,calc(100vw-2rem))]'
      }
    >
      {/* Always mounted, so screen readers announce each new line politely */}
      <div aria-live="polite" aria-atomic="true">
        {visible && beat && (
          <section
            ref={slipRef}
            aria-label={`${NARRATOR_NAME}, mission mentor`}
            data-beat={beat.id}
            // Folded: kept in layout so it can still be measured, but out of sight and out of reach
            className={`${inRail ? 'flex flex-col items-start gap-1.5' : 'flex items-end gap-2'} ${folded ? 'invisible' : 'pointer-events-auto'}`}
          >
            <div className="shrink-0">
              <Portrait />
            </div>
            <div
              style={{ borderLeft: '2px solid var(--color-kapton)' }}
              className={`fp-sheet relative ${inRail ? 'w-full text-[13px]' : 'flex-1 text-sm'} px-3 pb-2 pt-2 pr-7 text-paper`}
            >
              <span className="sr-only">
                {NARRATOR_NAME}: {NARRATOR_ROLE}.
              </span>
              <button
                type="button"
                aria-label="Close tip"
                onClick={close}
                className="absolute right-0.5 top-0.5 px-1.5 text-base leading-none text-paper-faint hover:bg-ink-3 hover:text-paper"
              >
                <span aria-hidden="true">×</span>
              </button>
              <p className="leading-snug text-paper">{beat.text}</p>
              <button
                type="button"
                onClick={() => {
                  setTipsOff(true)
                  close()
                }}
                className="mt-1.5 text-[11px] text-paper-faint underline hover:text-paper"
              >
                Don’t show tips
              </button>
            </div>
          </section>
        )}
      </div>
      {folded && (
        <button
          type="button"
          onClick={() => setOpened(true)}
          aria-label={`New tip from ${NARRATOR_NAME}`}
          data-testid="narrator-folded"
          data-corner={corner}
          style={CORNER_STYLE[corner]}
          className="pointer-events-auto fixed block"
        >
          <Portrait size={FOLDED_PX} />
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-ink-0 bg-kapton" />
        </button>
      )}
      {tipsOff && (
        <button
          type="button"
          onClick={() => setTipsOff(false)}
          aria-label={`Show tips from ${NARRATOR_NAME} again`}
          title="Show tips again"
          className="pointer-events-auto opacity-60 hover:opacity-100 focus:opacity-100"
        >
          <Portrait size={32} />
        </button>
      )}
    </div>
  )
}
