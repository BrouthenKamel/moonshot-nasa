/** `?classic=1` keeps the old step-screen game reachable until WP-6 deletes it */
export function isClassicMode(search: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  return new URLSearchParams(search).get('classic') === '1'
}
