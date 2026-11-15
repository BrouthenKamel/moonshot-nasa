import { useEffect } from 'react'
import { create } from 'zustand'
import { useAudioSettings } from '../../assets/audio'

/**
 * Where the voice loop's caption shows. By default a toast under the top bar (App renders it once).
 * A screen can host it in its own body instead (Go/No-Go, QC 15 Nov: the toast covered the header chips
 * and the step tabs); while such a host is mounted, the toast at the top stands aside.
 */
const useCaptionHosts = create<{ hosts: number }>(() => ({ hosts: 0 }))

function Line({ caption }: { caption: string }) {
  return (
    <div className="fp-sheet caption-in flex max-w-xl items-baseline gap-3 border-l-[3px] border-l-go px-4 py-2 text-sm text-paper">
      <span className="fp-label shrink-0 text-[0.62rem] text-go">Loop</span>
      <span>{caption}</span>
    </div>
  )
}

/** Subtitles for the voice loop: what mission control just said. Shown even with the sound off. */
export function Captions() {
  const caption = useAudioSettings((s) => s.caption)
  const hosted = useCaptionHosts((s) => s.hosts > 0)
  if (hosted) return null
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[72px] z-[60] flex justify-center px-4">
      {caption && <Line caption={caption} />}
    </div>
  )
}

/** The caption inside a screen's body; it keeps its height while empty so nothing below jumps */
export function InlineCaptions({ className = '' }: { className?: string }) {
  const caption = useAudioSettings((s) => s.caption)
  useEffect(() => {
    useCaptionHosts.setState((s) => ({ hosts: s.hosts + 1 }))
    return () => useCaptionHosts.setState((s) => ({ hosts: s.hosts - 1 }))
  }, [])
  return (
    <div aria-live="polite" data-testid="inline-captions" className={`flex min-h-[2.4rem] justify-center ${className}`}>
      {caption && <Line caption={caption} />}
    </div>
  )
}
