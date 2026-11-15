import { useMemo } from 'react'
import type { Budgets, GoNoGoResult } from '../sim/types'
import { lunarIceMapperBrief } from '../data/brief'
import { checkFigures } from '../viz/checkMargin'
import { fixLocation } from '../viz/missionMap'
import { objectives, stampVerdict, verdictChanges, type Objective, type QuestVerdict } from '../viz/questLog'
import { useDesignPreview } from './useDesignPreview'
import { Eng, MarginTick, Stamp, Tag, type TagTone } from './kit'

const VERDICT_WORD: Record<QuestVerdict, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  blocked: 'Blocked',
}

function verdictTone(o: { id: string; verdict: QuestVerdict }): TagTone {
  if (o.verdict === 'blocked') return 'nogo'
  if (o.verdict === 'at-risk') return 'caution'
  return o.id === 'coverage' ? 'ice' : 'go'
}

/** The six resources on the margins strip, by Go/No-Go check name */
const MARGINS: { resource: string; label: string }[] = [
  { resource: 'Mass', label: 'Mass' },
  { resource: 'Volume', label: 'Volume' },
  { resource: 'Power', label: 'Power' },
  { resource: 'Budget', label: 'Budget' },
  { resource: 'Delta-v', label: 'Δv' },
  { resource: 'Data Link', label: 'Data link' },
]

function figures(checks: GoNoGoResult, budgets: Budgets, resource: string) {
  const c = checks.checks.find((x) => x.resource === resource)
  if (!c) return null
  return { check: c, ...checkFigures(c, budgets) }
}

function ObjectiveRow({ n, o, ghost }: { n: number; o: Objective; ghost?: QuestVerdict }) {
  return (
    <li className="border-b border-rule pb-2" data-objective={o.id} data-verdict={o.verdict}>
      <div className="flex items-baseline gap-2">
        <span className="fp-data text-[11px] text-paper-faint">0.{n}</span>
        <span className="fp-label min-w-0 flex-1 text-paper">{o.label}</span>
        <Tag tone={verdictTone(o)}>{VERDICT_WORD[o.verdict]}</Tag>
      </div>
      <p className="mt-1 pl-6 text-xs leading-snug text-paper-dim">
        {o.story}
        {ghost && (
          <span className="fp-ghost ml-1.5 fp-data text-[11px] text-paper">→ {VERDICT_WORD[ghost].toLowerCase()}</span>
        )}
      </p>
      <Eng as="p" className="mt-0.5 pl-6 fp-data text-[11px] leading-snug text-paper-faint">
        {o.eng}
      </Eng>
    </li>
  )
}

/**
 * The quest log: the brief's five objectives with a verdict each, a margins strip and the
 * Go/No-Go stamp. Story view reads as plain verdicts; Engineer view adds every number.
 * (Kept under its old name so the shell and the barrel export do not change.)
 */
