import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Document, NodeIO, type Material, type Node as GltfNode } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, getBounds, mergeDocuments, prune, simplify, unpartition, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ROOT, ensureDir, kb, outPath, srcPath } from './lib/paths.ts'
import { exportGlb } from './lib/three-node.ts'

const NASA_ROOT = path.join(ROOT, 'nasa/NASA-3D-Resources')
const TRANSPARENT_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

type PivotMode = 'bottom' | 'center'

interface NasaGlbSpec {
  id: string
  /** Target path relative to assets-src/models/ (matches ModelAsset.src) */
  src: string
  /** Source path relative to nasa/NASA-3D-Resources/ (custom builders omit this) */
  nasaPath?: string
  pivot: PivotMode
  /** Desired height, width, or max dimension (1 unit = 1 meter) */
  targetHeight?: number
  targetMaxDim?: number
  targetWidth?: number
  simplifyRatio?: number
  simplifyError?: number
  lockBorder?: boolean
  custom?: (io: NodeIO) => Promise<Document>
}

export const NASA_MODEL_SPECS: readonly NasaGlbSpec[] = [
  {
    id: 'model.nasa-icecube',
    src: 'nasa/nasa-icecube.glb',
    nasaPath: '3D Models/CubeSat - ICECube/CubeSat - ICECube.glb',
    pivot: 'center',
    targetHeight: 0.6,
    simplifyRatio: 0.25,
    simplifyError: 0.02,
    lockBorder: false,
  },
  {
    id: 'model.env-lro',
    src: 'nasa/lro-orbiter.glb',
    nasaPath: '3D Models/Lunar Reconnaissance Orbiter (A)/Lunar Reconnaissance Orbiter (A).glb',
    pivot: 'center',
    targetMaxDim: 3.3,
    simplifyRatio: 0.16,
    simplifyError: 0.03,
    lockBorder: false,
  },
  {
    id: 'model.env-lunar-crater',
    src: 'nasa/lunar-crater-terrain.glb',
    pivot: 'bottom',
    targetWidth: 20,
    simplifyRatio: 0.08,
    simplifyError: 0.03,
    lockBorder: true,
    custom: buildLunarCraterFromStl,
  },
  {
    id: 'model.env-asteroid-bennu',
    src: 'nasa/asteroid-bennu.glb',
    nasaPath: '3D Models/1999 RQ36 asteroid/1999 RQ36 asteroid.glb',
    pivot: 'center',
    targetMaxDim: 1.0,
    simplifyRatio: 0.45,
    simplifyError: 0.01,
  },
  {
    id: 'model.env-support-stand',
    src: 'nasa/flight-support-stand.glb',
    nasaPath: '3D Models/Flight System Support/Flight System Support.glb',
    pivot: 'bottom',
    targetHeight: 1.2,
  },
  {
    id: 'model.env-cleanroom-oru',
    src: 'nasa/cleanroom-oru.glb',
    nasaPath: '3D Models/Orbital Replacement Unit/Orbital Replacement Unit.glb',
    pivot: 'bottom',
    targetHeight: 1.4,
  },
  {
    id: 'model.env-astronaut',
    src: 'nasa/astronaut.glb',
    nasaPath: '3D Models/Astronaut/Astronaut.glb',
    pivot: 'bottom',
    targetHeight: 1.8,
  },
  {
    id: 'model.env-dsn-34m',
    src: 'nasa/dsn-34m.glb',
    nasaPath: '3D Models/Deep Space Network 34-meter/Deep Space Network 34-meter.glb',
    pivot: 'bottom',
    simplifyRatio: 0.5,
    simplifyError: 0.008,
  },
  {
    id: 'model.env-tall-dish',
    src: 'nasa/tall-dish.glb',
    pivot: 'bottom',
    targetHeight: 18,
    simplifyRatio: 0.45,
    simplifyError: 0.008,
    custom: buildTallDish,
  },
  {
    id: 'model.env-radome',
    src: 'nasa/radome.glb',
    nasaPath: '3D Models/Radome/Radome.glb',
    pivot: 'bottom',
    targetHeight: 2.2,
  },
  {
    id: 'model.env-jsc-mcc',
    src: 'nasa/jsc-mission-control.glb',
    nasaPath: '3D Models/JSC Mission Control Room/JSC Mission Control Room.glb',
    pivot: 'bottom',
    targetMaxDim: 8.0,
    simplifyRatio: 0.65,
    simplifyError: 0.005,
  },
  {
    id: 'model.env-tdrs',
    src: 'nasa/tdrs-relay.glb',
    nasaPath: '3D Models/Tracking and Data Relay Satellites (TDRS) (A)/Tracking and Data Relay Satellites (TDRS) (A).glb',
    pivot: 'center',
    targetMaxDim: 2.0,
  },
  {
    id: 'model.env-mobile-launcher',
    src: 'nasa/mobile-launcher.glb',
    nasaPath: '3D Models/Mobile Launcher/Mobile Launcher (assembled).glb',
    pivot: 'bottom',
    targetHeight: 24,
    simplifyRatio: 0.65,
    simplifyError: 0.005,
  },
  {
    id: 'model.env-launch-gantry',
    src: 'nasa/launch-gantry.glb',
    nasaPath: '3D Models/Gantry/Gantry.glb',
    pivot: 'bottom',
    simplifyRatio: 0.16,
    simplifyError: 0.02,
    lockBorder: false,
  },
  {
    id: 'model.env-crawler',
    src: 'nasa/crawler.glb',
    nasaPath: '3D Models/Crawler/Crawler.glb',
    pivot: 'bottom',
    simplifyRatio: 0.08,
    simplifyError: 0.05,
    lockBorder: false,
  },
  {
    id: 'model.env-vab',
    src: 'nasa/vab.glb',
    nasaPath: '3D Models/Vehicle Assembly Building (VAB)/Vehicle Assembly Building (VAB).glb',
    pivot: 'bottom',
  },
  {
    id: 'model.env-lunar-lander',
    src: 'nasa/lunar-lander.glb',
    nasaPath: '3D Models/Apollo Lunar Module/Apollo Lunar Module.glb',
    pivot: 'center',
    simplifyRatio: 0.3,
    simplifyError: 0.015,
    lockBorder: false,
  },
]

