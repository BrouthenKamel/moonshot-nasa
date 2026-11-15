import { create } from 'zustand'

/**
 * Two layers of information over the same model.
 * Story view (default): plain-word verdicts and what you can see in the scene.
 * Engineer view: every number, margin and formula. Remembered between visits.
 */
export const VIEW_STORAGE_KEY = 'moonshot-view'

function load(): boolean {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_STORAGE_KEY) : null
    return raw === 'engineer'
  } catch {
    return false
  }
}

function save(engineer: boolean) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VIEW_STORAGE_KEY, engineer ? 'engineer' : 'story')
  } catch {
    // blocked storage: the choice holds for this visit only
  }
}

interface ViewState {
  engineerView: boolean
  setEngineerView: (on: boolean) => void
  toggleEngineerView: () => void
}

export const useViewStore = create<ViewState>()((set, get) => ({
  engineerView: load(),
  setEngineerView: (engineerView) => {
    save(engineerView)
    set({ engineerView })
  },
  toggleEngineerView: () => get().setEngineerView(!get().engineerView),
}))
