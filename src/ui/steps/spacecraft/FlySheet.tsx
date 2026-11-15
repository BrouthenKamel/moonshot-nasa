import type { BayView, BoardRow, RowKey } from '../../../viz/spacecraft/bayView'
import { Eng, MarginTick, Sheet, Stamp, type StampVerdict } from '../../kit'

/** Short scale names: the long board titles stay in the tooltip */
const LABEL: Record<RowKey, string> = {
  mass: 'Mass',
  volume: 'Volume',
  power: 'Power',
  money: 'Money',
  deltav: 'Δv to the Moon',
  time: 'Build time',
}

const UNIT: Record<RowKey, string> = { mass: 'kg', volume: 'U', power: 'W', money: '$M', deltav: 'm/s', time: 'mo' }

/** What a red row means, in two or three words */
const RED_WORD: Record<RowKey, string> = {
  mass: 'Too heavy',
  volume: 'Does not fit',
  power: 'Not enough power',
  money: 'Over budget',
  deltav: 'Cannot reach',
  time: 'Not ready in time',
}

/** The one verdict for the bay: the first red row, else the first tight one, else FITS */
function flyVerdict(view: BayView): { verdict: StampVerdict; word: string } {
  const red = view.rows.find((r) => r.tone === 'red')
  if (red) return { verdict: 'nogo', word: RED_WORD[red.key] }
  const tight = view.rows.find((r) => r.tone === 'yellow')
  if (tight) return { verdict: 'caution', word: `Tight: ${LABEL[tight.key].toLowerCase()}` }
  return { verdict: 'go', word: 'Fits' }
}

/**
 * "Does it fly?": one stamp, and a needle only for the margins that are red or tight (or would turn
 * so under the hovered part). The rest fold into one "all OK" line. Engineer view adds each shown
 * row's numbers and reason.
 */
export function FlySheet({ view, preview, className = '' }: { view: BayView; preview?: BayView | null; className?: string }) {
  const v = flyVerdict(view)
  const ghost = (r: BoardRow) => {
    const p = preview?.rows.find((x) => x.key === r.key)
    return p ? { value: p.value, status: p.tone } : null
  }
  const shown = view.rows.filter((r) => r.tone !== 'green' || (ghost(r)?.status ?? 'green') !== 'green')
  const okCount = view.rows.length - shown.length
  return (
    <Sheet className={`p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-rule pb-2">
        <span className="fp-label text-kapton">Does it fly?</span>
        <Stamp key={v.word} verdict={v.verdict} size="sm" animate>
          {v.word}
        </Stamp>
      </div>
      {shown.length > 0 && (
        <ul className="mt-2.5 space-y-2.5">
          {shown.map((r) => (
            <li key={r.key} title={r.reason || r.title}>
              <MarginTick label={LABEL[r.key]} value={r.value} limit={r.limit} unit={UNIT[r.key]} status={r.tone} preview={ghost(r)} />
              <Eng as="div" className="mt-0.5 fp-data text-[10.5px] text-paper-dim">
                {r.text}
                {r.tone !== 'green' && r.reason && <span className="block text-paper-faint">{r.reason}</span>}
              </Eng>
            </li>
          ))}
        </ul>
      )}
      {okCount > 0 && (
        <p
          className="mt-2 text-xs text-paper-dim"
          data-testid="fly-all-ok"
          title={view.rows
            .filter((r) => !shown.includes(r))
            .map((r) => LABEL[r.key])
            .join(', ')}
        >
          {shown.length === 0 ? `All ${view.rows.length} checks OK.` : `${okCount === 1 ? 'The other check' : `The other ${okCount}`}: all OK.`}
        </p>
      )}
    </Sheet>
  )
}
