import { create } from 'zustand'
import type { Insight, MinigameResult } from '../minigames/contract'
import type { RoomId } from '../world/rooms/ids'
import { useGameStore } from './gameStore'

/**
 * Ice Hunters campus state: where the astronaut is and what they have discovered.
 * Kept apart from worldStore (the agency clock and money). Session-only for now.
 */
export interface CampusState {
  /** The room the player is inside; null while walking the campus */
  currentRoom: RoomId | null
  completedRooms: RoomId[]
  /** Latest insight per id, in the order first found */
  insights: Insight[]
  astronautName: string
  suitColor: string
  enterRoom: (id: RoomId) => void
  leaveRoom: () => void
  /** Apply a mini game's result: design patch, insights, room completed, back to campus */
  completeRoom: (id: RoomId, result: MinigameResult) => void
  setAstronaut: (name: string, suitColor: string) => void
  resetCampus: () => void
}

const initial = {
  currentRoom: null,
  completedRooms: [] as RoomId[],
  insights: [] as Insight[],
  astronautName: 'Rookie',
  suitColor: '#f2a541',
}

export function mergeInsights(prev: Insight[], next: Insight[]): Insight[] {
  const out = [...prev]
  for (const i of next) {
    const at = out.findIndex((p) => p.id === i.id)
    if (at >= 0) out[at] = i
    else out.push(i)
  }
  return out
}

export const useCampusStore = create<CampusState>()((set) => ({
  ...initial,
  enterRoom: (currentRoom) => set({ currentRoom }),
  leaveRoom: () => set({ currentRoom: null }),
  completeRoom: (id, result) => {
    if (Object.keys(result.patch).length > 0) useGameStore.getState().updateDesign(result.patch)
    set((s) => ({
      currentRoom: null,
      completedRooms: s.completedRooms.includes(id) ? s.completedRooms : [...s.completedRooms, id],
      insights: mergeInsights(s.insights, result.insights),
    }))
  },
  setAstronaut: (astronautName, suitColor) => set({ astronautName, suitColor }),
  resetCampus: () => set(initial),
}))