const CRATER_TEXTURE_NASA = 'Images and Textures/Moon - Lunar Crater/Moon - Lunar Crater.jpg'
const CRATER_TEXTURE_OUT = 'textures/lunar_crater_closeup_2k.webp'

async function createDecoderIo(): Promise<NodeIO> {
  const pkgReq = createRequire(path.join(ROOT, 'package.json'))
  const cliReq = createRequire(pkgReq.resolve('@gltf-transform/cli'))
  const draco3d = cliReq('draco3dgltf')
  await MeshoptSimplifier.ready
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })
}

/** Patch external relative image URIs in a GLB JSON chunk so NodeIO does not fail on missing loose textures. */
function patchMissingExternalUris(filePath: string): Uint8Array {
  const buf = fs.readFileSync(filePath)
  const jsonLen = buf.readUInt32LE(12)
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as {
    images?: Array<{ uri?: string; mimeType?: string }>
  }
  const dir = path.dirname(filePath)
  if (Array.isArray(gltf.images)) {
    gltf.images = gltf.images.map((img) => {
      if (img.uri && !img.uri.startsWith('data:') && !fs.existsSync(path.join(dir, img.uri))) {
        return { mimeType: 'image/png', uri: TRANSPARENT_PNG_DATA_URI }
      }
      return img
    })
  }
  const nextJson = JSON.stringify(gltf)
  const pad = (4 - (Buffer.byteLength(nextJson) % 4)) % 4
  const paddedJson = Buffer.from(nextJson + ' '.repeat(pad), 'utf8')
  const binChunk = buf.subarray(20 + jsonLen)
  const out = Buffer.alloc(20 + paddedJson.length + binChunk.length)
  buf.copy(out, 0, 0, 12)
  out.writeUInt32LE(out.length, 8)
  out.writeUInt32LE(paddedJson.length, 12)
  buf.copy(out, 16, 16, 20)
  paddedJson.copy(out, 20)
  binChunk.copy(out, 20 + paddedJson.length)
  return new Uint8Array(out)
}

