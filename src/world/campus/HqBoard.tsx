import { useEffect, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { turnConstants } from '../../data/brief'
import { computeBudgets } from '../../sim/budgets'
import { useGameStore } from '../../state/gameStore'
import { Flap } from '../../ui/kit'
import { HQ } from './layout'

/** HQ block with the flip-board on its facade: money left and months to the launch window */
export function Headquarters() {
  const design = useGameStore((s) => s.design)
  const difficulty = useGameStore((s) => s.difficulty)
  const b = useMemo(() => computeBudgets(design, difficulty), [design, difficulty])
  const [w, d] = HQ.size
  const left = b.budgetMargin
  const months = b.rideTurn * turnConstants.monthsPerTurn
  // drei's Html misses its mount when it lands in the very first commit under StrictMode
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 50)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <group position={[HQ.pos[0], 0, HQ.pos[1]]} rotation={[0, HQ.yaw, 0]}>
      <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 4.4, d]} />
        <meshStandardMaterial color="#e6e1d4" roughness={0.9} />
      </mesh>
      <mesh position={[0, 4.55, 0]} castShadow>
        <boxGeometry args={[w + 0.5, 0.3, d + 0.5]} />
        <meshStandardMaterial color="#33415c" />
      </mesh>
      <mesh position={[0, 2.9, d / 2 + 0.03]}>
        <boxGeometry args={[w * 0.92, 2, 0.06]} />
        <meshStandardMaterial color="#10141c" />
      </mesh>
      {ready && (
        <Html center position={[0, 2.9, d / 2 + 0.2]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div
            data-testid="hq-board"
            className="flex w-[170px] items-center justify-around gap-3 py-1 text-center text-[#ffc24d]"
          >
            <div>
              <div className="text-xl font-bold tracking-wider">
                <Flap value={`$${left.toFixed(1)}M`} />
              </div>
              <div className="mt-1 text-[7px] uppercase tracking-[0.12em] text-paper-dim">budget left</div>
            </div>
            <div>
              <div className="text-xl font-bold tracking-wider">
                <Flap value={months} />
              </div>
              <div className="mt-1 text-[7px] uppercase tracking-[0.12em] text-paper-dim">months to window</div>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
