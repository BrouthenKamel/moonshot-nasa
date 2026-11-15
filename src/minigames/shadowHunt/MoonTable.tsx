import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { Moon } from '../../scene/space/Moon'
import { SITES, SWEEP_BINS, clampLat, isLit, type Site } from './logic'

export const ICE = '#5ee6f0'
export const KAPTON = '#e8a33d'
const HOLO = '#7fd0ff'

const R = 1.6
/** The whole hologram leans so the south pole faces the viewer */
const TILT = THREE.MathUtils.degToRad(-68)
const GROUP_Y = 0.25
const SUN_RING = 2.45
const rad = THREE.MathUtils.degToRad

export interface Sun {
  lon: number
  lat: number
}

/** Hologram pins sit further from the pole than the real craters, so the names do not overlap */
const displayColat = (colatDeg: number) => 3 + 2.6 * colatDeg

/** Unit vector (Moon frame) for a polar site: south pole is -Y, longitude 0 faces -X, east is +Z */
export function siteNormal(site: Site): THREE.Vector3 {
  const t = rad(displayColat(site.colatDeg))
  const l = rad(site.lonDeg)
  return new THREE.Vector3(-Math.sin(t) * Math.cos(l), -Math.cos(t), Math.sin(t) * Math.sin(l))
}

/** Sun direction in the Moon frame */
export function sunDirection(sun: Sun): THREE.Vector3 {
  const b = rad(clampLat(sun.lat))
  const l = rad(sun.lon)
  return new THREE.Vector3(-Math.cos(b) * Math.cos(l), Math.sin(b), Math.cos(b) * Math.sin(l))
}

const tiltEuler = new THREE.Euler(TILT, 0, 0)
const toWorld = (v: THREE.Vector3, point: boolean) => {
  const w = v.clone().applyEuler(tiltEuler)
  return point ? w.add(new THREE.Vector3(0, GROUP_Y, 0)) : w
}

const HOME_POSE = { pos: [0, -0.2, 5.1] as const, look: [0, -0.15, 0] as const }

/** Camera glides to a pose: the whole table, or a dolly onto one crater */
function CameraRig({ selected }: { selected: Site | null }) {
  const { camera } = useThree()
  const look = useRef(new THREE.Vector3(...HOME_POSE.look))
  const pose = useMemo(() => {
    if (!selected) return { pos: new THREE.Vector3(...HOME_POSE.pos), look: new THREE.Vector3(...HOME_POSE.look) }
    const n = siteNormal(selected)
    const target = toWorld(n.clone().multiplyScalar(R), true)
    const out = toWorld(n, false)
    return { pos: target.clone().add(out.multiplyScalar(0.7)).add(new THREE.Vector3(0, 0.12, 0)), look: target }
  }, [selected])
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 3.2)
    camera.position.lerp(pose.pos, k)
    look.current.lerp(pose.look, k)
    camera.lookAt(look.current)
  })
  return null
}

/** Eases the Sun toward where the player is dragging it, so it settles instead of jumping */
function SunEase({ target, sun, onSun }: { target: MutableRefObject<Sun>; sun: Sun; onSun: (s: Sun) => void }) {
  const cur = useRef({ ...sun })
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 14)
    const c = cur.current
    const dl = ((((target.current.lon - c.lon) % 360) + 540) % 360) - 180
    const dLat = target.current.lat - c.lat
    if (Math.abs(dl) < 0.02 && Math.abs(dLat) < 0.002) return
    c.lon = (c.lon + dl * k + 360) % 360
    c.lat += dLat * k
    onSun({ lon: c.lon, lat: c.lat })
  })
  return null
}

interface MarkerProps {
  site: Site
  sun: Sun
  seenLit: boolean
  tagged: boolean
  selected: boolean
  onSelect: (s: Site) => void
}

