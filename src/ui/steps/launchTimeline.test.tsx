import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { computeBudgets } from '../../sim/budgets'
import { goNoGo } from '../../sim/checks'
import { flashlightDesign } from '../../sim/fixtures'
import { beatText, launchTimeline } from './launchTimeline'
import { LaunchSequence } from './LaunchSequence'
import { playCue } from '../../audio/gameSounds'

const checks = goNoGo(flashlightDesign, computeBudgets(flashlightDesign, 'engineer')).checks

describe('launch sequence timeline', () => {
  it('polls every Go / No-Go system in order, counts down from T-10 and lifts off in 10-15 s', () => {
    const beats = launchTimeline(checks, false)
    const polls = beats.filter((b) => b.kind === 'poll')
    expect(polls.map((p) => p.kind === 'poll' && p.system)).toEqual(checks.map((c) => c.resource))
    expect(beats.filter((b) => b.kind === 'count').map((b) => b.kind === 'count' && b.n)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
    const done = beats[beats.length - 1]
    expect(done.kind).toBe('done')
    expect(done.at).toBeGreaterThanOrEqual(10_000)
    expect(done.at).toBeLessThanOrEqual(15_000)
    // Beats come in time order: the poll, then the count, then liftoff
    expect(beats.map((b) => b.at)).toEqual([...beats.map((b) => b.at)].sort((a, b) => a - b))
    expect(beats[beats.length - 2].kind).toBe('liftoff')
  })

  it('stays within 10-15 s for few or many systems', () => {
    for (const n of [1, 5, 12, 20]) {
      const many = Array.from({ length: n }, (_, i) => ({ resource: `S${i}`, status: 'green' as const }))
      const end = launchTimeline(many, false).at(-1)!.at
      expect(end).toBeGreaterThanOrEqual(10_000)
      expect(end).toBeLessThanOrEqual(15_000)
    }
  })

  it('with reduced motion is short and has no countdown', () => {
    const beats = launchTimeline(checks, true)
    expect(beats.some((b) => b.kind === 'count')).toBe(false)
    expect(beats.at(-1)!.at).toBeLessThanOrEqual(3000)
  })

  it('a yellow system still reads GO, with its thin margin said', () => {
    const [beat] = launchTimeline([{ resource: 'Power', status: 'yellow' }], false)
    expect(beatText(beat)).toBe('Power: GO, little to spare.')
  })
})

describe('LaunchSequence renders without WebGL', () => {
  const text = (html: string) => html.replace(/<!-- -->/g, '')

  it('is a keyboard-usable dialog with a Skip button and a live readout', () => {
    const html = text(renderToString(<LaunchSequence checks={checks} onDone={() => {}} reducedMotion={false} />))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Skip')
    expect(html).toContain('COMMS CENTER · LUNAR ICE MAPPER · LAUNCH')
    for (const c of checks) expect(html).toContain(c.resource.toUpperCase())
    expect(html).toContain('STANDING BY')
  })

  it('shows the readouts, the countdown and liftoff as the beats pass', () => {
    const beats = launchTimeline(checks, false)
    const afterPoll = beats.findIndex((b) => b.kind === 'count') + 1
    const mid = text(renderToString(<LaunchSequence checks={checks} onDone={() => {}} reducedMotion={false} initialShown={afterPoll} />))
    expect(mid).not.toContain('STANDING BY')
    expect(mid).toContain('All systems GO')
    expect(mid).toContain('T-10')
    const lift = beats.findIndex((b) => b.kind === 'liftoff') + 1
    const end = text(renderToString(<LaunchSequence checks={checks} onDone={() => {}} reducedMotion={false} initialShown={lift} />))
    expect(end).toContain('LIFTOFF')
    expect(end).toContain('Liftoff! The Lunar Ice Mapper mission is under way.')
  })
})

describe('the launch cue', () => {
  it('plays when the cue has a file, and stays silent without one', () => {
    const player = { play: vi.fn() }
    playCue('launch', { player, files: {} })
    expect(player.play).not.toHaveBeenCalled()
    playCue('launch', { player, files: { launch: 'music.theme' } })
    expect(player.play).toHaveBeenCalledWith('music.theme')
    // A failing player never breaks the launch
    expect(() => playCue('launch', { player: { play: () => { throw new Error('no audio') } }, files: { launch: 'music.theme' } })).not.toThrow()
  })
})
