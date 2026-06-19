/**
 * components/admin/catalog/PricingProducts.tsx
 *
 * Zone 12 — Top 20 products by opportunityScore (best buying opportunities).
 * Server Component.
 */

import type { ProductIntelligence } from '@/lib/catalog/pricing-memory/types'
import type { PriceTrend }          from '@/lib/catalog/pricing-memory/types'

interface Props {
  products: ProductIntelligence[]
}

const TREND_LABEL: Record<PriceTrend, string>  = {
  rising:  'Subiendo',
  falling: 'Bajando',
  stable:  'Estable',
}

const TREND_COLOR: Record<PriceTrend, string> = {
  rising:  'text-red-400',
  falling: 'text-green-400',
  stable:  'text-gray-400',
}

function opportunityBadge(score: number): string {
  if (score >= 75) return 'bg-green-800 text-green-200'
  if (score >= 50) return 'bg-blue-800 text-blue-200'
  if (score >= 25) return 'bg-yellow-800 text-yellow-200'
  return 'bg-gray-700 text-gray-300'
}

export function PricingProducts({ products }: Props) {
  // Sort by opportunityScore desc, slice to top 20
  const sorted = [...products]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 20)

  if (sorted.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-white">
          Zona 12 — Mejores Oportunidades de Precio
        </h2>
        <p className="text-gray-400 text-sm">
          Sin datos de inteligencia de precios aún.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-white">
        Zona 12 — Mejores Oportunidades de Precio
        <span className="text-sm font-normal text-gray-400 ml-2">(top 20 por oportunidad)</span>
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-700">
            <tr>
              <th className="pb-2 pr-4">ASIN</th>
              <th className="pb-2 pr-4">Tendencia</th>
              <th className="pb-2 pr-4 text-right">Volatilidad</th>
              <th className="pb-2 pr-4 text-right">Oportunidad</th>
              <th className="pb-2 pr-4 text-right">Cambios</th>
              <th className="pb-2">Último bajón</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.map(p => (
              <tr key={p.asin} className="hover:bg-gray-800 transition-colors">
                <td className="py-2 pr-4 font-mono text-gray-200">{p.asin}</td>
                <td className={`py-2 pr-4 font-medium ${TREND_COLOR[p.trend]}`}>
                  {TREND_LABEL[p.trend]}
                </td>
                <td className="py-2 pr-4 text-right text-gray-300">{p.volatilityScore}</td>
                <td className="py-2 pr-4 text-right">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${opportunityBadge(p.opportunityScore)}`}>
                    {p.opportunityScore}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right text-gray-400">{p.totalPriceChanges}</td>
                <td className="py-2 text-gray-400 text-xs">
                  {p.lastPriceDropAt
                    ? new Date(p.lastPriceDropAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
