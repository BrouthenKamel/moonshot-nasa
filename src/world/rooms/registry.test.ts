import { describe, expect, it } from 'vitest'
import { ROOMS, ROOM_IDS, isUnlocked, nextRoom, type RoomId } from './registry'

describe('room registry', () => {
  it('only the briefing room is open at the start', () => {
    expect(ROOM_IDS.filter((id) => isUnlocked(id, []))).toEqual(['briefing'])
    expect(nextRoom([])).toBe('briefing')
  })

  it('every requirement points at a real room and play order respects it', () => {
    ROOM_IDS.forEach((id, i) => {
      for (const r of ROOMS[id].requires) {
        expect(ROOM_IDS).toContain(r)
        expect(ROOM_IDS.indexOf(r)).not.toBe(i)
      }
    })
  })

  it('following nextRoom reaches mission control last', () => {
    const done: RoomId[] = []
    for (let guard = 0; guard < 20; guard++) {
      const n = nextRoom(done)
      if (!n) break
      done.push(n)
    }
    expect(done).toHaveLength(ROOM_IDS.length)
    expect(done.at(-1)).toBe('mission-control')
    expect(nextRoom(done)).toBeNull()
  })

  it('locked rooms explain why', () => {
    for (const id of ROOM_IDS) if (ROOMS[id].requires.length) expect(ROOMS[id].lockedReason).not.toBe('')
  })
})
