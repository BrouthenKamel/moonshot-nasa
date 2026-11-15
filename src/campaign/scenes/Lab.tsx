import { useState } from 'react'
import { LiftoffShow } from './LiftoffShow'
import { PayoffShow } from './PayoffShow'
import type { Outcome, PayoffKind, RocketClass } from './types'

/**
 * Dev lab for the campaign shows (dev builds only, loaded lazily by App):
 * `?campaignlab=liftoff&rocket=heavy[&fail=1]` or `?campaignlab=payoff&kind=mars-base&outcome=partial`.
 * Replays on click when a show ends.
 */
export function CampaignLab() {
  const q = new URLSearchParams(window.location.search)
  const [run, setRun] = useState(0)
  const [done, setDone] = useState(false)
  const which = q.get('campaignlab')
  const onDone = () => setDone(true)
  return (
    <main className="h-screen bg-ink-0 text-paper">
      {done ? (
        <button
          type="button"
          className="fp-btn-primary m-8"
          onClick={() => {
            setDone(false)
            setRun(run + 1)
          }}
        >
          Show ended · play again
        </button>
      ) : which === 'payoff' ? (
        <PayoffShow key={run} kind={(q.get('kind') ?? 'moon-landing') as PayoffKind} outcome={(q.get('outcome') ?? 'success') as Outcome} onDone={onDone} />
      ) : (
        <LiftoffShow key={run} rocket={(q.get('rocket') ?? 'medium') as RocketClass} missionName="Lab launch" launchFails={q.get('fail') === '1'} onDone={onDone} />
      )}
    </main>
  )
}
