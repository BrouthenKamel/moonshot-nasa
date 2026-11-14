/**
 * pnpm assets:audio [--only <id>] [--force] [--dry]
 *
 * Generates every ElevenLabs audio entry in the manifest whose file is missing:
 * music (Music API), sfx (Sound Effects API), voice (TTS, needs `voiceId`).
 * Existing files are kept, so re-running only fills gaps and never re-spends credits;
 * pass --force with --only to regenerate one asset.
 *
 * Needs ELEVENLABS_API_KEY in .env or .env.local.
 */
import fs from 'node:fs'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { assets, type AudioAsset } from '../../src/assets/manifest.ts'
import { ensureDir, kb, loadEnv, outPath } from './lib/paths.ts'

loadEnv()
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const force = args.includes('--force')
const dry = args.includes('--dry')
if (force && !only) throw new Error('--force needs --only <id>, to avoid regenerating everything')

const audioAssets = (assets as readonly { kind: string; source: string }[]).filter(
  (a): a is AudioAsset => ['music', 'sfx', 'voice'].includes(a.kind) && a.source === 'elevenlabs',
)
const todo = audioAssets.filter((a) => (!only || a.id === only) && (force || !fs.existsSync(outPath(a.file))))
if (only && todo.length === 0) console.log(`Nothing to do for ${only} (exists? use --force)`)

const client = dry ? null : new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })

async function toBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer())
}

async function generate(a: AudioAsset): Promise<Buffer> {
  if (!client) throw new Error('dry run')
  if (!a.prompt) throw new Error(`${a.id} has no prompt`)
  switch (a.kind) {
    case 'music':
      return toBuffer(
        await client.music.compose({
          prompt: a.prompt,
          musicLengthMs: Math.round((a.durationSec ?? 60) * 1000),
          modelId: 'music_v2_5',
          forceInstrumental: true,
        }),
      )
    case 'sfx':
      return toBuffer(
        await client.textToSoundEffects.convert({
          text: a.prompt,
          durationSeconds: a.durationSec,
          loop: a.loop,
          promptInfluence: 0.5,
        }),
      )
    case 'voice':
      if (!a.voiceId) throw new Error(`${a.id} needs a voiceId`)
      return toBuffer(
        await client.textToSpeech.convert(a.voiceId, {
          text: a.prompt,
          modelId: 'eleven_v3',
          outputFormat: 'mp3_44100_128',
        }),
      )
  }
}

for (const a of todo) {
  if (dry) {
    console.log(`would generate ${a.id} (${a.kind}, ${a.durationSec ?? '?'} s) -> ${a.file}`)
    continue
  }
  process.stdout.write(`${a.id} ... `)
  const buf = await generate(a)
  const out = outPath(a.file)
  ensureDir(out)
  fs.writeFileSync(out, buf)
  console.log(`${kb(buf.length)} -> ${a.file}`)
}
