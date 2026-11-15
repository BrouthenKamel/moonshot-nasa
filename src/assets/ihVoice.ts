import type { RoomId } from '../world/rooms/ids'
import { audio } from './audio'
import type { AudioId } from './manifest'

/**
 * Flight Director Reyes' room lines for the Ice Hunters campus.
 * Cue ids are `ih.room.<room-id>.<kind>`; the caption shows through the same voice queue as every other line.
 */
export type RoomLine = 'intro' | 'hint' | 'success'

export function roomCue(roomId: RoomId, line: RoomLine): AudioId {
  return `ih.room.${roomId}.${line}` as AudioId
}

/** Queue Reyes' line for a room (radio filter, caption while it plays) */
export function sayRoom(roomId: RoomId, line: RoomLine): void {
  audio.say(roomCue(roomId, line))
}
