import { create } from 'zustand'

/** State of the shared Details control (Details.tsx): open or closed per id, kept for the browser tab. */

const STORAGE_PREFIX = 'moonshot:details:'

function readStored(id: string): boolean | undefined {
  try {
    const v = globalThis.sessionStorage?.getItem(STORAGE_PREFIX + id)
    return v === '1' ? true : v === '0' ? false : undefined
  } catch {
    return undefined
  }
}

function writeStored(id: string, open: boolean) {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_PREFIX + id, open ? '1' : '0')
  } catch {
    // Private mode or blocked storage: the state still holds for this page view
  }
}

interface DetailsState {
  open: Record<string, boolean>
  set: (id: string, open: boolean) => void
}

export const useDetailsStore = create<DetailsState>((set) => ({
  open: {},
  set: (id, open) => {
    writeStored(id, open)
    set((s) => ({ open: { ...s.open, [id]: open } }))
  },
}))

/** Whether the Details panel with this id is open (closed unless the player opened it this session). */
export function isDetailsOpen(id: string): boolean {
  return useDetailsStore.getState().open[id] ?? readStored(id) ?? false
}

export function setDetailsOpen(id: string, open: boolean) {
  useDetailsStore.getState().set(id, open)
}

export function useDetailsOpen(id: string): boolean {
  return useDetailsStore((s) => s.open[id] ?? readStored(id) ?? false)
}

export const detailsToggleId = (id: string) => `details-toggle-${id}`
export const detailsPanelId = (id: string) => `details-panel-${id}`
