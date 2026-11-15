import { centre, check, design, drag, gotoStep, open, shot } from './lib.mjs'

const { browser, page, errors } = await open()
try {
  await gotoStep(page, 'spacecraft')
  const before = await design(page)
  const pickSolar = before.solar === 'solar-1wing' ? 'solar-2wing' : 'solar-1wing'
  const card = await centre(page, `[data-choice-id="${pickSolar}"]`)
  const canvasBox = await page.locator('canvas').first().boundingBox()
  const target = { x: canvasBox.x + canvasBox.width * 0.5, y: canvasBox.y + canvasBox.height * 0.5 }
  await shot(page, 'factory-fit-before')
  await drag(page, card, target)
  const after = await design(page)
  check(after.solar === pickSolar && before.solar !== after.solar, `dragged ${pickSolar} onto 6U frame (${before.solar} -> ${after.solar})`)
  await page.click('[data-testid="sun-lamp"]')
  await page.waitForTimeout(300)
  await page.click('[data-testid="close-panels"]')
  await page.waitForTimeout(800)
  await shot(page, 'factory-fit-after')
  check(errors.length === 0, `no page errors (got ${errors.length}: ${errors.join('; ')})`)
} finally {
  await browser.close()
}
