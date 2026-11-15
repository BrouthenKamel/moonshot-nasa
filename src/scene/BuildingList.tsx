import { Component, type ReactNode } from 'react'
import { buildings } from '../data/agency'
import type { BaseMapProps } from './BaseMap'

/**
 * The buildings as a plain list: the base map for a browser without WebGL, or when the
 * 3D map fails. Each button walks into its building, just as clicking it on the map does.
 * Drawn as a flight-plan sheet: one ruled row per building, its state as a 3px left rule.
 */
export function BuildingList({ labels, onBuildingClick }: BaseMapProps) {
  return (
    <div className="hud-grid-bg h-full w-full overflow-y-auto p-4 pb-10 text-paper">
      <h2 className="fp-display text-lg text-paper">Agency base</h2>
      <p className="mt-1 text-sm text-paper-dim">
        {onBuildingClick
          ? 'Click a building to walk in.'
          : 'The craft is flying: the buildings show its state.'}{' '}
        (The 3D map needs WebGL, which this browser has turned off.)
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {buildings.map((b, i) => {
          const label = labels[b.id]
          const body = (
            <>
              <span className="flex items-baseline gap-2">
                <span className="fp-data text-[11px] text-paper-faint" aria-hidden="true">
                  B-{String(i + 1).padStart(2, '0')}
                </span>
                <span className="fp-display text-sm text-paper">{b.name}</span>
              </span>
              <span className="mt-1 block text-sm text-paper-dim">{label.status}</span>
            </>
          )
          const rule = label.alert ? 'border-l-nogo' : label.highlight ? 'border-l-kapton' : label.pulse ? 'border-l-go' : 'border-l-rule-strong'
          const cell = `block w-full border border-l-[3px] border-rule bg-ink-2 p-3 text-left ${rule}`
          return (
            <li key={b.id}>
              {onBuildingClick ? (
                <button
                  type="button"
                  onClick={() => onBuildingClick(b.id)}
                  className={`${cell} transition-colors hover:bg-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-kapton`}
                >
                  {body}
                </button>
              ) : (
                <div className={cell}>{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** If the 3D map throws, the base keeps working with the building list. */
export class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
