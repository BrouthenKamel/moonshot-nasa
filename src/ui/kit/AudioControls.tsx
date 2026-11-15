import { useEffect, useRef, useState } from 'react'
import { useAudioSettings } from '../../assets/audio'
import { useGraphics } from '../../scene/space/quality'

const ICON = {
  on: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12',
  off: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
} as const

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="square">
      <path d={d} />
    </svg>
  )
}

/**
 * Sound and picture settings: a speaker button that mutes, and a small sheet with
 * volumes and the graphics quality. `tone` is kept for callers; every bar is ink now.
 * `onStartOver` adds a "Start over" action at the foot of the sheet (the base screen uses it).
 */
export function AudioControls({ onStartOver }: { tone?: 'dark' | 'navy'; onStartOver?: () => void } = {}) {
  const { muted, setMuted, volume, setVolume } = useAudioSettings()
  const quality = useGraphics((s) => s.quality)
  const setQuality = useGraphics((s) => s.setQuality)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const btn = 'flex h-8 w-8 items-center justify-center border border-rule text-paper-dim transition-colors hover:border-rule-strong hover:bg-ink-3 hover:text-paper'
  return (
    <div ref={box} className="relative flex items-center gap-1">
      <button
        onClick={() => setMuted(!muted)}
        aria-pressed={muted}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Sound off' : 'Sound on'}
        className={`${btn} ${muted ? 'text-nogo' : ''}`}
      >
        <Glyph d={muted ? ICON.off : ICON.on} />
      </button>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Sound and graphics settings"
        title="Sound and graphics"
        className={`${btn} ${open ? 'border-kapton text-paper' : ''}`}
      >
        <Glyph d={ICON.settings} />
      </button>
      {open && (
        <div className="fp-sheet absolute right-0 top-10 z-50 w-64 p-4 text-sm text-paper" data-tone="raised">
          <div className="fp-label mb-3 border-b border-rule pb-1.5">Audio &amp; Telemetry</div>
          {(['music', 'sfx', 'voice'] as const).map((g) => (
            <label key={g} className="mb-2.5 flex items-center justify-between gap-3">
              <span className="fp-label w-16 text-[0.66rem]">{g === 'sfx' ? 'Effects' : g === 'voice' ? 'Voice' : 'Music'}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume[g]}
                onChange={(e) => setVolume(g, +e.target.value)}
                className="tactical-range flex-1"
              />
              <span className="fp-data w-7 text-right text-[10px] text-paper-faint">{Math.round(volume[g] * 100)}</span>
            </label>
          ))}
          <div className="mt-3 border-t border-rule pt-3">
            <div className="fp-label mb-1.5">Graphics</div>
            <div className="flex border border-rule" role="radiogroup" aria-label="Graphics quality">
              {(['high', 'low'] as const).map((q, i) => (
                <button
                  key={q}
                  role="radio"
                  aria-checked={quality === q}
                  onClick={() => setQuality(q)}
                  className={`fp-label flex-1 px-2 py-1 text-[0.66rem] transition-colors ${i > 0 ? 'border-l border-rule' : ''} ${
                    quality === q ? '!text-kapton-ink bg-kapton' : 'hover:bg-ink-3 hover:text-paper'
                  }`}
                >
                  {q === 'high' ? 'Cinematic' : 'Fast'}
                </button>
              ))}
            </div>
          </div>
          {onStartOver && (
            <div className="mt-3 border-t border-rule pt-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onStartOver()
                }}
                className="fp-btn-secondary w-full justify-center !py-1.5"
              >
                Start over
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
