import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { DesignStep } from '../../sim/types'
import type { MinigameProps } from '../../minigames/contract'
import { ROOM_IDS, type RoomId, type RoomRole } from './ids'

export { ROOM_IDS, type RoomId, type RoomRole }

export interface RoomDef {
  id: RoomId
  title: string
  /** One line shown on the door */
  tagline: string
  role: RoomRole
  /** The classic design steps this room replaces */
  steps: DesignStep[]
  /** Rooms that must be completed before this door opens */
  requires: RoomId[]
  /** Why the door is locked, in the player's words */
  lockedReason: string
  /** The room's mini game. Wave 2 agents replace the placeholder with their own lazy import. */
  component: LazyExoticComponent<ComponentType<MinigameProps>>
}

export const ROOMS: Record<RoomId, RoomDef> = {
  briefing: {
    id: 'briefing',
    title: 'Briefing Room',
    tagline: 'Find the craters the Sun never touches',
    role: 'science',
    steps: ['brief', 'planning'],
    requires: [],
    lockedReason: '',
    component: lazy(() => import('../../minigames/shadowHunt')),
  },
  'science-lab': {
    id: 'science-lab',
    title: 'Science Lab',
    tagline: 'Which instrument sees ice in the dark?',
    role: 'science',
    steps: ['instruments'],
    requires: ['briefing'],
    lockedReason: 'Get your mission brief first',
    component: lazy(() => import('../../minigames/darkCraterBench')),
  },
  'clean-room': {
    id: 'clean-room',
    title: 'Clean Room',
    tagline: 'Pack and wire a 6U CubeSat',
    role: 'space',
    steps: ['spacecraft'],
    requires: ['science-lab'],
    lockedReason: 'The Clean Room needs a payload first',
    component: lazy(() => import('../../minigames/packTheSix')),
  },
  'thermal-vac': {
    id: 'thermal-vac',
    title: 'Thermal-Vac Chamber',
    tagline: 'Survive the eclipse',
    role: 'space',
    steps: ['planning'],
    requires: ['clean-room', 'flight-dynamics'],
    lockedReason: 'Build the spacecraft and pick an orbit before testing it',
    component: lazy(() => import('../../minigames/eclipseSurvival')),
  },
  'flight-dynamics': {
    id: 'flight-dynamics',
    title: 'Flight Dynamics',
    tagline: 'Shape your orbit around the Moon',
    role: 'launch',
    steps: ['orbit'],
    requires: ['briefing'],
    lockedReason: 'Get your mission brief first',
    component: lazy(() => import('../../minigames/orbitSling')),
  },
  'ground-station': {
    id: 'ground-station',
    title: 'Ground Station',
    tagline: 'Catch the pass, bring the data home',
    role: 'ground',
    steps: ['comms'],
    requires: ['clean-room'],
    lockedReason: 'Install a radio in the Clean Room first',
    component: lazy(() => import('../../minigames/catchThePass')),
  },
  'launch-hangar': {
    id: 'launch-hangar',
    title: 'Launch Hangar',
    tagline: 'Book a ride to the Moon',
    role: 'launch',
    steps: ['rocket', 'ride'],
    requires: ['clean-room', 'flight-dynamics'],
    lockedReason: 'Finish the spacecraft and the orbit plan first',
    component: lazy(() => import('../../minigames/rideshareManifest')),
  },
  'mission-control': {
    id: 'mission-control',
    title: 'Mission Control',
    tagline: 'You are the Launch Director',
    role: 'ground',
    steps: ['go-nogo'],
    requires: ['thermal-vac', 'ground-station', 'launch-hangar'],
    lockedReason: 'Every team must sign off before launch',
    component: lazy(() => import('../../minigames/launchDirector')),
  },
}

/** A door opens once every room it requires is completed */
export function isUnlocked(id: RoomId, completed: readonly RoomId[]): boolean {
  return ROOMS[id].requires.every((r) => completed.includes(r))
}

/** The first unlocked room not yet completed, in play order; null when all are done */
export function nextRoom(completed: readonly RoomId[]): RoomId | null {
  return ROOM_IDS.find((id) => !completed.includes(id) && isUnlocked(id, completed)) ?? null
}
