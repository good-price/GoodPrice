/**
 * components/admin/catalog/PricingGovernance.tsx
 *
 * Zone 11 — Pricing Memory governance summary.
 * Server Component.
 */

import type { PricingGovernance as PricingGovernanceType } from '@/lib/catalog/pricing-memory/types'

interface Props {
  governance: PricingGovernanceType
}

export function PricingGovernance({ governance }: Props) {
  const {
    totalProducts, rising, falling, stable, opportunities,
    averageVolatility, averageOpportunity,
  } = governance

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white">
        Zona 11 — Pricing Memory
      </h2>

      {totalProducts === 0 ? (
        <p className="text-gray-400 text-sm">
          Sin datos de precios aún. Los precios se capturan automáticamente durante la admisión y las validaciones live.
        </p>
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Productos" value={totalProducts} color="text-white" />
            <StatCard label="Oportunidades" value={opportunities} color="text-green-400" />
            <StatCard label="Vol. promedio" value={`${averageVolatility}/100`} color="text-yellow-400" />
            <StatCard label="Opp. promedio" value={`${averageOpportunity}/100`} color="text-blue-400" />
          </div>

          {/* Trend breakdown */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Tendencias de precio</h3>
            <div className="space-y-2">
              <TrendBar label="Subiendo" count={rising}  total={totalProducts} color="bg-red-500" />
              <TrendBar label="Bajando"  count={falling} total={totalProducts} color="bg-green-500" />
              <TrendBar label="Estable"  count={stable}  total={totalProducts} color="bg-gray-500" />
            </div>
          </div>
        </>
      )}
    </section>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}

function TrendBar({
  label, count, total, color,
}: {
  label:  string
  count:  number
  total:  number
  color:  string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
