import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assets, type Asset } from './manifest'

const PUBLIC = path.resolve(__dirname, '../../public/assets')
const list = assets as readonly Asset[]

/** Budgets keep the game fast to load on a demo laptop and conference Wi-Fi */
const MAX_BYTES: Record<Asset['kind'], number> = {
  model: 2 * 1024 * 1024,
  texture: 2 * 1024 * 1024,
  image: 1 * 1024 * 1024,
  music: 4 * 1024 * 1024,
  sfx: 300 * 1024,
  voice: 500 * 1024,
}
const MAX_TOTAL = 40 * 1024 * 1024

describe('asset manifest', () => {
  it('has unique ids and files', () => {
    expect(new Set(list.map((a) => a.id)).size).toBe(list.length)
    expect(new Set(list.map((a) => a.file)).size).toBe(list.length)
  })

  it.each(list.map((a) => [a.id, a] as const))('%s exists and fits its size budget', (_, a) => {
    const file = path.join(PUBLIC, a.file)
    expect(fs.existsSync(file), `missing public/assets/${a.file}: run the generator`).toBe(true)
    expect(fs.statSync(file).size).toBeLessThanOrEqual(MAX_BYTES[a.kind])
  })

  it('stays under the total budget', () => {
    const total = list.reduce((sum, a) => {
      const file = path.join(PUBLIC, a.file)
      return sum + (fs.existsSync(file) ? fs.statSync(file).size : 0)
    }, 0)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL)
  })

  it('declares a license for every asset', () => {
    for (const a of list) expect(a.license.length, a.id).toBeGreaterThan(0)
  })
})
