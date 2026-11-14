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
      className={`fixed inset-0 z-50 overflow-hidden bg-black text-white transition-opacity duration-[900ms] ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <SceneBoundary>
        <Suspense fallback={null}>
          <OpeningScene />
        </Suspense>
      </SceneBoundary>

      {/* Darker edges so the words stay readable over the picture */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_30%,rgba(0,0,0,0.55)_100%)]" />

      <div className="absolute inset-0 flex flex-col justify-between p-8 sm:p-14">
        <div className="opening-rise max-w-xl">
          <div className="font-display text-xs font-semibold uppercase tracking-[0.45em] text-orange-300/90">
            NASA Space Apps · Space Mission Design Game
          </div>
          <h1 className="mt-4 font-display text-6xl font-bold uppercase leading-none tracking-[0.12em] drop-shadow-[0_4px_30px_rgba(0,0,0,0.8)] sm:text-8xl">
            Moonshot
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-slate-200/95">
            Run a small space agency. Design one CubeSat, fly it to the Moon and find the ice hidden in craters that never
            see the Sun.
          </p>
          <button
            onClick={begin}
            autoFocus
            className="mt-9 rounded-full bg-orange-500 px-10 py-3.5 font-display text-lg font-bold uppercase tracking-[0.2em] text-white shadow-[0_0_40px_rgba(249,115,22,0.55)] transition hover:scale-105 hover:bg-orange-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
          >
            Begin
          </button>
        </div>
        <div className="opening-rise text-xs leading-relaxed text-slate-400">
          Moon, Earth and stars drawn from NASA data: LRO, LOLA, Blue Marble, Deep Star Maps.
          <br />
          Mission numbers from NASA CubeSat 101 and the Lunar IceCube, Lunar Flashlight and LunaH-Map missions.
        </div>
      </div>
    </div>
  )
}
