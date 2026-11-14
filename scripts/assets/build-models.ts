/**
 * pnpm assets:models [--only <manifest id>]
 *
 * 1. Runs the procedural generators, writing raw .glb files to assets-src/models/.
 * 2. Optimizes every manifest model from assets-src/models/<src> into public/assets/<file>:
 *    dedup, prune, weld, textures resized to 1024 px and converted to WebP, meshopt compression.
 *
 * A model from anywhere else (Blender, Meshy, Tripo, a kit) only needs its raw .glb dropped in
 * assets-src/models/ and a manifest entry; step 2 picks it up.
 */
import fs from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, weld, textureCompress, meshopt } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { assets, type ModelAsset } from '../../src/assets/manifest.ts'
import { exportGlb } from './lib/three-node.ts'
import { ensureDir, kb, outPath, srcPath } from './lib/paths.ts'
import { importNasa3D } from './import-nasa-3d.ts'
import { buildCubeSat6U } from './models/cubesat-6u.ts'

/**
 * Procedural generators, keyed by the raw file they write. Every module in models/parts/
 * exports `models: Record<catalogue id, () => Object3D>`, written to parts/<id>.glb.
 */
const generators: Record<string, () => import('three').Object3D> = {
  'cubesat-6u.glb': buildCubeSat6U,
}
const partsDir = new URL('./models/parts/', import.meta.url)
for (const file of fs.readdirSync(partsDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
  try {
    const mod = (await import(new URL(file, partsDir).href)) as { models?: Record<string, () => import('three').Object3D> }
    for (const [id, build] of Object.entries(mod.models ?? {})) generators[`parts/${id}.glb`] = build
  } catch (e) {
    // One broken generator must not stop the others from building
    console.warn(`skip models/parts/${file}: ${(e as Error).message}`)
  }
}

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null)
const only = arg('--only')
/** --group power-avionics: only the models made by scripts/assets/models/parts/power-avionics.ts */
const group = arg('--group')
const refreshNasa = process.argv.includes('--refresh-nasa')
const models = (assets as readonly { kind: string }[]).filter((a): a is ModelAsset => a.kind === 'model')
const selected = models.filter((m) => (!only || m.id === only) && (!group || (m.credit ?? '').includes(`parts/${group}.ts`)))
if ((only || group) && selected.length === 0) throw new Error(`No model matches ${only ?? group}`)

if (!group && (!only || selected[0]?.source === 'nasa')) {
  await importNasa3D({
    refresh: refreshNasa,
    onlySrc: only ? selected[0].src : null,
  })
}

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

for (const m of selected) {
  const raw = srcPath('models', m.src)
  const gen = generators[m.src]
  if (gen) {
    ensureDir(raw)
    fs.writeFileSync(raw, await exportGlb(gen()))
  }
  if (!fs.existsSync(raw)) {
    console.warn(`skip ${m.id}: missing ${raw}`)
    continue
  }

  const doc = await io.read(raw)
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: m.source === 'nasa' ? [512, 512] : [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  const out = outPath(m.file)
  ensureDir(out)
  await io.write(out, doc)
  console.log(`${m.id}: ${kb(fs.statSync(raw).size)} -> ${kb(fs.statSync(out).size)}  (${m.file})`)
}
