import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const SRC_DIR = path.join(ROOT, 'assets-src')
export const OUT_DIR = path.join(ROOT, 'public/assets')

export const srcPath = (...p: string[]) => path.join(SRC_DIR, ...p)
export const outPath = (...p: string[]) => path.join(OUT_DIR, ...p)

export function ensureDir(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
}

/** Load KEY=value lines from .env.local then .env (no override of real env vars). */
export function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m || process.env[m[1]]) continue
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
}

export function kb(bytes: number) {
  return `${(bytes / 1024).toFixed(0)} KB`
}
