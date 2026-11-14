/**
 * pnpm assets:credits
 * Writes CREDITS.md from the manifest: source, license and AI disclosure per asset.
 */
import fs from 'node:fs'
import path from 'node:path'
import { assets, type Asset } from '../../src/assets/manifest.ts'
import { ROOT } from './lib/paths.ts'

const list = assets as readonly Asset[]
const row = (a: Asset) => `| \`${a.id}\` | ${a.kind} | ${a.source} | ${a.license} | ${a.ai ? 'yes' : 'no'} | ${a.credit ?? ''} |`

const md = [
  '# Credits',
  '',
  'Generated from `src/assets/manifest.ts` by `pnpm assets:credits`. Do not edit by hand.',
  '',
  `AI-generated assets: ${list.filter((a) => a.ai).length} of ${list.length}.`,
  '',
  '| Asset | Kind | Source | License | AI-generated | Credit |',
  '|---|---|---|---|---|---|',
  ...list.map(row),
  '',
].join('\n')

fs.writeFileSync(path.join(ROOT, 'CREDITS.md'), md)
console.log(`CREDITS.md: ${list.length} assets`)
