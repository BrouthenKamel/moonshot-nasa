import { useAudioSettings } from '../../assets/audio'

/** Subtitles for the voice loop: what mission control just said. Shown even with the sound off. */
export function Captions() {
  const caption = useAudioSettings((s) => s.caption)
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[72px] z-[60] flex justify-center px-4">
      {caption && (
        <div className="hud-panel caption-in flex max-w-xl items-center gap-3 rounded-full border-[var(--role-border)] px-5 py-2 text-sm text-slate-100">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-300/90">Loop</span>
          <span>{caption}</span>
        </div>
      )}
    </div>
  )
}
