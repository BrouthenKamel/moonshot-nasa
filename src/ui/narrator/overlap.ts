/**
 * Does the mentor's bubble sit on something the player is reading or clicking?
 * The Narrator asks this once, for every screen: it looks at where text and controls really are
 * on the page, so no screen needs to declare a "keep clear" zone.
 */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Boxes smaller than this are not content (screen-reader-only text is clipped to 1px) */
const MIN_SIDE = 4

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

/** True when any content box overlaps the bubble box (ignoring slivers) */
export function coversContent(bubble: Box, content: Iterable<Box>): boolean {
  for (const c of content) {
    if (c.right - c.left < MIN_SIDE || c.bottom - c.top < MIN_SIDE) continue
    if (boxesOverlap(bubble, c)) return true
  }
  return false
}

const CONTROLS = 'button, a[href], input, select, textarea, [role="slider"], [role="switch"], [role="radio"]'

/**
 * Every visible text run and control on the page, as boxes, except what lives inside `exclude`
 * (the mentor itself). Pictures and the 3D canvas are scenery, not content.
 */
export function* pageContent(exclude: Element | null): Generator<Box> {
  if (typeof document === 'undefined') return
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      if (exclude && exclude.contains(node)) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (!parent || parent.closest('script, style, noscript')) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    range.selectNodeContents(node)
    for (const r of Array.from(range.getClientRects())) yield { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }
  for (const el of Array.from(document.querySelectorAll(CONTROLS))) {
    if (exclude && exclude.contains(el)) continue
    const r = el.getBoundingClientRect()
    yield { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  }
}
