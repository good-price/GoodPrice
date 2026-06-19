/**
 * components/pricing/AmazonPricePanel.tsx
 *
 * Server Component.
 * Shows Amazon pricing status, last update time, buy signal, and price range stats.
 * Returns null when pricingData is unavailable (first deploy, before cron runs).
 *
 * Extensibility:
 *   - Add a price history chart here when PA-API data becomes available
 *   - Add price comparison with other retailers (alkosto, falabella) as they're wired up
 */

import type { ProductPricingUIData, HistoryStats } from '@/lib/pricing/ui-data'
import { relativeTime, computeDisplayBuySignal } from '@/lib/pricing/ui-data'

interface Props {
  productId:      string
  amazonPriceUSD: number
  amazonUrl:      string
  pricingData:    ProductPricingUIData | null
}

export function AmazonPricePanel({ pricingData }: Props) {
  if (!pricingData) return null

  const { lastCheckedAt, historyStats } = pricingData
  const buySignal = computeDisplayBuySignal(historyStats)

  return (
    <section
      className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
      aria-label="Seguimiento de precio"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Seguimiento de precio</h2>
        {lastCheckedAt && (
          <span className="text-xs text-gray-400">
            Actualizado {relativeTime(lastCheckedAt)}
          </span>
        )}
      </div>

      {/* Buy signal */}
      {buySignal && historyStats && (
        <BuySignalBadge signal={buySignal} stats={historyStats} />
      )}

      {/* Price range stats or placeholder */}
      {!historyStats ? (
        <p className="text-xs text-gray-400 text-center py-4">
          Historial de precios disponible después del primer ciclo de seguimiento.
        </p>
      ) : (
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <dt>Mínimo 30 días</dt>
            <dd className="font-medium">${historyStats.minUSD.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between text-gray-600">
            <dt>Máximo 30 días</dt>
            <dd className="font-medium">${historyStats.maxUSD.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between text-gray-600">
            <dt>Promedio 30 días</dt>
            <dd className="font-medium">${historyStats.avgUSD.toFixed(2)}</dd>
          </div>
        </dl>
      )}

      {/* Tracking status */}
      <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-green-400" aria-hidden="true" />
        <span className="text-xs text-gray-400">Monitoreado diariamente vía Amazon</span>
      </div>
    </section>
  )
}

// ── Buy signal badge ───────────────────────────────────────────────────────────

type BuySignalType = 'strong_buy' | 'good_buy' | 'neutral' | 'wait'

const SIGNAL_CONFIG: Record<BuySignalType, { label: string; color: string; bg: string }> = {
  strong_buy: {
    label: 'Precio mínimo histórico — Momento ideal para comprar',
    color: 'text-green-700',
    bg:    'bg-green-50 border-green-100',
  },
  good_buy: {
    label: 'Precio bajo — Buena oportunidad',
    color: 'text-blue-700',
    bg:    'bg-blue-50 border-blue-100',
  },
  neutral: {
    label: 'Precio en rango normal',
    color: 'text-gray-600',
    bg:    'bg-gray-50 border-gray-100',
  },
  wait: {
    label: 'Precio alto — Considera esperar',
    color: 'text-amber-700',
    bg:    'bg-amber-50 border-amber-100',
  },
}

function BuySignalBadge({ signal, stats }: { signal: BuySignalType; stats: HistoryStats }) {
  const { label, color, bg } = SIGNAL_CONFIG[signal]
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg}`}>
      <p className={`text-sm font-semibold ${color}`}>{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        Posición: {stats.positionLabel}
      </p>
    </div>
  )
}
