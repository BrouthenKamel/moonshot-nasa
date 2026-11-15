import { useEffect } from 'react'
import { useViewStore } from '../state/viewStore'

/** Mirrors the view onto <html data-view> (CSS hides .eng-only / .story-only) and binds the E key */
export function useViewMode() {
  const engineer = useViewStore((s) => s.engineerView)
  const toggle = useViewStore((s) => s.toggleEngineerView)

  useEffect(() => {
    document.documentElement.dataset.view = engineer ? 'engineer' : 'story'
  }, [engineer])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'e' && e.key !== 'E') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
}
