import { centre, check, design, drag, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await gotoStep(page, 'rocket')
  const card = await centre(page, '[data-rocket-part="engine:engine_cluster9"]')
  const canvasBox = await page.locator('canvas').first().boundingBox()
  const target = { x: canvasBox.x + canvasBox.width * 0.5, y: canvasBox.y + canvasBox.height * 0.45 }
  await drag(page, card, target)
  const after = await design(page)
  check(after.rocket?.engine === 'engine_cluster9', `dragged engine_cluster9 onto rocket stack (got ${after.rocket?.engine})`)
  await shot(page, 'stack')
  await page.click('[data-testid="board-fairing"]')
  await page.waitForTimeout(1500)
  await shot(page, 'fairing-ride')
  check(await page.locator('[data-testid="fairing-ride-overlay"]').isVisible(), 'fairing ride overlay opened')
  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
