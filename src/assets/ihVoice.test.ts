import { describe, expect, it } from 'vitest'
import { ROOM_IDS } from '../world/rooms/ids'
import { getAsset } from './manifest'
import { roomCue } from './ihVoice'

describe('Ice Hunters room voice', () => {
  it('has a captioned cue for every room and line', () => {
    for (const room of ROOM_IDS)
      for (const line of ['intro', 'hint', 'success'] as const) {
        const a = getAsset(roomCue(room, line))
        expect(a.kind).toBe('voice')
        expect((a as { caption?: string }).caption?.length).toBeGreaterThan(0)
      }
  })
})
