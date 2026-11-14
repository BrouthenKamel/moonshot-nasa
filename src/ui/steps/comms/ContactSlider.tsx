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
  const min = 0.25
  const pct = maxHours > min ? ((hours - min) / (maxHours - min)) * 100 : 100
  const ticks = Array.from({ length: Math.floor(maxHours) }, (_, i) => i + 1)

  return (
    <section aria-labelledby="contact-hours-label" className="rounded-2xl border border-white/10 bg-[#070c1a] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label id="contact-hours-label" htmlFor="contact-hours" className="font-display text-xl font-bold text-white">
            Contact time
          </label>
          <p id="contact-hours-help" className="text-xs text-slate-400">
            Hours a day booked on the dish. More hours carry more data but cost money every month.
          </p>
        </div>
        <div className="flex items-end gap-4 text-right">
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Booked</div>
            <div className="font-display text-3xl font-bold tabular-nums text-blue-300">
              {hours} <span className="text-base text-blue-300/70">h/day</span>
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Costs</div>
            <div className="text-sm font-semibold tabular-nums text-slate-100">${costPerMonth.toFixed(2)}M a month</div>
          </div>
        </div>
      </div>

      <div className="relative mt-4">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-700 to-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.6)]"
            style={{ width: `${pct}%` }}
          />
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
          onChange={(e) => onChange(Number(e.target.value))}
          className="comms-range relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent focus:outline-none"
        />
      </div>
      <div className="relative mt-1 h-4 text-[10px] tabular-nums text-slate-500" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className={`absolute whitespace-nowrap ${t === maxHours ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${((t - min) / (maxHours - min || 1)) * 100}%` }}>
            {t} h
          </span>
        ))}
      </div>
      <div id="contact-hours-max" className="mt-1 text-xs text-slate-500">
        {stationName} gives up to {maxHours} h a day.
      </div>
      <style>{`
        .comms-range::-webkit-slider-thumb { appearance: none; width: 22px; height: 22px; border-radius: 9999px; background: #dbeafe; border: 3px solid #3b82f6; box-shadow: 0 0 14px rgba(59,130,246,.8); }
        .comms-range::-moz-range-thumb { width: 16px; height: 16px; border-radius: 9999px; background: #dbeafe; border: 3px solid #3b82f6; box-shadow: 0 0 14px rgba(59,130,246,.8); }
        .comms-range:focus-visible::-webkit-slider-thumb { outline: 3px solid #93c5fd; outline-offset: 2px; }
        .comms-range:focus-visible::-moz-range-thumb { outline: 3px solid #93c5fd; outline-offset: 2px; }
        .comms-range:disabled { cursor: default; }
      `}</style>
    </section>
  )
}
