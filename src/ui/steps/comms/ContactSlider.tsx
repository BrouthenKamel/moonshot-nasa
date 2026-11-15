import { useCallback, useRef } from 'react'
import { audio } from '../../../assets/audio'
import { Eng } from '../../kit'
import { MIN_CONTACT_HOURS, hoursFromTrackX } from './consoleControls'

/**
 * Contact time: hours a day booked on the ground station, as a row of the link console (under
 * the dish aim), with a tick per hour. It is the only place to set the hours, so it works both
 * ways: drag the dial, or use the real <input type="range"> underneath (arrow keys, Home / End,
 * a label and a spoken value for screen readers).
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
  const trackRef = useRef<HTMLDivElement>(null)
  const min = MIN_CONTACT_HOURS
  const pct = maxHours > min ? ((hours - min) / (maxHours - min)) * 100 : 100
  const ticks = Array.from({ length: Math.floor(maxHours) }, (_, i) => i + 1)

  // A detent click per step; at most one every 70 ms so a fast drag does not buzz
  const tick = useCallback(() => {
    const now = performance.now()
    if (now - lastTick.current > 70) {
      lastTick.current = now
      audio.play('sfx.click')
    }
  }, [])

  const handleDialDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || maxHours <= min || !trackRef.current) return
      e.preventDefault()
      const track = trackRef.current
      let lastH = hours
      const updateFromEvent = (ev: PointerEvent | React.PointerEvent) => {
        const rect = track.getBoundingClientRect()
        const next = hoursFromTrackX(ev.clientX, rect.left, rect.width, maxHours)
        if (next !== lastH) {
          lastH = next
          tick()
          onChange(next)
        }
      }
      updateFromEvent(e)
      const move = (ev: PointerEvent) => updateFromEvent(ev)
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [hours, maxHours, min, onChange, tick],
  )

  return (
    <div className="mt-3 border border-rule bg-ink-1 px-3 py-2" data-testid="contact-time">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <label id="contact-hours-label" htmlFor="contact-hours" className="fp-label text-[10px] text-paper-faint">
          Contact time
        </label>
        <span className="fp-data text-paper-dim">
          <span className="text-paper">{hours} h/day</span>
          <Eng> · ${costPerMonth.toFixed(2)}M a month</Eng>
        </span>
      </div>
      <span id="contact-hours-help" className="sr-only">
        Hours a day booked on the dish. More hours carry more data but cost money every month. {stationName} gives up to {maxHours} h a day.
      </span>

      <div ref={trackRef} className="relative mt-2">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 border border-rule bg-ink-0">
          <div className="h-full bg-kapton" style={{ width: `${pct}%` }} />
        </div>
        {/* The drag dial is for the pointer; the range input under it is the keyboard's control */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="contact-dial"
          disabled={maxHours <= min}
          onPointerDown={handleDialDown}
          style={{ left: `${pct}%`, touchAction: 'none' }}
          className="absolute top-1/2 z-20 h-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize border border-ink-0 bg-kapton px-1.5 fp-data text-[10px] font-bold text-kapton-ink transition-colors hover:brightness-110 disabled:cursor-default disabled:opacity-40"
        >
          {hours}h
        </button>
        <input
          id="contact-hours"
          type="range"
          min={min}
          max={maxHours}
          step={0.25}
          value={hours}
          disabled={maxHours <= min}
          aria-describedby="contact-hours-help"
          aria-valuetext={`${hours} hours a day`}
          onChange={(e) => {
            tick()
            onChange(Number(e.target.value))
          }}
          className="comms-range relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent focus:outline-none"
        />
      </div>
      <div className="relative mt-0.5 h-4 fp-data text-[10px] text-paper-faint" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className={`absolute whitespace-nowrap ${t === maxHours ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: `${((t - min) / (maxHours - min || 1)) * 100}%` }}
          >
            {t} h
          </span>
        ))}
      </div>
      <style>{`
        .comms-range::-webkit-slider-thumb { appearance: none; width: 12px; height: 22px; border-radius: 1px; background: var(--color-paper); border: 1px solid var(--color-ink-0); }
        .comms-range::-moz-range-thumb { width: 12px; height: 22px; border-radius: 1px; background: var(--color-paper); border: 1px solid var(--color-ink-0); }
        .comms-range:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--color-kapton); outline-offset: 2px; }
        .comms-range:focus-visible::-moz-range-thumb { outline: 2px solid var(--color-kapton); outline-offset: 2px; }
        .comms-range:disabled { cursor: default; }
      `}</style>
    </div>
  )
}
