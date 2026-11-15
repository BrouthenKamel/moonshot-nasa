import { centre, check, design, drag, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await gotoStep(page, 'orbit')
  await page.evaluate(() => {
    window.__moonshot.game.getState().updateDesign({ orbit: 'orbit-elliptical' })
  })
  await page.waitForTimeout(400)

  const moonSlot = await page.locator('[data-drop-slot="orbit:moon"]').first().boundingBox()
  const haloCard = await centre(page, '[data-choice-id="orbit-halo"]')
  const moonCenter = { x: moonSlot.x + moonSlot.width * 0.5, y: moonSlot.y + moonSlot.height * 0.43 }
  await shot(page, 'orbit-draw-before')
  await drag(page, haloCard, moonCenter)
  const afterCard = await design(page)
  check(afterCard.orbit === 'orbit-halo', `dragged orbit-halo card onto Moon (${afterCard.orbit})`)

  const handle = await centre(page, '[data-testid="orbit-handle"]')
  await drag(page, handle, { x: moonCenter.x, y: moonCenter.y + 195 })
  const after100 = await design(page)
  check(after100.orbit === 'orbit-100km', `dragged periapsis handle outward to 100 km polar (${after100.orbit})`)
  await shot(page, 'orbit-draw-100km')

  const handle100 = await centre(page, '[data-testid="orbit-handle"]')
  await drag(page, handle100, { x: moonCenter.x, y: moonCenter.y + 82 })
  const afterLow = await design(page)
  check(afterLow.orbit === 'orbit-elliptical', `dragged periapsis handle inward to 15 km elliptical (${afterLow.orbit})`)
  await shot(page, 'orbit-draw-after')

  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