async function buildLunarCraterFromStl(io: NodeIO): Promise<Document> {
  const stlPath = path.join(NASA_ROOT, '3D Printing/Moon - Aristarchus Region/Moon - Aristarchus Region.stl')
  const stlBuf = fs.readFileSync(stlPath)
  const ab = stlBuf.buffer.slice(stlBuf.byteOffset, stlBuf.byteOffset + stlBuf.byteLength)
  let geom = new STLLoader().parse(ab)
  // 3D-print STL is Z-up; rotate into Three.js Y-up, share vertices, and recompute smooth normals.
  geom.rotateX(-Math.PI / 2)
  geom.deleteAttribute('normal')
  geom = mergeVertices(geom, 1e-4)
  geom.computeVertexNormals()

  const mat = new THREE.MeshStandardMaterial({
    name: 'lunar_regolith',
    color: 0x80848c,
    roughness: 0.94,
    metalness: 0.02,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.name = 'aristarchus_crater'
  const root = new THREE.Group()
  root.add(mesh)
  const glb = await exportGlb(root)
  return io.readBinary(new Uint8Array(glb))
}

function consolidateScenes(doc: Document, groupNames: string[]): void {
  const root = doc.getRoot()
  const scenes = root.listScenes()
  const primary = scenes[0] ?? doc.createScene('Scene')
  scenes.forEach((sc, idx) => {
    const group = doc.createNode(groupNames[idx] ?? `part_${idx}`)
    for (const child of sc.listChildren()) {
      group.addChild(child)
    }
    primary.addChild(group)
    if (idx > 0) sc.dispose()
  })
}

async function buildTallDish(io: NodeIO): Promise<Document> {
  const dir = path.join(NASA_ROOT, '3D Models/Tall Dish')
  const postDoc = await io.readBinary(patchMissingExternalUris(path.join(dir, 'Tall Dish (post).glb')))
  const turntableDoc = await io.readBinary(patchMissingExternalUris(path.join(dir, 'Tall Dish (turntable).glb')))
  const dishDoc = await io.readBinary(patchMissingExternalUris(path.join(dir, 'Tall Dish (dish).glb')))

  // Replace materials that referenced missing external TURN_UV.JPG / tall_an.dds with NASA PBR colors.
  for (const m of postDoc.getRoot().listMaterials()) {
    if (m.getName() === 'pole') m.setBaseColorTexture(null)
    m.setBaseColorFactor([0.64, 0.70, 0.78, 1])
    m.setMetallicFactor(0.3)
    m.setRoughnessFactor(0.48)
  }
  for (const m of turntableDoc.getRoot().listMaterials()) {
    if (m.getName() === 'Default') {
      m.setBaseColorTexture(null)
      m.setBaseColorFactor([0.20, 0.38, 0.68, 1])
      m.setMetallicFactor(0.35)
      m.setRoughnessFactor(0.42)
    }
  }
  for (const m of dishDoc.getRoot().listMaterials()) {
    if (m.getName() === 'ant_tall') {
      m.setBaseColorTexture(null)
      m.setBaseColorFactor([0.92, 0.95, 0.98, 1])
      m.setMetallicFactor(0.2)
      m.setRoughnessFactor(0.38)
      m.setDoubleSided(true)
    }
  }

  const merged = new Document()
  await mergeDocuments(merged, postDoc)
  await mergeDocuments(merged, turntableDoc)
  await mergeDocuments(merged, dishDoc)
  consolidateScenes(merged, ['tall_dish_post', 'tall_dish_turntable', 'tall_dish_head'])
  await merged.transform(unpartition())

  const turntableNode = merged.getRoot().listNodes().find((n) => n.getName() === 'tall_dish_turntable')
  if (turntableNode) {
    // Raw turntable was ~2.54x smaller (inches vs cm) than the post collar; seat cleanly at post top (y = 70).
    turntableNode.setScale([2.54, 2.54, 2.54])
    turntableNode.setTranslation([0, 70, 0])
  }
  return merged
}

const STRIPPED_EXTENSIONS = new Set([
  'KHR_draco_mesh_compression',
  'FB_ngon_encoding',
  'KHR_materials_transmission',
  'KHR_materials_ior',
  'KHR_materials_specular',
])

function stripUnsupportedExtensions(doc: Document): void {
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (STRIPPED_EXTENSIONS.has(ext.extensionName)) {
      ext.dispose()
    }
  }
}

interface PbrOpts {
  clearTex?: boolean
  texToAo?: boolean
  emissive?: [number, number, number]
  alphaBlend?: boolean
}

function setPbr(
  m: Material,
  base: [number, number, number, number],
  metal: number,
  rough: number,
  opts: PbrOpts = {},
): void {
  m.setBaseColorFactor(base)
  m.setMetallicFactor(metal)
  m.setRoughnessFactor(rough)
  if (opts.texToAo) {
    const tex = m.getBaseColorTexture()
    if (tex) {
      const tc = m.getBaseColorTextureInfo()?.getTexCoord() ?? 0
      m.setOcclusionTexture(tex)
      m.getOcclusionTextureInfo()?.setTexCoord(tc)
      m.setOcclusionStrength(0.75)
    }
    m.setBaseColorTexture(null)
  } else if (opts.clearTex) {
    m.setBaseColorTexture(null)
  }
  if (opts.emissive) m.setEmissiveFactor(opts.emissive)
  if (opts.alphaBlend) m.setAlphaMode('BLEND')
}

const REMOVE_MCC_MATS = new Set([
  'ceiling',
  'floor',
  'wall',
  'wall_screen',
  'wall_top',
  'cabnet',
  'projector1',
  'lights',
  'edge',
  'far_right',
  'mid',
  'midle',
  'right',
  'screen',
  'picture1',
  'picture2',
  'picture3',
  'picture4',
  'picture5',
  'picture6',
])

function enhanceLaunchGantryMaterials(doc: Document): void {
  const mk = (name: string, base: [number, number, number, number], metal: number, rough: number) => {
    const m = doc.createMaterial(name)
    setPbr(m, base, metal, rough)
    return m
  }
  const trussOrange = mk('gantry_truss_orange', [0.88, 0.32, 0.10, 1], 0.28, 0.46)
  const coreSteel = mk('gantry_core_steel', [0.28, 0.36, 0.48, 1], 0.42, 0.42)
  const armsWhite = mk('gantry_arms_white', [0.92, 0.94, 0.97, 1], 0.22, 0.42)
  const craneYellow = mk('gantry_crane_yellow', [0.96, 0.66, 0.08, 1], 0.3, 0.4)

  for (const mesh of doc.getRoot().listMeshes()) {
    const name = mesh.getName()
    let target = trussOrange
    if (/^(group(49|5\d|6[0-3])|polySurface(696|909))\b/i.test(name)) target = craneYellow
    else if (/^(group(25|26|43)|pCylinder)\b/i.test(name)) target = armsWhite
    else if (/^(pCube|polySurface(115|334|341))\b/i.test(name)) target = coreSteel
    for (const prim of mesh.listPrimitives()) {
      prim.setMaterial(target)
    }
  }
}

/**
 * Restore crisp, non-black PBR colors and aerospace metalness/roughness across imported NASA models
 * BEFORE `dedup()` runs so similarly colored or monochrome legacy materials remain visually distinct.
 */
function enhanceNasaMaterials(doc: Document, specId: string): void {
  const mats = doc.getRoot().listMaterials()

  if (specId === 'model.env-vab') {
    for (const m of mats) {
      const n = m.getName()
      if (n === 'lambert7SG.001') setPbr(m, [1, 1, 1, 1], 0.05, 0.48)
      else if (n === 'lambert8SG.001' || n === 'lambert9SG.001') setPbr(m, [0.95, 0.96, 0.98, 1], 0.08, 0.46)
      else if (n === 'lambert10SG.001') setPbr(m, [0.16, 0.26, 0.46, 1], 0.15, 0.5, { clearTex: true })
      else if (n === 'lambert4SG.001') setPbr(m, [0.25, 0.45, 0.72, 1], 0.18, 0.48)
      else if (n === 'lambert5SG.001') setPbr(m, [0.78, 0.82, 0.88, 1], 0.2, 0.45)
      else if (n === 'lambert6SG.001' || n === 'texturedFacets2.001') setPbr(m, [0.12, 0.18, 0.30, 1], 0.15, 0.55)
      else if (n === 'initialShadingGroup.001') setPbr(m, [0.95, 0.52, 0.14, 1], 0.12, 0.46)
      else setPbr(m, [0.85, 0.88, 0.92, 1], 0.12, 0.48)
    }
    return
  }

  if (specId === 'model.env-dsn-34m') {
    let frameMat: Material | null = null
    for (const m of mats) {
      const n = m.getName()
      if (n === 'tex_01' || n === 'tex_02' || n === 'tex_02.003') setPbr(m, [0.95, 0.97, 1.0, 1], 0.15, 0.38, { clearTex: true })
      else if (n === 'truss_dish_AO') setPbr(m, [0.38, 0.56, 0.82, 1], 0.35, 0.42, { texToAo: true })
      else if (n === 'truss_2') setPbr(m, [0.76, 0.82, 0.90, 1], 0.4, 0.36)
      else if (n === 'frame_AO') {
        setPbr(m, [0.18, 0.38, 0.70, 1], 0.3, 0.45, { texToAo: true })
        frameMat = m
      } else if (n === 'stairs_plt_AO') setPbr(m, [0.95, 0.60, 0.14, 1], 0.25, 0.45, { clearTex: true })
      else if (n === 'wheels_AO') setPbr(m, [0.22, 0.26, 0.34, 1], 0.5, 0.4, { clearTex: true })
      else if (n === 'base_AO') setPbr(m, [0.88, 0.86, 0.82, 1], 0.05, 0.7, { texToAo: true })
    }
    const fallback = frameMat ?? mats[0]
    if (fallback) {
      for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          if (!prim.getMaterial()) prim.setMaterial(fallback)
        }
      }
    }
    return
  }

  if (specId === 'model.env-radome') {
    for (const m of mats) {
      const n = m.getName()
      if (n === 'base') setPbr(m, [0.22, 0.38, 0.66, 1], 0.2, 0.5, { clearTex: true })
      else setPbr(m, [0.95, 0.97, 1.0, 1], 0.08, 0.35, { clearTex: true })
    }
    return
  }

  if (specId === 'model.env-launch-gantry') {
    enhanceLaunchGantryMaterials(doc)
    return
  }

  if (specId === 'model.env-mobile-launcher') {
    for (const m of mats) {
      const n = m.getName()
      if (n === 'mobilelauncher_railings_mat') setPbr(m, [0.95, 0.64, 0.14, 1], 0.25, 0.45, { clearTex: true })
      else setPbr(m, [0.72, 0.78, 0.86, 1], 0.28, 0.45, { texToAo: true })
    }
    return
  }

  if (specId === 'model.env-crawler') {
    for (const m of mats) {
      const n = m.getName()
      if (n === 'lambert4SG1') setPbr(m, [0.90, 0.60, 0.10, 1], 0.28, 0.45)
      else if (n === 'lambert5SG1') setPbr(m, [0.22, 0.26, 0.32, 1], 0.5, 0.45)
      else if (n === 'lambert6SG1') setPbr(m, [0.86, 0.38, 0.12, 1], 0.25, 0.46)
      else if (n === 'lambert7SG1') setPbr(m, [0.76, 0.58, 0.20, 1], 0.45, 0.38)
      else if (n === 'initialShadingGroup2') setPbr(m, [0.92, 0.95, 0.98, 1], 0.15, 0.42)
      else if (n === 'phong1SG1') setPbr(m, [0.35, 0.74, 0.96, 0.65], 0.2, 0.2, { alphaBlend: true })
    }
    return
  }

  if (specId === 'model.env-astronaut') {
    for (const m of mats) {
      const n = m.getName()
      if (n === 'astnt1_2') setPbr(m, [1.0, 0.80, 0.35, 1], 0.65, 0.22)
      else setPbr(m, [1.0, 1.0, 1.0, 1], 0.05, 0.45)
    }
    return
  }

  if (specId === 'model.env-cleanroom-oru') {
    for (const m of mats) {
      const n = m.getName()
      if (n === 'spstob_eal_1') setPbr(m, [0.24, 0.46, 0.74, 1], 0.4, 0.36, { clearTex: true })
      else if (n === 'naming') setPbr(m, [0.96, 0.68, 0.14, 1], 0.25, 0.4, { clearTex: true })
      else setPbr(m, [1.0, 0.82, 0.34, 1], 0.55, 0.32)
    }
    return
  }

  if (specId === 'model.env-support-stand') {
    for (const m of mats) setPbr(m, [1.0, 0.90, 0.65, 1], 0.35, 0.4)
    return
  }

  if (specId === 'model.env-jsc-mcc') {
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of [...mesh.listPrimitives()]) {
        if (REMOVE_MCC_MATS.has(prim.getMaterial()?.getName() ?? '')) {
          mesh.removePrimitive(prim)
          prim.dispose()
        }
      }
    }
    for (const m of mats) {
      const n = m.getName()
      if (n === 'console_body' || n === 'console_back') setPbr(m, [0.16, 0.26, 0.42, 1], 0.35, 0.48)
      else if (n === 'console_desk') setPbr(m, [0.26, 0.36, 0.52, 1], 0.3, 0.42)
      else if (n === 'console_face') setPbr(m, [0.10, 0.15, 0.24, 1], 0.25, 0.5)
      else if (n === 'Keyboards') setPbr(m, [0.20, 0.25, 0.34, 1], 0.15, 0.6)
      else if (n === 'keyboard_special') setPbr(m, [0.95, 0.55, 0.12, 1], 0.2, 0.4, { emissive: [0.35, 0.18, 0.02] })
      else if (n === 'screens') setPbr(m, [0.22, 0.74, 0.97, 1], 0.1, 0.25, { emissive: [0.14, 0.48, 0.78] })
      else if (n === 'crstation_1') setPbr(m, [0.20, 0.83, 0.60, 1], 0.1, 0.25, { emissive: [0.10, 0.46, 0.32] })
      else if (n === 'crstation_2') setPbr(m, [0.98, 0.75, 0.14, 1], 0.1, 0.25, { emissive: [0.46, 0.32, 0.04] })
      else if (n.startsWith('console_namepla')) setPbr(m, [0.96, 0.62, 0.08, 1], 0.25, 0.4, { emissive: [0.28, 0.16, 0.02] })
    }
    return
  }

  if (specId === 'model.env-asteroid-bennu') {
    for (const m of mats) setPbr(m, [0.58, 0.50, 0.44, 1], 0.05, 0.9)
    return
  }

  if (specId === 'model.nasa-icecube' || specId === 'model.env-lro' || specId === 'model.env-tdrs' || specId === 'model.env-lunar-lander') {
    for (const m of mats) {
      const n = m.getName()
      if (/gold|thermal|mainbox|blinn1SG|blinn9SG|blinn10SG/i.test(n) && !m.getBaseColorTexture()) {
        setPbr(m, [0.92, 0.68, 0.16, 1], 0.55, 0.3)
      } else if (/bronze/i.test(n)) {
        setPbr(m, [0.84, 0.62, 0.26, 1], 0.55, 0.3)
      } else if (/(solar|WingBlue)/i.test(n) && !/(solarbacks|solaredges)/i.test(n)) {
        setPbr(m, [0.15, 0.28, 0.68, 1], 0.35, 0.25)
      } else if (/silver|Dish|whitepanel|MainBodyBottomLight|blinn4SG|blinn3SG/i.test(n) && !m.getBaseColorTexture()) {
        setPbr(m, [0.86, 0.89, 0.94, 1], 0.45, 0.35)
      } else if (m.getBaseColorTexture()) {
        m.setMetallicFactor(Math.max(m.getMetallicFactor(), 0.28))
        m.setRoughnessFactor(Math.min(m.getRoughnessFactor(), 0.38))
      }
    }
  }
}

