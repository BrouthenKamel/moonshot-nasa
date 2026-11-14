import { useAudioSettings } from '../assets/audio'

const muteLabel = (muted: boolean) => (muted ? 'Unmute sound' : 'Mute sound')

/** Sound on/off for the whole game; the choice is remembered in localStorage. */
export function MuteButton() {
  const muted = useAudioSettings((s) => s.muted)
  const setMuted = useAudioSettings((s) => s.setMuted)
  const label = muteLabel(muted)
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-lg hover:bg-white/10"
    >
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
    </button>
  )
}
