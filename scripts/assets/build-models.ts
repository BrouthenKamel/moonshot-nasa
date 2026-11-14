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
import { buildCubeSat6U } from './models/cubesat-6u.ts'

/** Procedural generators, keyed by the raw file they write */
const generators: Record<string, () => import('three').Object3D> = {
  'cubesat-6u.glb': buildCubeSat6U,
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const models = (assets as readonly { kind: string }[]).filter((a): a is ModelAsset => a.kind === 'model')
const selected = only ? models.filter((m) => m.id === only) : models
if (only && selected.length === 0) throw new Error(`No model with id ${only}`)

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
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  const out = outPath(m.file)
  ensureDir(out)
  await io.write(out, doc)
  console.log(`${m.id}: ${kb(fs.statSync(raw).size)} -> ${kb(fs.statSync(out).size)}  (${m.file})`)
}
