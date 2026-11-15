import type { BayView, BoardRow, RowKey } from '../../../viz/spacecraft/bayView'
import { Eng, MarginTick, Sheet, Stamp, type StampVerdict } from '../../kit'
import { RED_WORD, redCause } from '../../../viz/spacecraft/redCause'

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

/** The one verdict for the bay: the first red row, else the first tight one, else FITS; a red one says why */
function flyVerdict(view: BayView): { verdict: StampVerdict; word: string; cause?: string } {
  const red = view.rows.find((r) => r.tone === 'red')
  if (red) return { verdict: 'nogo', word: RED_WORD[red.key], cause: redCause(red) }
  const tight = view.rows.find((r) => r.tone === 'yellow')
  if (tight) return { verdict: 'caution', word: `Tight: ${LABEL[tight.key].toLowerCase()}` }
  return { verdict: 'go', word: 'Fits' }
}

/**
 * "Does it fly?": one needle per margin the Factory can turn red, and one stamp.
 * Story view: needles, words and the stamp; under a red stamp, one sentence naming the cause.
 * Engineer view adds each row's numbers and reason. `onReset`, when given, puts the starter
 * craft back in one click (the screen passes it only while the craft differs from the starter).
 */
export function FlySheet({
  view,
  preview,
  onReset,
  className = '',
}: {
  view: BayView
  preview?: BayView | null
  onReset?: () => void
  className?: string
}) {
  const v = flyVerdict(view)
  const ghost = (r: BoardRow) => {
    const p = preview?.rows.find((x) => x.key === r.key)
    return p ? { value: p.value, status: p.tone } : null
  }
  return (
    <Sheet className={`p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-rule pb-2">
        <span className="fp-label text-kapton">Does it fly?</span>
        <Stamp key={v.word} verdict={v.verdict} size="sm" animate>
          {v.word}
        </Stamp>
      </div>
      {onReset && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onReset}
            className="whitespace-nowrap text-[11px] text-paper-dim underline decoration-rule underline-offset-2 hover:text-kapton"
            data-testid="reset-starter"
          >
            Reset to starter
          </button>
        </div>
      )}
      {v.cause && (
        <p className="mt-1.5 text-xs leading-snug text-nogo" data-testid="fly-cause">
          {v.cause}
        </p>
      )}
      <ul className="mt-2.5 space-y-2.5">
        {view.rows.map((r) => (
          <li key={r.key} title={r.reason || r.title}>
            <MarginTick label={LABEL[r.key]} value={r.value} limit={r.limit} unit={UNIT[r.key]} status={r.tone} preview={ghost(r)} />
            <Eng as="div" className="mt-0.5 fp-data text-[10.5px] text-paper-dim">
              {r.text}
              {r.tone !== 'green' && r.reason && <span className="block text-paper-faint">{r.reason}</span>}
            </Eng>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
