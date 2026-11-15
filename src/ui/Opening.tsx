import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { useUiStore } from '../state/uiStore'

const OpeningScene = lazy(() => import('../scene/opening/OpeningScene').then((m) => ({ default: m.OpeningScene })))

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * The opening curtain: shown once per session before the agency map. It is not a game
 * screen (the game still starts on the base); the click that lifts it also lets the
 * browser start the music.
 */
export function Opening({ onBegin }: { onBegin?: () => void }) {
  const finishOpening = useUiStore((s) => s.finishOpening)
  const [leaving, setLeaving] = useState(false)

  const begin = () => {
    if (leaving) return
    setLeaving(true)
    onBegin?.()
    window.setTimeout(finishOpening, 900)
  }

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-ink-0 text-paper transition-opacity duration-[900ms] ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <SceneBoundary>
        <Suspense fallback={null}>
          <OpeningScene />
        </Suspense>
      </SceneBoundary>

      {/* Darker edges so the words stay readable over the picture */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_30%,rgba(7,9,13,0.7)_100%)]" />

      {/* Corner registration marks, as on a printed flight plan */}
      <div className="pointer-events-none absolute inset-4 sm:inset-6" aria-hidden="true">
        <span className="absolute top-0 left-0 h-5 w-5 border-t border-l border-paper-faint/80" />
        <span className="absolute top-0 right-0 h-5 w-5 border-t border-r border-paper-faint/80" />
        <span className="absolute bottom-0 left-0 h-5 w-5 border-b border-l border-paper-faint/80" />
        <span className="absolute right-0 bottom-0 h-5 w-5 border-r border-b border-paper-faint/80" />
      </div>

      <div className="absolute inset-0 flex flex-col justify-between p-8 sm:p-14">
        <div className="opening-rise max-w-2xl">
          <div className="fp-label flex items-center gap-3 border-y border-rule-strong py-2 text-paper-dim">
            <span className="h-2 w-2 bg-kapton" aria-hidden="true" />
            <span>NASA SPACE APPS · LUNAR ICE MAPPER · 6U CUBESAT</span>
          </div>
          <h1 className="fp-display mt-6 text-7xl leading-[0.85] text-paper sm:text-9xl">Moonshot</h1>
          <div className="mt-4 h-px w-full bg-rule-strong" aria-hidden="true" />
          <p className="mt-5 max-w-md text-lg leading-relaxed text-paper-dim">
            Run a small space agency. Design one CubeSat, fly it to the Moon and find the ice hidden in craters that never
            see the Sun.
          </p>
          <button
            onClick={begin}
            autoFocus
            style={{ padding: '0.85rem 2.75rem', fontSize: '1rem' }}
            className="fp-btn-primary mt-9 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
          >
            Begin
          </button>
        </div>
        <div className="opening-rise fp-data text-xs leading-relaxed text-paper-faint">
          Moon, Earth and stars drawn from NASA data: LRO, LOLA, Blue Marble, Deep Star Maps.
          <br />
          Mission numbers from NASA CubeSat 101 and the Lunar IceCube, Lunar Flashlight and LunaH-Map missions.
        </div>
      </div>
    </div>
  )
}
