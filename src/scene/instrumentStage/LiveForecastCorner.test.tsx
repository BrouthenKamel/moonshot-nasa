import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { LiveForecastCorner } from './LiveForecastCorner'
import { StepDock } from '../../ui/hud/StepDock'

const text = (html: string) => html.replace(/<!-- -->/g, '')

describe('Science step, before the 3D scene has loaded', () => {
  it('draws the forecast card without the scene', () => {
    const html = text(renderToString(<LiveForecastCorner topLeft={<span>hover details</span>} />))
    expect(html).toMatch(/forecast/i)
    expect(html).toContain('hover details')
  })
})

describe('step strip', () => {
  it('reads Ride then Trip, not Ride then Transfer', () => {
    const html = text(renderToString(<StepDock />))
    expect(html).toContain('Trip')
    expect(html).not.toContain('>Transfer<')
  })
})
