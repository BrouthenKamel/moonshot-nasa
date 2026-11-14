import type { BayView } from '../../viz/spacecraft/bayView'
import type { TrayKey } from '../../viz/spacecraft/trayOptions'

export function AssemblyBay({ view }: { view: BayView; changed: { key: TrayKey; n: number } | null }) {
  return <div className="p-20 text-slate-500">{view.title}</div>
}
