/**
 * Whether this browser has watched the craft go into the rocket once. After the first viewing the
 * carry can be skipped. Kept in localStorage; if storage is blocked, every viewing counts as the first.
 */
const KEY = 'moonshot.rocketLoadSeen'

export function hasSeenRocketLoad(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markRocketLoadSeen(): void {
  try {
    window.localStorage.setItem(KEY, '1')
  } catch {
    // storage blocked: the skip button simply waits for the next viewing
  }
}
