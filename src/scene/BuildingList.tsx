import { Component, type ReactNode } from 'react'
import { buildings } from '../data/agency'
import type { BaseMapProps } from './BaseMap'
import { buildingIcons } from './buildingIcons'

/**
 * The buildings as a plain list: the base map for a browser without WebGL, or when the
 * 3D map fails. Each button walks into its building, just as clicking it on the map does.
 */
export function BuildingList({ labels, onBuildingClick }: BaseMapProps) {
  return (
    <div className="h-full w-full overflow-y-auto bg-[#1d2c4f] p-4 pb-10 text-white">
      <h2 className="font-display text-xl font-bold">Agency base</h2>
      <p className="mt-1 text-sm text-slate-300">
        {onBuildingClick
          ? 'Click a building to walk in.'
          : 'The craft is flying: the buildings show its state.'}{' '}
        (The 3D map needs WebGL, which this browser has turned off.)
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {buildings.map((b) => {
          const label = labels[b.id]
          const body = (
            <>
              <span className="flex items-center gap-2">
                <span className="text-xl leading-none" aria-hidden="true">
                  {buildingIcons[b.id]}
                </span>
                <span className="font-display text-base font-bold">{b.name}</span>
                <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  LV {label.level}
                </span>
              </span>
              <span className="mt-1 block text-sm text-slate-600">{label.status}</span>
            </>
          )
          const border = label.alert ? 'border-red-500' : label.highlight ? 'border-orange-400' : 'border-transparent'
          return (
            <li key={b.id}>
              {onBuildingClick ? (
                <button
                  type="button"
                  onClick={() => onBuildingClick(b.id)}
                  className={`block w-full rounded-xl border-2 bg-white/95 p-3 text-left text-slate-800 shadow transition hover:bg-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-orange-400 ${border}`}
                >
                  {body}
                </button>
              ) : (
                <div className={`rounded-xl border-2 bg-white/95 p-3 text-slate-800 ${border}`}>{body}</div>
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
