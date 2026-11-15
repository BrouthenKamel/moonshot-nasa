import { Component, type ErrorInfo, type ReactNode } from 'react'

/** What the player sees instead of a blank page when something throws while rendering */
export function CrashScreen({ onReload }: { onReload: () => void }) {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-0 p-6 text-center text-paper">
      <h1 className="fp-display text-2xl">Something went wrong</h1>
      <p className="max-w-sm text-sm text-paper-dim">Your progress is saved in this browser. Reloading usually puts you back where you were.</p>
      <button type="button" onClick={onReload} className="fp-btn-primary px-6 py-2">
        Reload
      </button>
    </div>
  )
}

/** The top-level error boundary: "Something went wrong · Reload" instead of a blank page */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The app crashed:', error, info.componentStack)
  }
  render() {
    return this.state.failed ? <CrashScreen onReload={() => window.location.reload()} /> : this.props.children
  }
}
