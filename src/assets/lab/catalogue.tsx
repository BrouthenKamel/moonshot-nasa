/**
 * Catalogue Lab (dev only): http://localhost:5173/catalogue-lab.html
 * Every choice in the game dealt as ChoiceCards, with the real catalogue numbers, to review
 * the art and try the cards (hover, pick sounds, selected and disabled states).
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import { allParts, type Part } from '../../data/parts'
import { lunarOrbits as orbits } from '../../data/orbits'
import { rides } from '../../data/rides'
import { transfers } from '../../data/transfers'
import { groundStations } from '../../data/ground'
import { difficultyPresets } from '../../data/brief'
import { ChoiceCard, type ChoiceStat } from '../../ui/kit/ChoiceCard'

const CATEGORY_TITLE: Record<string, string> = {
  structure: 'Structure',
  solar: 'Solar power',
  battery: 'Batteries',
  computer: 'Flight computers',
  attitude: 'Attitude control',
  propulsion: 'Propulsion',
  radio: 'Radios',
  instrument: 'Instruments',
}

function partStats(p: Part): ChoiceStat[] {
  const out: ChoiceStat[] = [
    { label: 'Mass', value: `${p.mass} kg` },
    { label: 'Volume', value: `${p.volume} U` },
  ]
  if (p.power) out.push({ label: p.power > 0 ? 'Makes' : 'Draws', value: `${Math.abs(p.power)} W`, tone: p.power > 0 ? 'good' : undefined })
  out.push({ label: 'Cost', value: `$${p.cost}M` })
  return out.slice(0, 4)
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-xl font-bold text-white">{title}</h2>
      <div className="flex flex-wrap gap-5">{children}</div>
    </section>
  )
}

function Lab() {
  const [picked, setPicked] = useState<Record<string, string>>({})
  const pick = (group: string, id: string) => setPicked((s) => ({ ...s, [group]: id }))
  const categories = [...new Set(allParts.map((p) => p.category))]
  return (
    <div className="min-h-screen bg-[#03050a] p-8 text-slate-100">
      <h1 className="font-display text-3xl font-bold">Catalogue Lab</h1>
      <p className="mb-8 mt-1 text-sm text-slate-400">Every choice as a card. Hover, pick, listen. The last card of each row is shown disabled.</p>
      {categories.map((c) => {
        const list = allParts.filter((p) => p.category === c)
        return (
          <Row key={c} title={CATEGORY_TITLE[c] ?? c}>
            {list.map((p, i) => (
              <ChoiceCard
                key={p.id}
                id={p.id}
                title={p.name}
                subtitle={p.description}
                stats={partStats(p)}
                selected={picked[c] === p.id}
                disabled={list.length > 1 && i === list.length - 1 && c === 'propulsion'}
                reason="Does not fit: 0.4 U over the 6U box"
                onPick={() => pick(c, p.id)}
              />
            ))}
          </Row>
        )
      })}
      <Row title="Orbits">
        {orbits.map((o) => (
          <ChoiceCard key={o.id} id={o.id} size="lg" title={o.name} subtitle={o.description} selected={picked.orbit === o.id} onPick={() => pick('orbit', o.id)} />
        ))}
      </Row>
      <Row title="Rides">
        {rides.map((r) => (
          <ChoiceCard key={r.id} id={r.id} size="lg" look="scene" title={r.name} subtitle={r.description} stats={[{ label: 'Fee', value: `$${r.cost}M` }, { label: 'Mass limit', value: `${r.massLimit} kg` }]} selected={picked.ride === r.id} onPick={() => pick('ride', r.id)} />
        ))}
        {rides.map((r) => (
          <ChoiceCard key={`${r.id}-p`} id={r.id} look="portrait" title={r.name} tag="Portrait" onPick={() => pick('ride', r.id)} />
        ))}
      </Row>
      <Row title="Transfers">
        {transfers.map((t) => (
          <ChoiceCard key={t.id} id={t.id} size="lg" title={t.name} subtitle={t.description} selected={picked.transfer === t.id} onPick={() => pick('transfer', t.id)} />
        ))}
      </Row>
      <Row title="Ground stations">
        {groundStations.map((g) => (
          <ChoiceCard key={g.id} id={g.id} size="lg" look="scene" title={g.name} subtitle={g.description} selected={picked.ground === g.id} onPick={() => pick('ground', g.id)} />
        ))}
        {groundStations.map((g) => (
          <ChoiceCard key={`${g.id}-p`} id={g.id} look="portrait" title={g.name} tag="Portrait" onPick={() => pick('ground', g.id)} />
        ))}
      </Row>
      <Row title="Difficulty">
        {(Object.keys(difficultyPresets) as (keyof typeof difficultyPresets)[]).map((d) => (
          <ChoiceCard key={d} id={d} size="lg" title={difficultyPresets[d].name} subtitle={difficultyPresets[d].description} selected={picked.difficulty === d} onPick={() => pick('difficulty', d)} />
        ))}
      </Row>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
