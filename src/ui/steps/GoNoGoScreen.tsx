import { useGameStore } from '../../state/gameStore'
import { cannotMeetBrief, getGoNoGoSummary } from '../../sim/checks'
import type { Budgets, CheckResult } from '../../sim/types'
import { checkFigures } from '../../viz/checkMargin'
import { fixLocation } from '../../viz/missionMap'

function CheckRow({ check, budgets }: { check: CheckResult; budgets: Budgets }) {
  const fig = checkFigures(check, budgets)
  const statusColors = {
    green: 'bg-green-900 text-green-300 border-green-700',
    yellow: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    red: 'bg-red-900 text-red-300 border-red-700',
  }

  const statusLabels = {
    green: 'GO',
    yellow: 'CAUTION',
    red: 'NO-GO',
  }

  return (
    <div className={`rounded-lg border p-4 ${statusColors[check.status]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{check.resource}</div>
          <div className="mt-1 text-sm opacity-80">
            {fig.value.toFixed(1)} / {fig.limit.toFixed(1)} {check.unit}
            {check.resource === 'Budget' && ' spendable'}
            {/* A red row with room left on paper: its blocking reason is right below, no "+ margin" */}
            {!fig.margin.startsWith('Blocked') && ` (${fig.margin})`}
            {fig.note && ` · ${fig.note}`}
          </div>
        </div>
        <span className="rounded bg-black/20 px-2 py-1 text-xs font-bold">
          {statusLabels[check.status]}
        </span>
      </div>
      <div className="mt-2 text-sm opacity-70">{check.reason}</div>
      {check.fixStep && (
        <div className="mt-2 text-xs opacity-60">
          Fix at {fixLocation(check.fixStep)}
        </div>
      )}
    </div>
  )
}

export function GoNoGoScreen() {
  const getGoNoGo = useGameStore((s) => s.getGoNoGo)
  const getBudgets = useGameStore((s) => s.getBudgets)
  const budgets = getBudgets()
  const setDesignStep = useGameStore((s) => s.setDesignStep)
  const startSimulation = useGameStore((s) => s.startSimulation)

  const result = getGoNoGo()
  const summary = getGoNoGoSummary(result)
  // The launch is allowed, but the craft cannot meet the brief: say so, with the reason
  const doomed = cannotMeetBrief(result)
  const scienceReason = result.checks.find((c) => c.resource === 'Science')?.reason

  // Group checks
  const criticalChecks = result.checks.filter((c) => c.status === 'red')
  const warningChecks = result.checks.filter((c) => c.status === 'yellow')
  const passedChecks = result.checks.filter((c) => c.status === 'green')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg bg-slate-900 p-6">
        <h1 className="text-xl font-bold text-blue-400">7. Go/No-Go Review</h1>
        <p className="mt-2 text-slate-400">
          Final resource check before launch. All systems must be green or yellow to proceed.
        </p>
      </div>

      <div
        className={`rounded-lg p-6 text-center ${
          result.canGo
            ? result.warnings.length > 0
              ? 'bg-yellow-950'
              : 'bg-green-950'
            : 'bg-red-950'
        }`}
      >
        <div
          className={`text-3xl font-bold ${
            result.canGo
              ? result.warnings.length > 0
                ? 'text-yellow-400'
                : 'text-green-400'
              : 'text-red-400'
          }`}
        >
          {result.canGo ? (doomed ? 'GO, BUT IT CANNOT MEET THE BRIEF' : 'GO') : 'NO-GO'}
        </div>
        <div
          className={`mt-2 text-lg ${
            result.canGo
              ? result.warnings.length > 0
                ? 'text-yellow-300'
                : 'text-green-300'
              : 'text-red-300'
          }`}
        >
          {summary}
        </div>
        {doomed && scienceReason && <div className="mt-2 text-sm text-yellow-200/90">{scienceReason}</div>}
      </div>

      {criticalChecks.length > 0 && (
        <div>
          <h2 className="mb-4 font-semibold text-red-400">
            Critical Issues ({criticalChecks.length})
          </h2>
          <div className="space-y-3">
            {criticalChecks.map((check, i) => (
              <CheckRow key={i} check={check} budgets={budgets} />
            ))}
          </div>
        </div>
      )}

      {warningChecks.length > 0 && (
        <div>
          <h2 className="mb-4 font-semibold text-yellow-400">
            Warnings ({warningChecks.length})
          </h2>
          <div className="space-y-3">
            {warningChecks.map((check, i) => (
              <CheckRow key={i} check={check} budgets={budgets} />
            ))}
          </div>
        </div>
      )}

      {passedChecks.length > 0 && (
        <div>
          <h2 className="mb-4 font-semibold text-green-400">
            Passed ({passedChecks.length})
          </h2>
          <div className="space-y-3">
            {passedChecks.map((check, i) => (
              <CheckRow key={i} check={check} budgets={budgets} />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={() => setDesignStep('comms')}
          className="rounded-lg bg-slate-700 px-6 py-2 font-medium text-slate-300 hover:bg-slate-600"
        >
          ← Back to Design
        </button>
        <button
          onClick={startSimulation}
          disabled={!result.canGo}
          className={`rounded-lg px-6 py-2 font-medium text-white ${
            result.canGo
              ? 'bg-green-600 hover:bg-green-500'
              : 'cursor-not-allowed bg-slate-600 opacity-50'
          }`}
        >
          {result.canGo ? 'Launch Mission' : 'Fix Issues First'}
        </button>
      </div>
    </div>
  )
}
