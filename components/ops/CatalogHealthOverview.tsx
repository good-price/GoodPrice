/**
 * components/ops/CatalogHealthOverview.tsx
 *
 * Displays the composite CatalogHealthScore with per-dimension breakdown.
 * Renders as a server component — no client JS needed.
 */

import type { CatalogHealthScore, VisibilityRatios, TrmStatus } from '@/lib/catalog/stabilization/types'
import { getCatalogHealthLabel } from '@/lib/catalog/stabilization'

interface Props {
  healthScore: CatalogHealthScore
  ratios:      VisibilityRatios
  trmStatus:   TrmStatus
}

// ── Score colour helpers ───────────────────────────────────────────────────────

function scoreColour(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400'
  if (score >= 60) return 'text-yellow-500 dark:text-yellow-400'
  if (score >= 40) return 'text-orange-500 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function barColour(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-400'
  if (score >= 40) return 'bg-orange-400'
  return 'bg-red-500'
}

function trmBadge(status: TrmStatus): string {
  if (status.isFallback)                   return '🔴 Fallback'
  if (status.freshnessLabel === 'stale')   return '🟡 Obsoleta'
  if (status.freshnessLabel === 'aging')   return '🟡 Envejeciendo'
  if (status.freshnessLabel === 'fresh')   return '🟢 Fresca'
  return '⚪ Desconocida'
}

// ── Sub-score bar ──────────────────────────────────────────────────────────────

function ScoreBar({ label, score, note }: { label: string; score: number; note?: string }) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
        <span className={`text-sm font-semibold ${scoreColour(score)}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColour(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      {note && <p className="text-xs text-gray-400 mt-0.5">{note}</p>}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CatalogHealthOverview({ healthScore, ratios, trmStatus }: Props) {
  const label   = getCatalogHealthLabel(healthScore.overall)
  const colour  = scoreColour(healthScore.overall)
  const barCol  = barColour(healthScore.overall)
  const visLabel = `${ratios.visiblePct}% visible (${ratios.visible}/${ratios.total})`

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Salud del catálogo
        </h3>
        <span className="text-xs text-gray-400">
          {new Date(healthScore.computedAt).toLocaleTimeString('es-CO', {
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>

      {/* Overall score */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex-shrink-0 text-center">
          <div className={`text-4xl font-bold tabular-nums ${colour}`}>
            {healthScore.overall}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">/ 100</div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-semibold ${colour}`}>{label}</span>
            <span className="text-xs text-gray-400">{visLabel}</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barCol}`}
              style={{ width: `${healthScore.overall}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sub-dimension scores */}
      <div className="space-y-2.5">
        <ScoreBar
          label="Visibilidad"
          score={healthScore.visibilityHealth}
          note={visLabel}
        />
        <ScoreBar
          label="Supresión"
          score={healthScore.suppressionHealth}
        />
        <ScoreBar
          label="Pricing"
          score={healthScore.pricingHealth}
        />
        <ScoreBar
          label="Links Amazon"
          score={healthScore.linkHealth}
        />
        <ScoreBar
          label="Colombia"
          score={healthScore.colombiaHealth}
        />
        <ScoreBar
          label="TRM"
          score={healthScore.trmHealth}
          note={`${trmBadge(trmStatus)} — $${trmStatus.rate.toLocaleString('es-CO')} COP/USD`}
        />
      </div>
    </div>
  )
}
