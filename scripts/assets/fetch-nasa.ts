/**
 * pnpm assets:nasa [--force]
 *
 * Downloads NASA's public-domain maps into assets-src/raw/ (gitignored) and converts
 * them to the WebP textures the space scenes use, in public/assets/textures/.
 *
 * Sources
 * - Moon colour and elevation: NASA SVS CGI Moon Kit (LRO camera mosaic, LOLA altimeter)
 *   https://svs.gsfc.nasa.gov/4720
 * - Earth by day: Blue Marble Next Generation, December, with topography and bathymetry
 * - Earth by night: Suomi NPP "Black Marble" 2012
 * - Stars: NASA SVS Deep Star Maps 2020  https://svs.gsfc.nasa.gov/4851
 */
import fs from 'node:fs'
import sharp from 'sharp'
import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { ensureDir, kb, outPath, srcPath } from './lib/paths.ts'

const SOURCES = {
  'moon-color-4k.tif': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif',
  'moon-ldem-16.tif': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif',
  'earth-day.jpg':
    'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december/world.topo.bathy.200412.3x5400x2700.jpg',
  'earth-night.jpg':
    'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg',
  'stars-4k.exr': 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_4k.exr',
} as const

const force = process.argv.includes('--force')
const raw = (name: string) => srcPath('raw', name)
const tex = (name: string) => outPath('textures', name)

async function download(name: keyof typeof SOURCES) {
  const file = raw(name)
  if (fs.existsSync(file) && !force) return
  ensureDir(file)
  process.stdout.write(`download ${name} ... `)
  const res = await fetch(SOURCES[name])
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log(kb(fs.statSync(file).size))
}

function done(name: string) {
  console.log(`${name}: ${kb(fs.statSync(tex(name)).size)}`)
}

/** Colour maps: resize to a power-of-two equirectangular texture */
async function colour(src: string, out: string, width: number, quality: number) {
  ensureDir(tex(out))
  await sharp(raw(src), { limitInputPixels: false })
    .resize(width, width / 2, { fit: 'fill', kernel: 'lanczos3' })
    .webp({ quality, effort: 5 })
    .toFile(tex(out))
  done(out)
}

/**
 * Tangent-space normal map from the LOLA elevation map (16 px per degree, uint16, 0.5 m units).
 * Slopes are taken on the sphere (a pixel is narrower near the poles) and exaggerated, because
 * true lunar relief is too gentle to read from orbit.
 */
async function moonNormal(out: string, width: number, exaggeration: number) {
  const height = width / 2
  const { data } = await sharp(raw('moon-ldem-16.tif'), { limitInputPixels: false })
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .toColourspace('grey16') // keep the 16-bit elevations; the default pipeline squeezes them to 8 bits
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true })
  const h = new Uint16Array(data.buffer, data.byteOffset, width * height)
  const R = 1737.4 // km
  const metres = 0.5 / 1000 // one unit, in km
  const dLat = (Math.PI * R) / height // km per pixel, north-south
  const rgb = Buffer.alloc(width * height * 3)
  const at = (x: number, y: number) => h[Math.min(height - 1, Math.max(0, y)) * width + ((x + width) % width)] * metres
  for (let y = 0; y < height; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / height) * Math.PI
    const dLon = Math.max(0.05, Math.cos(lat)) * ((2 * Math.PI * R) / width) // km per pixel, east-west
    for (let x = 0; x < width; x++) {
      const sx = ((at(x + 1, y) - at(x - 1, y)) / (2 * dLon)) * exaggeration
      const sy = ((at(x, y - 1) - at(x, y + 1)) / (2 * dLat)) * exaggeration // +v is north
      const inv = 1 / Math.hypot(sx, sy, 1)
      const i = (y * width + x) * 3
      rgb[i] = Math.round((-sx * inv * 0.5 + 0.5) * 255)
      rgb[i + 1] = Math.round((-sy * inv * 0.5 + 0.5) * 255)
      rgb[i + 2] = Math.round((inv * 0.5 + 0.5) * 255)
    }
  }
  ensureDir(tex(out))
  await sharp(rgb, { raw: { width, height, channels: 3 } }).webp({ quality: 88, effort: 5 }).toFile(tex(out))
  done(out)
}

/** Elevation as an 8-bit map (0 = lowest, 255 = highest), for terrain close-ups and the ice mask */
async function moonHeight(out: string, width: number) {
  ensureDir(tex(out))
  await sharp(raw('moon-ldem-16.tif'), { limitInputPixels: false })
    .extractChannel(0)
    .resize(width, width / 2, { fit: 'fill' })
    .normalise()
    .toColourspace('b-w')
    .webp({ quality: 90 })
    .toFile(tex(out))
  done(out)
}