function normalizeSceneBounds(doc: Document, spec: NasaGlbSpec): void {
  const scene = doc.getRoot().listScenes()[0]
  if (!scene) return
  const b = getBounds(scene)
  const dx = Math.max(1e-6, b.max[0] - b.min[0])
  const dy = Math.max(1e-6, b.max[1] - b.min[1])
  const dz = Math.max(1e-6, b.max[2] - b.min[2])
  const maxDim = Math.max(dx, dy, dz)

  let scale = 1
  if (spec.targetHeight !== undefined) scale = spec.targetHeight / dy
  else if (spec.targetMaxDim !== undefined) scale = spec.targetMaxDim / maxDim
  else if (spec.targetWidth !== undefined) scale = spec.targetWidth / dx

  const cx = (b.min[0] + b.max[0]) * 0.5
  const cy = (b.min[1] + b.max[1]) * 0.5
  const cz = (b.min[2] + b.max[2]) * 0.5
  const targetY = spec.pivot === 'bottom' ? -b.min[1] * scale : -cy * scale

  const wrapper: GltfNode = doc.createNode('nasa_normalized')
  wrapper.setScale([scale, scale, scale])
  wrapper.setTranslation([-cx * scale, targetY, -cz * scale])

  for (const child of scene.listChildren()) {
    wrapper.addChild(child)
  }
  scene.addChild(wrapper)
}

