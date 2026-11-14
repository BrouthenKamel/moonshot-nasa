/**
 * Asset Lab (dev only): http://localhost:5173/asset-lab.html
 * Inspect every manifest asset: models on a turntable with part toggles and pivot
 * deployment, audio with play/stop. Not part of the production build.
 */
import { StrictMode, Suspense, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Box3, Euler, Vector3, type Group, type Object3D } from 'three'
import '../../index.css'
import { assets, type AudioId, type ModelId } from '../manifest'
import { audio, useAudioSettings } from '../audio'
import { useModel } from '../models'

function partNames(root: Object3D) {
  const out: string[] = []
  root.traverse((o) => o.name.startsWith('part_') && out.push(o.name.slice(5)))
  return out
}

function ModelStage({ id, visible, deploy, spin }: { id: ModelId; visible: Set<string>; deploy: number; spin: boolean }) {
  const model = useModel(id)
  const [ref, setRef] = useState<Group | null>(null)

  // Fit the model into a ~2 unit box, centred on the floor
  const { scale, offset } = useMemo(() => {
    const b = new Box3().setFromObject(model)
    const size = b.getSize(new Vector3())
    const s = 2 / Math.max(size.x, size.y, size.z)
    const c = b.getCenter(new Vector3())
    return { scale: s, offset: new Vector3(-c.x, -b.min.y, -c.z) }
  }, [model])

  useEffect(() => {
    model.traverse((o) => {
      if (o.name.startsWith('part_')) o.visible = visible.has(o.name.slice(5))
      if (o.name.startsWith('pivot_')) {
        o.userData.deployed ??= o.rotation.clone()
        const stowed = o.userData.stowed as [number, number, number] | undefined
        if (!stowed) return
        const d = o.userData.deployed as Euler
        o.rotation.set(
          stowed[0] + (d.x - stowed[0]) * deploy,
          stowed[1] + (d.y - stowed[1]) * deploy,
          stowed[2] + (d.z - stowed[2]) * deploy,
        )
      }
    })
  }, [model, visible, deploy])

  useFrame((_, dt) => {
    if (ref && spin) ref.rotation.y += dt * 0.3
  })

  return (
    <group ref={setRef}>
      <group scale={scale}>
        <primitive object={model} position={offset} />
      </group>
    </group>
  )
}

function ModelPanel({ id }: { id: ModelId }) {
  const model = useModel(id)
  const parts = useMemo(() => partNames(model), [model])
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(['solar-2wing', 'radio-xband', 'prop-ion', 'inst-ir-spec', 'inst-laser', 'attitude-precision']),
  )
  const [deploy, setDeploy] = useState(1)
  const [spin, setSpin] = useState(true)

  const toggle = (p: string) =>
    setVisible((s) => {
      const n = new Set(s)
      if (n.has(p)) n.delete(p)
      else n.add(p)
      return n
    })

  return (
    <div className="flex h-full">
      <div className="relative flex-1">
        <Canvas shadows camera={{ position: [2.6, 1.8, 2.6], fov: 40 }} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#0d1220']} />
          <directionalLight position={[3, 4, 2]} intensity={2.2} castShadow />
          <ambientLight intensity={0.15} />
          <Environment resolution={256}>
            <Lightformer intensity={2} position={[0, 4, 0]} scale={[6, 6, 1]} rotation-x={Math.PI / 2} />
            <Lightformer intensity={1.2} position={[-4, 1, 2]} scale={[3, 2, 1]} rotation-y={Math.PI / 2} color="#ffd9a8" />
            <Lightformer intensity={0.8} position={[4, 1, -2]} scale={[3, 2, 1]} rotation-y={-Math.PI / 2} color="#a8c8ff" />
          </Environment>
          <ModelStage id={id} visible={visible} deploy={deploy} spin={spin} />
          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={6} blur={2.4} far={2} />
          <OrbitControls makeDefault target={[0, 0.4, 0]} />
        </Canvas>
      </div>
      <aside className="w-64 space-y-4 overflow-auto border-l border-slate-800 p-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> Turntable
        </label>
        <label className="block">
          Deploy pivots: {Math.round(deploy * 100)}%
          <input className="w-full" type="range" min={0} max={1} step={0.01} value={deploy} onChange={(e) => setDeploy(+e.target.value)} />
        </label>
        {parts.length > 0 && (
          <div>
            <div className="mb-1 font-semibold text-slate-300">Parts</div>
            {parts.map((p) => (
              <label key={p} className="flex items-center gap-2 text-slate-400">
                <input type="checkbox" checked={visible.has(p)} onChange={() => toggle(p)} /> {p}
              </label>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}

function AudioRow({ id, kind, caption }: { id: AudioId; kind: string; caption?: string }) {
  return (
    <div className="flex items-center gap-2 rounded bg-slate-900 p-2">
      <button
        className="rounded bg-blue-600 px-2 py-1 text-xs"
        onClick={() => (kind === 'music' ? audio.playMusic(id) : kind === 'voice' ? void audio.say(id) : audio.play(id))}
      >
        Play
      </button>
      {kind === 'music' && (
        <button className="rounded bg-slate-700 px-2 py-1 text-xs" onClick={() => audio.stopMusic()}>
          Stop
        </button>
      )}
      <span className="text-slate-300">{id}</span>
      {caption && <span className="text-xs text-slate-500">"{caption}"</span>}
    </div>
  )
}

function Lab() {
  const models = assets.filter((a) => a.kind === 'model')
  const sounds = assets.filter((a) => a.kind !== 'model')
  const [modelId, setModelId] = useState<ModelId | undefined>(models[0]?.id as ModelId | undefined)
  const caption = useAudioSettings((s) => s.caption)
  const { muted, setMuted, volume, setVolume } = useAudioSettings()

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-4 border-b border-slate-800 px-4 py-2">
        <h1 className="font-bold">Asset Lab</h1>
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => setModelId(m.id as ModelId)}
            className={`rounded px-2 py-1 text-xs ${m.id === modelId ? 'bg-blue-600' : 'bg-slate-800'}`}
          >
            {m.id}
          </button>
        ))}
      </header>
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1">
          <Suspense fallback={<div className="p-4 text-slate-500">Loading model...</div>}>
            {modelId && <ModelPanel key={modelId} id={modelId} />}
          </Suspense>
        </main>
        <aside className="w-96 space-y-2 overflow-auto border-l border-slate-800 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Audio</span>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> mute
            </label>
          </div>
          {(['music', 'sfx', 'voice'] as const).map((g) => (
            <label key={g} className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-10">{g}</span>
              <input type="range" min={0} max={1} step={0.05} value={volume[g]} onChange={(e) => setVolume(g, +e.target.value)} />
            </label>
          ))}
          {sounds.map((s) => (
            <AudioRow key={s.id} id={s.id as AudioId} kind={s.kind} caption={'caption' in s ? (s.caption as string) : undefined} />
          ))}
          {caption && <div className="rounded bg-black/70 p-2 text-center">{caption}</div>}
        </aside>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
