/**
 * components/admin/catalog/RecommendationGovernance.tsx
 *
 * Zone 13 — Recommendation Intelligence governance summary.
 * Server Component.
 */

import type { RecommendationGovernance as RecommendationGovernanceType } from '@/lib/catalog/recommendations/types'

interface Props {
  governance: RecommendationGovernanceType
}

export function RecommendationGovernance({ governance }: Props) {
  const { totalRecommendations, excellent, good, average, weak, averageScore } = governance

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white">
        Zona 13 — Recommendation Intelligence
      </h2>

      {totalRecommendations === 0 ? (
        <p className="text-gray-400 text-sm">
          Sin recomendaciones aún. Se generan automáticamente tras cada scan de lifecycle o pricing.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Productos"       value={totalRecommendations} color="text-white" />
            <StatCard label="Score promedio"  value={`${averageScore}/100`} color="text-blue-400" />
            <StatCard label="Excelentes"      value={excellent}            color="text-green-400" />
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Distribución de scores</h3>
            <div className="space-y-2">
              <TierBar label="Excelente (≥75)" count={excellent} total={totalRecommendations} color="bg-green-500" />
              <TierBar label="Bueno (50–74)"   count={good}      total={totalRecommendations} color="bg-blue-500" />
              <TierBar label="Promedio (25–49)" count={average}  total={totalRecommendations} color="bg-yellow-500" />
              <TierBar label="Débil (<25)"      count={weak}     total={totalRecommendations} color="bg-gray-500" />
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}

function TierBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