function countTriangles(doc: Document): number {
  let tris = 0
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      const pos = prim.getAttribute('POSITION')
      tris += idx ? idx.getCount() / 3 : pos ? pos.getCount() / 3 : 0
    }
  }
  return Math.round(tris)
}

export async function importNasaCraterTexture(opts: { refresh?: boolean } = {}): Promise<void> {
  const dest = outPath(CRATER_TEXTURE_OUT)
  if (!opts.refresh && fs.existsSync(dest)) return
  const rawImg = path.join(NASA_ROOT, CRATER_TEXTURE_NASA)
  if (!fs.existsSync(rawImg)) {
    throw new Error(`Missing NASA crater image at ${rawImg}`)
  }
  ensureDir(dest)
  await sharp(rawImg)
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest)
  console.log(`imported ${CRATER_TEXTURE_OUT}: ${kb(fs.statSync(dest).size)}`)
}

export async function importNasa3D(opts: { refresh?: boolean; onlySrc?: string | null } = {}): Promise<void> {
  await importNasaCraterTexture({ refresh: opts.refresh })

  const targets = NASA_MODEL_SPECS.filter(
    (s) => (!opts.onlySrc || s.src === opts.onlySrc) && (opts.refresh || !fs.existsSync(srcPath('models', s.src))),
  )
  if (targets.length === 0) return

  const io = await createDecoderIo()
  for (const spec of targets) {
    const dest = srcPath('models', spec.src)
    ensureDir(dest)

    let doc: Document
    if (spec.custom) {
      doc = await spec.custom(io)
    } else if (spec.nasaPath) {
      const input = path.join(NASA_ROOT, spec.nasaPath)
      if (!fs.existsSync(input)) throw new Error(`Missing NASA GLB: ${input}`)
      doc = await io.read(input)
    } else {
      throw new Error(`Spec ${spec.id} needs nasaPath or custom builder`)
    }

    stripUnsupportedExtensions(doc)
    enhanceNasaMaterials(doc, spec.id)
    await doc.transform(dedup(), prune())
    if (spec.simplifyRatio !== undefined) {
      await doc.transform(weld())
      await doc.transform(
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: spec.simplifyRatio,
          error: spec.simplifyError ?? 0.01,
          lockBorder: spec.lockBorder ?? true,
        }),
      )
      await doc.transform(prune())
    }

    normalizeSceneBounds(doc, spec)
    await io.write(dest, doc)
    const b = getBounds(doc.getRoot().listScenes()[0])
    const size = [0, 1, 2].map((i) => +(b.max[i] - b.min[i]).toFixed(2))
    console.log(
      `imported ${spec.src}: ${kb(fs.statSync(dest).size)}, ${countTriangles(doc)} tris, bounds=[${size.join(', ')}], minY=${b.min[1].toFixed(2)}`,
    )
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isDirectRun) {
  const refresh = process.argv.includes('--refresh')
  const onlyIdx = process.argv.indexOf('--only')
  const onlySrc = onlyIdx !== -1 ? process.argv[onlyIdx + 1] ?? null : null
  importNasa3D({ refresh, onlySrc }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
