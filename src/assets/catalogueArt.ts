import { allParts as parts } from '../data/parts'
import type { AudioId, ImageId, ModelId } from './manifest'
import { CATALOGUE_MODELS } from './catalogueModels'

/**
 * The art for every choice in the game, by catalogue id: which 3D model, portrait, painted
 * card and pick sound to use, and its accent colour. One lookup for any screen that shows a
 * choice as a card or a piece of hardware.
 *
 * - Physical things (parts, ground stations, launch vehicles) have a `model` and a rendered
 *   `portrait` (512 px transparent WebP from `pnpm assets:portraits`).
 * - Situations (orbits, transfers, rides, ground stations) have a painted `card`
 *   (1024 x 576 WebP). Ground stations and rides have both.
 */

export type ChoiceKind = 'part' | 'orbit' | 'transfer' | 'ride' | 'ground'

export interface ChoiceArt {
  id: string
  kind: ChoiceKind
  /** Part category (solar, battery, ...) for parts; the kind otherwise */
  category: string
  /** Accent colour for frames, glows and highlights */
  accent: string
  model?: ModelId
  portrait?: ImageId
  card?: ImageId
  /** Sound when the player picks it */
  pick: AudioId
}

/** Part category colours, as on the Factory's tray (cyan is reserved for ice) */
export const CATEGORY_ACCENT: Record<string, string> = {
  // Muted family swatches, kin to the role colours (ground/science/space/launch)
  structure: '#948d7f',
  solar: '#7c9cc9',
  battery: '#a3b865',
  computer: '#a394cc',
  attitude: '#c48a7c',
  propulsion: '#d98e55',
  instrument: '#c9b27a',
  radio: '#8aa39b',
}

const PICK_BY_CATEGORY: Record<string, AudioId> = {
  structure: 'sfx.snap',
  solar: 'sfx.pick-solar',
  battery: 'sfx.pick-battery',
  computer: 'sfx.pick-computer',
  attitude: 'sfx.pick-attitude',
  propulsion: 'sfx.pick-propulsion',
  instrument: 'sfx.pick-instrument',
  radio: 'sfx.pick-radio',
}

/** One colour per orbit, everywhere an orbit is drawn (docs/DESIGN-DIRECTION.md) */
const ORBIT_ACCENT: Record<string, string> = {
  'orbit-halo': '#a78bfa',
  'orbit-elliptical': '#a3e635',
  'orbit-100km': '#38bdf8',
}

const MODEL_IDS = new Set<string>(CATALOGUE_MODELS.map((m) => m.id))
const modelFor = (id: string) => (MODEL_IDS.has(`model.${id}`) ? (`model.${id}` as ModelId) : undefined)

/** Portraits exist for every catalogue model once `pnpm assets:portraits` has run */
const portraitFor = (id: string) => (modelFor(id) ? (`portrait.${id}` as ImageId) : undefined)

function build(): Map<string, ChoiceArt> {
  const out = new Map<string, ChoiceArt>()
  for (const p of parts) {
    out.set(p.id, {
      id: p.id,
      kind: 'part',
      category: p.category,
      accent: CATEGORY_ACCENT[p.category] ?? '#948d7f',
      model: modelFor(p.id),
      portrait: portraitFor(p.id),
      pick: PICK_BY_CATEGORY[p.category] ?? 'sfx.select',
    })
  }
  for (const id of ['orbit-halo', 'orbit-elliptical', 'orbit-100km'])
    out.set(id, { id, kind: 'orbit', category: 'orbit', accent: ORBIT_ACCENT[id], card: `card.${id}` as ImageId, pick: 'sfx.pick-orbit' })
  for (const id of ['transfer-direct', 'transfer-low-energy'])
    out.set(id, { id, kind: 'transfer', category: 'transfer', accent: id === 'transfer-direct' ? '#e8a33d' : '#b9b2a3', card: `card.${id}` as ImageId, pick: 'sfx.pick-orbit' })
  for (const id of ['ride-gto', 'ride-lunar', 'ride-commercial'])
    out.set(id, { id, kind: 'ride', category: 'ride', accent: '#d98e55', model: modelFor(id), portrait: portraitFor(id), card: `card.${id}` as ImageId, pick: 'sfx.pick-ride' })
  for (const id of ['ground-small', 'ground-medium', 'ground-dsn'])
    out.set(id, { id, kind: 'ground', category: 'ground', accent: '#7c9cc9', model: modelFor(id), portrait: portraitFor(id), card: `card.${id}` as ImageId, pick: 'sfx.pick-ground' })
  return out
}

const ART = build()

/** Art for a catalogue id (part id, orbit id, ride id, transfer id, ground station id) */
export function choiceArt(id: string): ChoiceArt | undefined {
  return ART.get(id)
}

export function allChoiceArt(): ChoiceArt[] {
  return [...ART.values()]
}
