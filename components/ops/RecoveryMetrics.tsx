/**
 * components/ops/RecoveryMetrics.tsx
 *
 * Shows suppression breakdown, pricing health summary, and TRM status
 * as a compact metrics panel. Server component — no client JS.
 */

import type {
  SuppressionPressure,
  PricingHealthReport,
  TrmStatus,
} from '@/lib/catalog/stabilization/types'

interface Props {
  suppressionPressure: SuppressionPressure
  pricingHealth:       PricingHealthReport
  trmStatus:           TrmStatus
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PressureLevelBadge({ level }: { level: SuppressionPressure['level'] }) {
  const styles = {
    low:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    moderate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }
  const labels = {
    low: 'Baja', moderate: 'Moderada', high: 'Alta', critical: 'Crítica',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[level]}`}>
      {labels[level]}
    </span>
  )
}

function MetricRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{value}</span>
        {sub && <span className="text-xs text-gray-400 ml-1">{sub}</span>}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecoveryMetrics({ suppressionPressure, pricingHealth, trmStatus }: Props) {
  const trmAge = trmStatus.fetchedAt
    ? `${trmStatus.ageHours}h`
    : 'N/A'

  const trmRate = trmStatus.isFallback
    ? `$${trmStatus.rate.toLocaleString('es-CO')} (fallback)`
    : `$${trmStatus.rate.toLocaleString('es-CO')}`

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Métricas de recuperación
      </h3>

      {/* Suppression pressure section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Presión de supresión
          </span>
          <PressureLevelBadge level={suppressionPressure.level} />
        </div>
        <div className="space-y-0">
          <MetricRow
            label="Score de presión"
            value={suppressionPressure.score}
            sub="/ 100"
          />
          <MetricRow
            label="Gate principal"
            value={suppressionPressure.primaryGate}
          />
          <MetricRow
            label="Recuperables"
            value={suppressionPressure.recoverableCount}
            sub="productos"
          />
          <MetricRow
            label="Hard-suprimidos"
            value={suppressionPressure.hardSuppressed}
            sub="requieren edición"
          />
        </div>

        {/* Gate breakdown */}
        {suppressionPressure.breakdown.length > 0 && (
          <div className="mt-2 space-y-1">
            {suppressionPressure.breakdown.slice(0, 5).map(b => (
              <div key={b.reason} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${b.recoverable ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <span className="text-xs text-gray-500 font-mono">{b.reason}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {b.count} <span className="text-gray-400">({b.pct}%)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pricing health section */}
      <div className="mb-4">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">
          Salud de precios
        </span>
        <div className="space-y-0">
          <MetricRow
            label="Analizados"
            value={pricingHealth.totalAnalyzed}
          />
          <MetricRow
            label="Obsoletos (+7 días)"
            value={pricingHealth.staleCount}
            sub={`${pricingHealth.stalePct}%`}
          />
          <MetricRow
            label="Descuentos falsos"
            value={pricingHealth.fakDiscountCount}
          />
          <MetricRow
            label="Deriva extrema (>30%)"
            value={pricingHealth.driftedCount}
          />
          <MetricRow
            label="Truth score promedio"
            value={pricingHealth.avgTruthScore}
            sub="/ 100"
          />
          <MetricRow
            label="Necesitan revalidación"
            value={pricingHealth.unreliableCount}
            sub={`${pricingHealth.unreliablePct}%`}
          />
        </div>
      </div>

      {/* TRM section */}
      <div>
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">
          TRM (USD/COP)
        </span>
        <div className="space-y-0">
          <MetricRow label="Tasa actual" value={trmRate} />
          <MetricRow label="Fuente" value={trmStatus.source} />
          <MetricRow label="Antigüedad" value={trmAge} />
          <MetricRow
            label="Estado"
            value={
              trmStatus.isFallback        ? 'Fallback — sin datos' :
              trmStatus.freshnessLabel === 'fresh'  ? 'Fresca' :
              trmStatus.freshnessLabel === 'aging'  ? 'Envejeciendo' :
              trmStatus.freshnessLabel === 'stale'  ? 'Obsoleta' :
              'Desconocido'
            }
          />
        </div>
      </div>
    </div>
  )
}
