import { useMemo } from 'react'
import type { Report } from '../../sim/types'

interface ArtemisDebriefProps {
  report: Report
}

const CRATER_TARGETS = [
  { name: 'Shackleton Crater', lat: '89.9° S', depth: '4.2 km', temp: '40 K (-233°C)', icePotential: 'Extreme' },
  { name: 'Cabeus Crater', lat: '84.9° S', depth: '3.0 km', temp: '45 K (-228°C)', icePotential: 'Proven (LCROSS)' },
  { name: 'Shoemaker Crater', lat: '88.1° S', depth: '2.5 km', temp: '50 K (-223°C)', icePotential: 'High' },
  { name: 'Faustini Crater', lat: '87.3° S', depth: '2.1 km', temp: '55 K (-218°C)', icePotential: 'Moderate' },
]

export function ArtemisDebrief({ report }: ArtemisDebriefProps) {
  const coverage = report.coverageAchieved ?? 0
  const estimatedWaterTons = useMemo(() => {
    // 70% coverage maps ~350M metric tons in south polar cold traps
    return Math.round((coverage / 100) * 500)
  }, [coverage])

  const artemisRecommendation = useMemo(() => {
    if (coverage >= 70) {
      return {
        rating: 'PRIME SITE CLEARED FOR ARTEMIS BASE CAMP',
        tone: 'text-ice border-ice/60 bg-ice/10',
        verdict: 'Comprehensive subsurface water mapping achieved. Permanent polar landing site selected at Shackleton Ridge.',
      }
    }
    if (coverage >= 40) {
      return {
        rating: 'PARTIAL RECONNAISSANCE FOR ARTEMIS',
        tone: 'text-caution border-caution/60 bg-caution/10',
        verdict: 'Substantial volatile signatures detected in Cabeus crater, but secondary surveying is required before crewed surface deployment.',
      }
    }
    return {
      rating: 'INSUFFICIENT RESOLUTION FOR CREW CERTIFICATION',
      tone: 'text-nogo border-nogo/60 bg-nogo/10',
      verdict: 'Sensor payload or orbital lifetime was insufficient to illuminate permanently shadowed regions.',
    }
  }, [coverage])

  return (
    <div className="rounded-xl border border-rule/80 bg-ink-2/90 p-6 backdrop-blur-md shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ice/20 border border-ice/40 text-ice text-lg">
            ❄️
          </span>
          <div>
            <h3 className="fp-display text-lg text-paper font-bold">
              Artemis Lunar Ice Exploration Debrief
            </h3>
            <p className="text-xs font-mono text-paper-dim">
              NASA In-Situ Resource Utilization (ISRU) Evaluation
            </p>
          </div>
        </div>

        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-xs text-paper-faint">DISCOVERED WATER ICE:</span>
          <span className="text-xl font-bold text-ice">{estimatedWaterTons}M tons</span>
        </div>
      </div>

      {/* Artemis Recommendation Badge */}
      <div className={`rounded-lg border p-4 ${artemisRecommendation.tone}`}>
        <div className="font-mono text-xs font-bold tracking-wider uppercase">
          {artemisRecommendation.rating}
        </div>
        <p className="mt-1 text-sm text-paper leading-relaxed">
          {artemisRecommendation.verdict}
        </p>
      </div>

      {/* Polar Cold Traps Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs font-bold text-paper tracking-wider uppercase">
            Permanently Shadowed Regions (PSRs) Surveyed
          </span>
          <span className="font-mono text-[10px] text-paper-dim">
            Resolution: {coverage.toFixed(1)}% complete
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CRATER_TARGETS.map((crater) => {
            const mapped = coverage >= 60 || (coverage >= 30 && crater.name.includes('Shackleton'))
            return (
              <div
                key={crater.name}
                className={`p-3 rounded-lg border transition-all duration-200 ${
                  mapped
                    ? 'border-ice/40 bg-ink-3/80 shadow-md shadow-ice/5'
                    : 'border-rule/40 bg-ink-1/50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-paper">
                    {crater.name}
                  </span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                      mapped ? 'bg-ice/20 text-ice font-bold' : 'bg-rule/40 text-paper-faint'
                    }`}
                  >
                    {mapped ? 'Mapped 70m' : 'Shadowed'}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px] text-paper-dim">
                  <div>
                    <span className="text-paper-faint block">Coords:</span>
                    <span>{crater.lat}</span>
                  </div>
                  <div>
                    <span className="text-paper-faint block">Depth:</span>
                    <span>{crater.depth}</span>
                  </div>
                  <div>
                    <span className="text-paper-faint block">Temp:</span>
                    <span>{crater.temp}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
