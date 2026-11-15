import { useRef } from 'react'
import { audio } from '../../../assets/audio'
import { Eng, stepNumber } from '../../kit'

/**
 * Contact time: hours a day booked on the ground station, as a console slider with a tick per
 * hour. A real <input type="range"> with a label and a spoken value, so keys and screen
 * readers work as usual.
 */
export function ContactSlider({
  hours,
  maxHours,
  stationName,
  costPerMonth,
  onChange,
}: {
  hours: number
  maxHours: number
  stationName: string
  costPerMonth: number
  onChange: (hours: number) => void
}) {
  const lastTick = useRef(0)
  const min = 0.25
  const pct = maxHours > min ? ((hours - min) / (maxHours - min)) * 100 : 100
  const ticks = Array.from({ length: Math.floor(maxHours) }, (_, i) => i + 1)

  return (
    <section aria-labelledby="contact-hours-label">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label id="contact-hours-label" htmlFor="contact-hours" className="flex items-baseline gap-2">
            <span className="fp-data text-[11px] text-paper-faint">{`${stepNumber('comms')}.4`}</span>
            <span className="fp-label text-paper">Contact time</span>
          </label>
          <p id="contact-hours-help" className="mt-1 text-xs text-paper-dim">
            Hours a day booked on the dish. More hours carry more data but cost money every month.
          </p>
        </div>
        <div className="flex items-end gap-4 text-right">
          <div>
            <div className="fp-label text-[9px] text-paper-faint">Booked</div>
            <div className="fp-data text-2xl text-paper">
              {hours} <span className="text-sm text-paper-dim">h/day</span>
            </div>
          </div>
          <Eng as="div">
            <div className="fp-label text-[9px] text-paper-faint">Costs</div>
            <div className="fp-data text-sm text-paper">${costPerMonth.toFixed(2)}M a month</div>
          </Eng>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 border border-rule bg-ink-1">
          <div className="h-full bg-kapton" style={{ width: `${pct}%` }} />
        </div>
        <input
          id="contact-hours"
          type="range"
          min={min}
          max={maxHours}
          step={0.25}
          value={hours}
          disabled={maxHours <= min}
          aria-describedby="contact-hours-help contact-hours-max"
          aria-valuetext={`${hours} hours a day`}
          onChange={(e) => {
            // A detent click per step; at most one every 70 ms so a fast drag does not buzz
            const now = performance.now()
            if (now - lastTick.current > 70) {
              lastTick.current = now
              audio.play('sfx.click')
            }
            onChange(Number(e.target.value))
          }}
          className="comms-range relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent focus:outline-none"
        />
      </div>
      <div className="relative mt-1 h-4 fp-data text-[10px] text-paper-faint" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className={`absolute whitespace-nowrap ${t === maxHours ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${((t - min) / (maxHours - min || 1)) * 100}%` }}>
            {t} h
          </span>
        ))}
      </div>
      <div id="contact-hours-max" className="mt-1 text-xs text-paper-faint">
        {stationName} gives up to {maxHours} h a day.
      </div>
      <style>{`
        .comms-range::-webkit-slider-thumb { appearance: none; width: 12px; height: 22px; border-radius: 1px; background: var(--color-paper); border: 1px solid var(--color-ink-0); }
        .comms-range::-moz-range-thumb { width: 12px; height: 22px; border-radius: 1px; background: var(--color-paper); border: 1px solid var(--color-ink-0); }
        .comms-range:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--color-kapton); outline-offset: 2px; }
        .comms-range:focus-visible::-moz-range-thumb { outline: 2px solid var(--color-kapton); outline-offset: 2px; }
        .comms-range:disabled { cursor: default; }
      `}</style>
    </section>
  )
}
