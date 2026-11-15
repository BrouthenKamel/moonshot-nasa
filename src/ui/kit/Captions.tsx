import { useAudioSettings } from '../../assets/audio'

/** Subtitles for the voice loop: what mission control just said. Shown even with the sound off. */
export function Captions() {
  const caption = useAudioSettings((s) => s.caption)
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[72px] z-[60] flex justify-center px-4">
      {caption && (
        <div className="fp-sheet caption-in flex max-w-xl items-baseline gap-3 border-l-[3px] border-l-go px-4 py-2 text-sm text-paper">
          <span className="fp-label shrink-0 text-[0.62rem] text-go">Loop</span>
          <span>{caption}</span>
        </div>
      )}
    </div>
  )
}
