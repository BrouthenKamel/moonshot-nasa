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
      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
  return (
    <div ref={box} className="relative flex items-center gap-1">
      <button
        onClick={() => setMuted(!muted)}
        aria-pressed={muted}
        aria-label={muted ? 'Turn the sound on' : 'Mute'}
        title={muted ? 'Sound off' : 'Sound on'}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${btn}`}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Sound and graphics settings"
        title="Sound and graphics"
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${btn}`}
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-sm text-slate-200 shadow-2xl backdrop-blur">
          {(['music', 'sfx', 'voice'] as const).map((g) => (
            <label key={g} className="mb-2 flex items-center justify-between gap-3">
              <span className="w-16">{g === 'sfx' ? 'Effects' : g === 'voice' ? 'Voice' : 'Music'}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume[g]}
                onChange={(e) => setVolume(g, +e.target.value)}
                className="flex-1 accent-orange-500"
              />
            </label>
          ))}
          <div className="mt-3 border-t border-slate-700 pt-3">
            <div className="mb-1.5 text-xs uppercase tracking-wider text-slate-400">Graphics</div>
            <div className="flex gap-1" role="radiogroup" aria-label="Graphics quality">
              {(['high', 'low'] as const).map((q) => (
                <button
                  key={q}
                  role="radio"
                  aria-checked={quality === q}
                  onClick={() => setQuality(q)}
                  className={`flex-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                    quality === q ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
