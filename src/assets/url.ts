import { getAsset, type AssetId } from './manifest'

/** Public URL of an asset; respects Vite's base path (e.g. GitHub Pages sub-path). */
export function assetUrl(id: AssetId): string {
  return `${import.meta.env.BASE_URL}assets/${getAsset(id).file}`
}