/** Colatitude radius of the south-polar map, in degrees. Shared with the IceCap shader. */
const ICE_CAP_DEG = 12

/**
 * South-polar map of where ice could be: crater floors (ground lower than its surroundings)
 * within 12 degrees of the pole. Azimuthal projection, pole at the centre, edge at 78 S.
 * Red = how deep below the local mean (the ice mask), green = elevation, for shading.
 * Illustrative, not a measured ice map: permanently shadowed regions are crater floors like these.
 */
async function moonIce(out: string, size: number) {
  const W = 5760
  const H = 2880
  const { data } = await sharp(raw('moon-ldem-16.tif'), { limitInputPixels: false })
    .toColourspace('grey16')
    .raw({ depth: 'ushort' })
    .toBuffer({ resolveWithObject: true })
  const src = new Uint16Array(data.buffer, data.byteOffset, W * H)
  const sample = (u: number, v: number) => {
    const x = (((u % 1) + 1) % 1) * W - 0.5
    const y = Math.min(H - 1.001, Math.max(0, v * H - 0.5))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const p = (xx: number, yy: number) => src[yy * W + ((xx + W) % W)]
    return (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy
  }
  // Elevation in km on the polar grid
  const h = new Float32Array(size * size)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const px = (2 * (i + 0.5)) / size - 1
      const pz = (2 * (j + 0.5)) / size - 1
      const r = Math.min(1.42, Math.hypot(px, pz))
      // Matches three's SphereGeometry: x = -cos(phi), z = sin(phi), u = phi / 2pi
      const phi = Math.atan2(pz, -px)
      const lat = -90 + r * ICE_CAP_DEG
      h[j * size + i] = sample(phi / (2 * Math.PI), (90 - lat) / 180) * 0.0005
    }
  }
  // Local mean by a separable box blur (about 40 km wide)
  const rad = Math.round(size * 0.028)
  const tmp = new Float32Array(size * size)
  const mean = new Float32Array(size * size)
  const blur = (from: Float32Array, to: Float32Array, dx: number, dy: number) => {
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        let sum = 0
        let n = 0
        for (let k = -rad; k <= rad; k++) {
          const x = i + k * dx
          const y = j + k * dy
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          sum += from[y * size + x]
          n++
        }
        to[j * size + i] = sum / n
      }
  }
  blur(h, tmp, 1, 0)
  blur(tmp, mean, 0, 1)
  let lo = Infinity
  let hi = -Infinity
  for (const v of h) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  const rgb = Buffer.alloc(size * size * 3)
  for (let k = 0; k < size * size; k++) {
    const depth = mean[k] - h[k] // km below the surroundings
    rgb[k * 3] = Math.round(255 * Math.min(1, Math.max(0, (depth - 0.25) / 1.2)))
    rgb[k * 3 + 1] = Math.round((255 * (h[k] - lo)) / (hi - lo))
  }
  ensureDir(tex(out))
  await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 90 }).toFile(tex(out))
  done(out)
}

/** Star map: HDR EXR to a tone-mapped 8-bit sky */
async function stars(out: string, width: number) {
  const buf = fs.readFileSync(raw('stars-4k.exr'))
  const exr = new EXRLoader().setDataType(THREE.FloatType).parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const w = exr.width as number
  const hgt = exr.height as number
  const src = exr.data as Float32Array
  const ch = src.length / (w * hgt)
  const rgb = Buffer.alloc(w * hgt * 3)
  const exposure = 1.6
  for (let y = 0; y < hgt; y++) {
    // EXRLoader returns rows bottom-up
    const sy = hgt - 1 - y
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const v = src[(sy * w + x) * ch + c] * exposure
        // Display gamma, then a contrast curve so empty sky is black instead of grey
        rgb[(y * w + x) * 3 + c] = Math.round(255 * Math.pow(Math.min(1, Math.pow(Math.max(0, v), 1 / 2.2)), 1.7))
      }
    }
  }
  ensureDir(tex(out))
  await sharp(rgb, { raw: { width: w, height: hgt, channels: 3 } })
    .resize(width, width / 2, { fit: 'fill' })
    .webp({ quality: 80, effort: 5 })
    .toFile(tex(out))
  done(out)
}

for (const name of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) await download(name)

await colour('moon-color-4k.tif', 'moon-color.webp', 4096, 84)
await moonNormal('moon-normal.webp', 4096, 3)
await moonHeight('moon-height.webp', 2048)
await moonIce('moon-ice.webp', 1024)
await colour('earth-day.jpg', 'earth-day.webp', 4096, 82)
await colour('earth-night.jpg', 'earth-night.webp', 2048, 80)
try {
  await stars('stars.webp', 4096)
} catch (e) {
  console.warn(`stars: could not decode the EXR (${(e as Error).message}); the scenes fall back to procedural stars`)
}