function Marker({ site, sun, seenLit, tagged, selected, onSelect }: MarkerProps) {
  const [hover, setHover] = useState(false)
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const pos = useMemo(() => siteNormal(site).multiplyScalar(R * 1.004), [site])
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), siteNormal(site)), [site])
  const lit = isLit(site, sun.lon, sun.lat)
  const color = tagged ? ICE : lit ? KAPTON : seenLit ? '#a9743a' : HOLO
  const base = site.kind === 'crater' ? 0.075 : 0.05

  useFrame((s, dt) => {
    const g = group.current
    if (!g) return
    const want = (hover || selected ? 1.3 : 1) * (1 + 0.05 * Math.sin(s.clock.elapsedTime * 3 + pos.x * 9))
    g.scale.setScalar(g.scale.x + (want - g.scale.x) * (1 - Math.exp(-dt * 12)))
    if (ring.current) ring.current.rotation.z += dt * (tagged ? 0.4 : 0.8)
  })
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  return (
    <group position={pos} quaternion={quat}>
      <group ref={group}>
        <mesh ref={ring}>
          <ringGeometry args={[base, base * 1.16, site.kind === 'crater' ? 40 : 4]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh>
          <circleGeometry args={[base * (tagged ? 0.95 : 0.55), 32]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={tagged ? 0.5 : lit ? 0.45 : 0.14} depthWrite={false} />
        </mesh>
        {/* a generous invisible target so small pins are easy to click */}
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(true)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHover(false)
            document.body.style.cursor = ''
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (e.delta > 6) return
            e.stopPropagation()
            onSelect(site)
          }}
        >
          <circleGeometry args={[base * 2, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {(hover || selected) && (
          <Html center position={[0, 0, 0.02]} style={{ pointerEvents: 'none', transform: 'translateY(-30px)' }} zIndexRange={[5, 0]}>
            <span className="whitespace-nowrap rounded bg-ink-0/70 px-1.5 py-0.5 font-mono text-[11px] text-paper">{site.name}</span>
          </Html>
        )}
      </group>
    </group>
  )
}

/** The path the Sun travels, drawn in as the player sweeps it round */
function SweepRing({ swept }: { swept: readonly boolean[] }) {
  const arc = rad(360 / SWEEP_BINS)
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {swept.map((done, b) => (
        <mesh key={b} rotation={[0, 0, Math.PI - rad((b + 1) * (360 / SWEEP_BINS))]}>
          <torusGeometry args={[SUN_RING, done ? 0.02 : 0.006, 6, 10, arc * 0.94]} />
          <meshBasicMaterial color={done ? KAPTON : HOLO} toneMapped={false} transparent opacity={done ? 0.9 : 0.3} />
        </mesh>
      ))}
    </group>
  )
}

interface Props {
  sun: Sun
  target: MutableRefObject<Sun>
  onSun: (s: Sun) => void
  swept: readonly boolean[]
  seenLit: readonly string[]
  tagged: readonly string[]
  selected: Site | null
  onSelect: (s: Site) => void
}

/** The briefing-table hologram: the Moon, the Sun on its ring, and a pin per candidate site */
export function MoonTable({ sun, target, onSun, swept, seenLit, tagged, selected, onSelect }: Props) {
  const dir = sunDirection(sun)
  // The Sun's tilt is shown 6x so the player can see the nudge; the lighting and rules use the real angle
  const visDir = sunDirection({ lon: sun.lon, lat: sun.lat * 6 })
  const sunPos = visDir.clone().multiplyScalar(SUN_RING)
  return (
    <>
      <CameraRig selected={selected} />
      <SunEase target={target} sun={sun} onSun={onSun} />
      <ambientLight intensity={0.07} />
      <group position={[0, GROUP_Y, 0]} rotation={[TILT, 0, 0]}>
        <directionalLight position={dir.clone().multiplyScalar(10)} intensity={3.4} color="#fff4e0" />
        <Moon radius={R} segments={64} />
        <SweepRing swept={swept} />
        <mesh position={sunPos}>
          <sphereGeometry args={[0.13, 24, 16]} />
          <meshBasicMaterial color="#ffd27a" toneMapped={false} />
        </mesh>
        <mesh position={sunPos}>
          <sphereGeometry args={[0.24, 24, 16]} />
          <meshBasicMaterial color={KAPTON} toneMapped={false} transparent opacity={0.22} depthWrite={false} />
        </mesh>
        {SITES.map((s) => (
          <Marker
            key={s.id}
            site={s}
            sun={sun}
            seenLit={seenLit.includes(s.id)}
            tagged={tagged.includes(s.id)}
            selected={selected?.id === s.id}
            onSelect={onSelect}
          />
        ))}
      </group>
      {/* the projector base on the briefing table */}
      <group position={[0, -2.3, 0]}>
        <mesh>
          <cylinderGeometry args={[1.1, 1.3, 0.14, 48]} />
          <meshStandardMaterial color="#1a1f2b" roughness={0.6} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 0.86, 64]} />
          <meshBasicMaterial color={HOLO} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}
