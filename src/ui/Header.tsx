import { AudioControls } from './kit/AudioControls'
import { EngineerSwitch } from './kit/EngineerSwitch'
import { useGameStore } from '../state/gameStore'
import { lunarIceMapperBrief } from '../data/brief'
import { StepDock } from './hud/StepDock'
import { ResourceStrip } from './hud/ResourceStrip'

export function Header() {
  const screen = useGameStore((s) => s.screen)
  const simState = useGameStore((s) => s.simState)
  const setScreen = useGameStore((s) => s.setScreen)

  return (
    <header className="border-b border-rule bg-ink-1 select-none">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        {/* Left: the game, the mission and the way back to the base */}
        <div className="flex items-center gap-3">
          <span className="h-3 w-1 shrink-0 bg-[var(--role-accent)]" aria-hidden="true" />
          <h1 className="fp-display text-lg text-paper">Moonshot</h1>
          {screen !== 'title' && <span className="fp-label hidden sm:inline">{lunarIceMapperBrief.name}</span>}
          {screen !== 'title' && (
            <button onClick={() => setScreen('base')} className="fp-btn-secondary ml-2">
              ← Agency base
            </button>
          )}
        </div>

        {/* Right: the mission's readout, then the view and sound settings */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {screen === 'simulation' && simState && (
            <div className="flex flex-wrap items-stretch text-xs">
              <span className="flex flex-col border-l border-rule px-2.5 leading-tight">
                <span className="fp-label text-[0.58rem] text-paper-faint">Clock</span>
                <span className="fp-data text-paper">{`Month ${simState.currentTurn}`}</span>
              </span>
              <span className="flex flex-col border-l border-rule px-2.5 leading-tight">
                <span className="fp-label text-[0.58rem] text-paper-faint">Phase</span>
                <span className="fp-data capitalize text-paper">{simState.phase}</span>
              </span>
              <span className="hidden flex-col border-l border-rule px-2.5 leading-tight md:flex">
                <span className="fp-label text-[0.58rem] text-paper-faint">Ice</span>
                <span className="fp-data text-ice">{simState.coveragePercent.toFixed(0)}%</span>
              </span>
              <span className="eng-only hidden flex-col border-l border-rule px-2.5 leading-tight md:flex">
                <span className="fp-label text-[0.58rem] text-paper-faint">Data</span>
                <span className="fp-data text-paper">{simState.totalDataReturned.toFixed(0)} MB</span>
              </span>
              <span className="eng-only hidden flex-col border-l border-rule px-2.5 leading-tight lg:flex">
                <span className="fp-label text-[0.58rem] text-paper-faint">Delta-v</span>
                <span className="fp-data text-paper">{Math.max(0, simState.fuelRemaining).toFixed(0)} m/s</span>
              </span>
            </div>
          )}
          {screen === 'design' && <ResourceStrip />}
          <EngineerSwitch />
          <AudioControls />
        </div>
      </div>

      {/* The mission design's stages, across the whole screen */}
      {screen === 'design' && <StepDock className="border-t border-rule" />}
    </header>
  )
}
