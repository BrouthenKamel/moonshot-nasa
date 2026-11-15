import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AppErrorBoundary, CrashScreen } from './AppErrorBoundary'

describe('AppErrorBoundary', () => {
  it('shows the crash screen with a Reload button', () => {
    const html = renderToString(<CrashScreen onReload={() => {}} />)
    expect(html).toContain('Something went wrong')
    expect(html).toContain('Reload')
  })
  it('renders its children when nothing throws', () => {
    expect(renderToString(<AppErrorBoundary><p>fine</p></AppErrorBoundary>)).toContain('fine')
  })
  it('falls back once a child has thrown', () => {
    const state = AppErrorBoundary.getDerivedStateFromError()
    expect(state.failed).toBe(true)
  })
})
