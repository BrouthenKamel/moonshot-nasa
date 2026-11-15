import { describe, it, expect, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { BaseMap, type BuildingLabel } from './BaseMap'
import { quietLabels, signHint, signMeaning } from './mapCues'
import { BuildingList, MapBoundary } from './BuildingList'
import type { BuildingId } from '../data/agency'

const labels: Record<BuildingId, BuildingLabel> = {
  'research-lab': { status: 'Lab status' },
  factory: { status: 'Factory status' },
  'comms-center': { status: 'Comms status' },
  'launch-site': { status: 'Launch status' },
}

/** Every <button> element in a rendered tree, calling function components on the way */
function buttons(node: ReactNode): ReactElement<{ onClick?: () => void; children?: ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons)
  if (!isValidElement(node)) return []
  const el = node as ReactElement<{ onClick?: () => void; children?: ReactNode }>
  if (typeof el.type === 'function') return buttons((el.type as (p: unknown) => ReactNode)(el.props))
  const own = el.type === 'button' ? [el] : []
  return [...own, ...buttons(el.props.children)]
}

describe('base map without WebGL', () => {
  it('falls back to a list of the four buildings (the test runner has no WebGL)', () => {
    const html = renderToString(<BaseMap labels={labels} onBuildingClick={() => {}} />)
    for (const name of ['Research Lab', 'Factory', 'Communications Center', 'Launch Site']) expect(html).toContain(name)
    expect(html).toContain('Factory status')
    expect(html.match(/<button/g)?.length).toBe(4)
  })

  it('each button opens its building, as clicking it on the map does', () => {
    const open = vi.fn()
    const list = buttons(BuildingList({ labels, onBuildingClick: open }))
    expect(list).toHaveLength(4)
    list.forEach((b) => b.props.onClick?.())
    expect(open.mock.calls.map((c) => c[0])).toEqual(['research-lab', 'factory', 'comms-center', 'launch-site'])
  })

  it('shows the buildings without buttons while the craft flies', () => {
    const html = renderToString(<BuildingList labels={labels} />)
    expect(html).not.toContain('<button')
    expect(html).toContain('Launch Site')
  })

  it('a map that throws shows the list instead of a white page', () => {
    expect(MapBoundary.getDerivedStateFromError()).toEqual({ failed: true })
    const boundary = new MapBoundary({ fallback: 'the list', children: 'the map' })
    expect(boundary.render()).toBe('the map')
    boundary.state = { failed: true }
    expect(boundary.render()).toBe('the list')
  })
})

describe('the next-stop cue on the map', () => {
  it('puts the next step in words under the lit sign', () => {
    expect(signHint({ status: 'Comms', highlight: true, hint: 'Next: Planning' })).toBe('Next: Planning')
    expect(signMeaning({ status: 'Comms', highlight: true, hint: 'Next: Planning' })).toBe('Next: Planning')
  })

  it('says nothing on an unlit sign, or when a red problem takes over the sign', () => {
    expect(signHint({ status: 'Lab', hint: 'Next: Instruments' })).toBeNull()
    expect(signHint({ status: 'Lab', highlight: true, hint: 'Next: Instruments', alert: true })).toBeNull()
    expect(signHint(undefined)).toBeNull()
  })

  it('a fresh base lights nothing: New mission is the only start', () => {
    const quiet = quietLabels({ ...labels, 'comms-center': { status: 'Comms', highlight: true, hint: 'Next: Brief' }, 'research-lab': { status: 'Lab', pulse: true } })
    for (const l of Object.values(quiet)) {
      expect(l.highlight).toBe(false)
      expect(l.pulse).toBe(false)
      expect(signHint(l)).toBeNull()
    }
  })
})
