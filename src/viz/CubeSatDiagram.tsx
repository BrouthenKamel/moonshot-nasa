import type { PartCategory } from '../data/parts'
import type { Design } from '../sim/types'
import { buildSlots } from './cubesatSlots'

export type CraftHighlight = 'instruments' | 'bus' | 'all' | null

interface CubeSatDiagramProps {
  design: Design
  failing?: boolean
  highlight?: CraftHighlight
  /** Slot groups marked red: payload = instruments, bus = everything else. */
  failingGroups?: { payload?: boolean; bus?: boolean }
}

const CATEGORY_COLOR: Record<PartCategory, string> = {
  instrument: '#a855f7',
  battery: '#22c55e',
  radio: '#3b82f6',
  computer: '#06b6d4',
  attitude: '#eab308',
  propulsion: '#f97316',
  solar: '#38bdf8',
  structure: '#64748b',
}

const BUS_X = 50
const BUS_Y = 30
const BUS_W = 160
const BUS_H = 60

/** 6U cutaway: slot widths are proportional to the part volume, so the picture is the volume budget. */
export function CubeSatDiagram({
  design,
  failing = false,
  highlight = null,
  failingGroups,
}: CubeSatDiagramProps) {
  const layout = buildSlots(design)
  const scale = layout.limitU > 0 ? BUS_W / layout.limitU : 0
  const deployed = layout.solar === 'deployable'
  const dimmed = (category: PartCategory) =>
    highlight === 'instruments'
      ? category !== 'instrument'
      : highlight === 'bus'
        ? category === 'instrument'
        : false

  const cells = layout.slots.map((slot, i) => {
    const cursor = layout.slots.slice(0, i).reduce((sum, s) => sum + s.volume, 0)
    const x = BUS_X + cursor * scale
    const w = Math.max(0, slot.volume * scale)
    const overflow = cursor + slot.volume > layout.limitU + 1e-9
    const groupFailing =
      slot.category === 'instrument' ? failingGroups?.payload : failingGroups?.bus
    const red = overflow || groupFailing
    return (
      <g key={`${slot.partId}-${i}`} opacity={dimmed(slot.category) ? 0.3 : 1}>
        <title>{`${slot.name}: ${slot.volume} U`}</title>
        <rect
          x={x + 1}
          y={BUS_Y + 3}
          width={Math.max(0, w - 2)}
          height={BUS_H - 6}
          rx={2}
          fill={red ? '#7f1d1d' : CATEGORY_COLOR[slot.category]}
          fillOpacity={red ? 0.9 : 0.55}
          stroke={red ? '#ef4444' : CATEGORY_COLOR[slot.category]}
          strokeWidth={1}
        />
        <text
          x={x + w / 2}
          y={BUS_Y + BUS_H / 2 + 3}
          textAnchor="middle"
          fontSize={7}
          fill="#e2e8f0"
        >
          {slot.volume >= 0.5 ? slot.category.slice(0, 4) : ''}
        </text>
      </g>
    )
  })

  const wingStyle = {
    transformBox: 'fill-box' as const,
    transformOrigin: 'center',
    transform: deployed ? 'scaleY(1)' : 'scaleY(0.08)',
    transition: 'transform 500ms ease',
  }

  return (
    <svg
      viewBox="0 0 260 120"
      className="h-full w-full"
      role="img"
      aria-label={`CubeSat cutaway, ${layout.usedU.toFixed(1)} of ${layout.limitU} U used`}
    >
      {/* Solar wings, folded flat against the bus or unfolded */}
      {layout.solar !== 'none' && (
        <g style={wingStyle}>
          <rect x={BUS_X + 30} y={2} width={100} height={26} fill="#0c4a6e" stroke="#38bdf8" />
          <rect x={BUS_X + 30} y={BUS_Y + BUS_H + 2} width={100} height={26} fill="#0c4a6e" stroke="#38bdf8" />
        </g>
      )}
      {layout.solar === 'body' && (
        <rect
          x={BUS_X}
          y={BUS_Y}
          width={BUS_W}
          height={BUS_H}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={3}
          strokeDasharray="6 3"
          rx={3}
        />
      )}
      <rect
        x={BUS_X}
        y={BUS_Y}
        width={BUS_W}
        height={BUS_H}
        rx={3}
        fill="#0f172a"
        stroke={failing || layout.overLimit ? '#ef4444' : highlight === 'all' ? '#f8fafc' : '#475569'}
        strokeWidth={failing || layout.overLimit ? 2 : 1.5}
      />
      {cells}
      <text x={BUS_X} y={BUS_Y + BUS_H + 38} fontSize={9} fill={layout.overLimit ? '#f87171' : '#94a3b8'}>
        {layout.usedU.toFixed(1)} / {layout.limitU} U
        {layout.overLimit ? ' (over limit)' : ''}
      </text>
      <text x={BUS_X + BUS_W} y={BUS_Y + BUS_H + 38} fontSize={9} textAnchor="end" fill="#94a3b8">
        solar: {layout.solar === 'deployable' ? 'unfolded' : layout.solar === 'body' ? 'body-mounted' : 'none'}
      </text>
    </svg>
  )
}
