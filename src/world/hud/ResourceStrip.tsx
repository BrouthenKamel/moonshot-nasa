import { useState } from 'react'
import type { ResourceId, ResourceTone } from './resources'
import { useResourcePips } from './useResourcePips'

const TONE: Record<ResourceTone, string> = {
  go: 'var(--color-go)',
  caution: 'var(--color-caution)',
  nogo: 'var(--color-nogo)',
}

/**
 * Craft status: one row of six small pips (mass, power, budget, data, comms, time).
 * A pip is grey "?" until its room is done, then a colour dot and a number.
 * Hover or tap a pip for one plain-English line. One HUD element, no panel.
 */
export function ResourceStrip() {
  const pips = useResourcePips()
  const [hover, setHover] = useState<ResourceId | null>(null)
  const [pinned, setPinned] = useState<ResourceId | null>(null)
  const open = hover ?? pinned
  const detail = pips.find((p) => p.id === open)?.detail

  return (
    // z-30: above drei <Html> overlays (HQ flip-board, door labels), which sit in the 0–10 range
    // Top-left, beside (not over) the HQ flip-board, which the follow-cam keeps near the top centre
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex flex-col items-start gap-1 whitespace-nowrap">
      <ul
        data-testid="resource-strip"
        aria-label="Craft status"
        className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-ink-0/70 px-1.5 py-1 text-[11px] text-paper shadow"
      >
        {pips.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              data-resource={p.id}
              data-unlocked={p.unlocked}
              aria-label={`${p.label}: ${p.unlocked ? p.value : 'not measured yet'}`}
              aria-pressed={pinned === p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.id)}
              onBlur={() => setHover(null)}
              onClick={() => setPinned((cur) => (cur === p.id ? null : p.id))}
              className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors hover:bg-ink-3 ${
                pinned === p.id ? 'bg-ink-3' : ''
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: p.unlocked ? TONE[p.tone] : 'var(--color-paper-faint)' }}
              />
              <span className="text-[10px] uppercase tracking-[0.06em] text-paper-dim">{p.label}</span>
              <span className={`font-semibold tabular-nums ${p.unlocked ? '' : 'text-paper-faint'}`}>
                {p.unlocked ? p.value : '?'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {detail && (
        <p data-testid="resource-detail" role="status" className="max-w-[90vw] whitespace-normal rounded-full bg-ink-0/70 px-3 py-0.5 text-left text-[11px] text-paper-dim">
          {detail}
        </p>
      )}
    </div>
  )
}
