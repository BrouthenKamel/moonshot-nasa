import { useEffect, useRef, useState } from 'react'
import { useAudioSettings } from '../../assets/audio'
import { useGraphics } from '../../scene/space/quality'

/**
 * Sound and picture settings: a speaker button that mutes, and a small panel with
 * volumes and the graphics quality. `tone` matches the bar it sits in.
 */
export function AudioControls({ tone = 'dark' }: { tone?: 'dark' | 'navy' }) {
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

  const btn =
    tone === 'navy'
      ? 'border-white/20 bg-white/5 text-slate-100 hover:bg-white/10'
      : 'border-white/15 bg-[#0a1122] text-slate-200 hover:border-white/30 hover:bg-[#0f1930]'
  return (
    <div ref={box} className="relative flex items-center gap-1.5">
      <button
        onClick={() => setMuted(!muted)}
        aria-pressed={muted}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Sound off' : 'Sound on'}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${btn}`}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Sound and graphics settings"
        title="Sound and graphics"
        className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${btn}`}
      >
        ⚙
      </button>
      {open && (
        <div className="hud-panel absolute right-0 top-10 z-50 w-64 rounded-xl p-4 text-sm text-slate-200">
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Audio &amp; Telemetry
          </div>
          {(['music', 'sfx', 'voice'] as const).map((g) => (
            <label key={g} className="mb-2.5 flex items-center justify-between gap-3">
              <span className="w-16 font-mono text-xs text-slate-300">
                {g === 'sfx' ? 'Effects' : g === 'voice' ? 'Voice' : 'Music'}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume[g]}
                onChange={(e) => setVolume(g, +e.target.value)}
                className="tactical-range flex-1 accent-orange-500"
              />
            </label>
          ))}
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">Graphics</div>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Graphics quality">
              {(['high', 'low'] as const).map((q) => (
                <button
                  key={q}
                  role="radio"
                  aria-checked={quality === q}
                  onClick={() => setQuality(q)}
                  className={`flex-1 rounded-lg border px-2 py-1 font-mono text-xs font-semibold transition ${
                    quality === q
                      ? 'border-orange-400/70 bg-orange-500 text-white shadow-[0_0_12px_rgba(249,115,22,0.4)]'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {q === 'high' ? 'Cinematic' : 'Fast'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
