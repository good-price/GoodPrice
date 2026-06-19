/**
 * components/admin/catalog/RecommendationProducts.tsx
 *
 * Zone 14 — Top 20 products by recommendationScore.
 * Server Component.
 */

import type { ProductRecommendation } from '@/lib/catalog/recommendations/types'

interface Props {
  products: ProductRecommendation[]
}

function scoreBadge(score: number): string {
  if (score >= 75) return 'bg-green-800 text-green-200'
  if (score >= 50) return 'bg-blue-800 text-blue-200'
  if (score >= 25) return 'bg-yellow-800 text-yellow-200'
  return 'bg-gray-700 text-gray-300'
}

const TREND_LABEL = { rising: 'Subiendo', falling: 'Bajando', stable: 'Estable' } as const
const TREND_COLOR = { rising: 'text-red-400', falling: 'text-green-400', stable: 'text-gray-400' } as const

export function RecommendationProducts({ products }: Props) {
  const sorted = [...products]
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 20)

  if (sorted.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white">
          Zona 14 — Mejores Recomendaciones
        </h2>
        <p className="text-gray-400 text-sm">Sin datos de recomendaciones aún.</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white">
        Zona 14 — Mejores Recomendaciones
        <span className="text-sm font-normal text-gray-400 ml-2">(top 20 por score)</span>
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-700">
            <tr>
              <th className="pb-2 pr-4">ASIN</th>
              <th className="pb-2 pr-4">Categoría</th>
              <th className="pb-2 pr-4 text-right">Score</th>
              <th className="pb-2 pr-4 text-right">Opp.</th>
              <th className="pb-2 pr-4 text-right">Conf.</th>
              <th className="pb-2 pr-4 text-right">Calidad</th>
              <th className="pb-2 pr-4">Tendencia</th>
              <th className="pb-2">Señales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.map(p => (
              <tr key={p.asin} className="hover:bg-gray-800 transition-colors">
                <td className="py-2 pr-4 font-mono text-gray-200">{p.asin}</td>
                <td className="py-2 pr-4 text-gray-400 text-xs">{p.category}</td>
                <td className="py-2 pr-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${scoreBadge(p.recommendationScore)}`}>
                    {p.recommendationScore}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right text-gray-300">{p.opportunityScore}</td>
                <td className="py-2 pr-4 text-right text-gray-300">{p.confidenceScore}</td>
                <td className="py-2 pr-4 text-right text-gray-300">{p.qualityScore}</td>
                <td className={`py-2 pr-4 text-xs font-medium ${TREND_COLOR[p.trend]}`}>
                  {TREND_LABEL[p.trend]}
                </td>
                <td className="py-2 text-xs text-gray-400 max-w-xs truncate" title={p.reasons.join(' · ')}>
                  {p.reasons[0] ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
