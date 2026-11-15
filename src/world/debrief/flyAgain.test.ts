import { beforeEach, describe, expect, it } from 'vitest'
import { useCampusStore } from '../../state/campusStore'
import { useGameStore } from '../../state/gameStore'
import { flashlightDesign } from '../../sim/fixtures'
import { flyAgain } from './flyAgain'

describe('flyAgain', () => {
  beforeEach(() => {
    useCampusStore.getState().resetCampus()
    useGameStore.setState({ screen: 'report', design: flashlightDesign })
    useCampusStore.setState({ completedRooms: ['briefing', 'science-lab'] })
  })

  it('returns to the campus inside the chosen room, with the craft and rooms kept', () => {
    flyAgain('thermal-vac')
    expect(useGameStore.getState().screen).toBe('base')
    expect(useGameStore.getState().design).toEqual(flashlightDesign)
    expect(useCampusStore.getState().currentRoom).toBe('thermal-vac')
    expect(useCampusStore.getState().completedRooms).toEqual(['briefing', 'science-lab'])
  })

  it('with no room, lands on the campus itself', () => {
    flyAgain(null)
    expect(useGameStore.getState().screen).toBe('base')
    expect(useCampusStore.getState().currentRoom).toBeNull()
  })
})