export function Dashboard() {
  const { budgets, checks, previewBudgets, previewChecks, isPreviewing } = useDesignPreview()

  const quests = useMemo(() => objectives(budgets, checks, lunarIceMapperBrief), [budgets, checks])
  const previewQuests = useMemo(
    () => (previewBudgets && previewChecks ? objectives(previewBudgets, previewChecks, lunarIceMapperBrief) : null),
    [previewBudgets, previewChecks]
  )
  const ghosts = verdictChanges(quests, previewQuests)
  const stamp = stampVerdict(checks)
  const previewStamp = previewChecks ? stampVerdict(previewChecks) : null

  const coverageChanged = previewBudgets && Math.abs(previewBudgets.projectedCoverage - budgets.projectedCoverage) > 0.5
  const readyChanged = previewBudgets && previewBudgets.readyTurn !== budgets.readyTurn

  return (
    <aside
      aria-label="Mission objectives"
      className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-rule bg-ink-1 p-4"
    >
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2 border-b border-rule-strong pb-1.5">
          <h2 className="fp-display text-sm text-paper">Mission objectives</h2>
          {isPreviewing && <Tag tone="kapton">Preview</Tag>}
        </div>
        <ol className="space-y-2">
          {quests.map((o, i) => (
            <ObjectiveRow key={o.id} n={i + 1} o={o} ghost={ghosts[o.id]} />
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 border-b border-rule-strong pb-1 fp-label">Margins</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {MARGINS.map(({ resource, label }) => {
            const now = figures(checks, budgets, resource)
            if (!now) return null
            const next = previewChecks && previewBudgets ? figures(previewChecks, previewBudgets, resource) : null
            return (
              <MarginTick
                key={resource}
                label={label}
                value={now.value}
                limit={now.limit}
                unit={now.check.unit}
                status={now.check.status}
                preview={next ? { value: next.value, status: next.check.status } : null}
              />
            )
          })}
        </div>
      </section>

      <section className="flex flex-col items-start gap-2 border-t border-rule pt-4">
        <div className="flex w-full items-center justify-between gap-2">
          <span className="fp-label">Go / No-Go</span>
          <Stamp key={stamp.text} verdict={stamp.verdict} animate>
            {stamp.text}
          </Stamp>
        </div>
        {previewStamp && previewStamp.text !== stamp.text && (
          <div className="fp-data text-[11px] text-paper-dim">
            With hovered choice: <span className="fp-ghost text-paper">→ {previewStamp.text}</span>
          </div>
        )}
        {checks.blockers.length > 0 && (
          <ul className="w-full space-y-1">
            {checks.blockers.map((b, i) => (
              <li key={i} className="text-xs leading-snug text-nogo">
                {b.resource}
                {b.fixStep ? `: fix at ${fixLocation(b.fixStep)}` : ''}
                <Eng className="block fp-data text-[11px] text-paper-faint">{b.reason.split('. ')[0].replace(/\.$/, '')}.</Eng>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Eng as="section" className="flex flex-col gap-4 border-t border-rule pt-4">
        <div>
          <h3 className="mb-2 fp-label">Resource detail</h3>
          <dl className="space-y-1.5 fp-data text-[11px]">
            {MARGINS.map(({ resource }) => {
              const f = figures(checks, budgets, resource)
              if (!f) return null
              return (
                <div key={resource} className="border-b border-rule pb-1">
                  <div className="flex justify-between gap-2">
                    <dt className="text-paper-dim">{resource}</dt>
                    <dd className="text-paper">
                      {f.value.toFixed(1)} / {f.limit.toFixed(1)} {f.check.unit}
                    </dd>
                  </div>
                  <div className={f.check.status === 'red' ? 'text-nogo' : 'text-paper-faint'}>{f.margin}</div>
                  {f.note && <div className="text-paper-faint">{f.note}</div>}
                </div>
              )
            })}
          </dl>
        </div>

        <div>
          <h3 className="mb-2 fp-label">Schedule &amp; Coverage</h3>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 fp-data text-[11px]">
            <span className="text-paper-dim">Ready in month:</span>
            <span className="text-right text-paper">
              {budgets.readyTurn}
              {readyChanged && previewBudgets && <span className="fp-ghost ml-1">→ {previewBudgets.readyTurn}</span>}
            </span>
            <span className="text-paper-dim">Ride month:</span>
            <span className="text-right text-paper">{budgets.rideTurn}</span>
            <span className="text-paper-dim">Arrival month:</span>
            <span className="text-right text-paper">{budgets.arrivalTurn ?? '-'}</span>
            <span className="text-paper-dim">Reserve:</span>
            <span className="text-right text-paper">${budgets.reserveAmount.toFixed(1)}M</span>
            <span className="text-paper-dim">Projected ice coverage:</span>
            <span className={`text-right font-semibold ${budgets.projectedCoverage >= 70 ? 'text-ice' : 'text-caution'}`}>
              {budgets.projectedCoverage.toFixed(0)}%
              {coverageChanged && previewBudgets && (
                <span className={`fp-ghost ml-1 ${previewBudgets.projectedCoverage >= 70 ? 'text-ice' : 'text-caution'}`}>
                  → {previewBudgets.projectedCoverage.toFixed(0)}%
                </span>
              )}
            </span>
          </div>
        </div>
      </Eng>
    </aside>
  )
}
