import { describe, it, expect, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { BaseMap, type BuildingLabel } from './BaseMap'
import { BuildingList, MapBoundary } from './BuildingList'
import type { BuildingId } from '../data/agency'

const labels: Record<BuildingId, BuildingLabel> = {
  'research-lab': { level: 2, status: 'Lab status' },
  factory: { level: 1, status: 'Factory status' },
  'comms-center': { level: 1, status: 'Comms status' },
  'launch-site': { level: 1, status: 'Launch status' },
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
