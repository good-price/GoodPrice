/**
 * PriceComparisonPanel — Product pricing intelligence widget
 *
 * Server Component: renders entirely on the server, ships zero JS to the client.
 * Displays Amazon vs local retailer prices, availability, and price signals.
 *
 * Visibility rules:
 *   - Section not rendered if pricingData is null (no data yet)
 *   - Amazon row always shown (from catalog static data)
 *   - ML row shown only when mlOffer exists
 *   - History strip shown only when ≥ 3 days of data
 *   - Buy signal shown only when ≥ 7 days of data
 *
 * Design: matches existing GOODPRICE visual language (white card, gray borders,
 * amber accents, emerald for positive signals).
 */

import type { ProductPricingUIData, HistoryStats } from '@/lib/pricing/ui-data'
import { computeDisplayBuySignal, relativeTime } from '@/lib/pricing/ui-data'
import type { AvailabilityStatus, PriceTrend } from '@/lib/pricing/types'

// ── Sub-components (all Server, all inline) ───────────────────────────────────

function AvailabilityDot({ status }: { status: AvailabilityStatus }) {
  const config: Record<AvailabilityStatus, { color: string; label: string }> = {
    in_stock:     { color: 'bg-emerald-400', label: 'Disponible' },
    limited:      { color: 'bg-amber-400',   label: 'Últimas unidades' },
    out_of_stock: { color: 'bg-red-400',     label: 'Agotado' },
    preorder:     { color: 'bg-blue-400',    label: 'Preventa' },
    discontinued: { color: 'bg-gray-300',    label: 'Descontinuado' },
    unknown:      { color: 'bg-gray-300',    label: 'Sin info' },
  }
  const { color, label } = config[status] ?? config.unknown

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  )
}

function TrendChip({ trend }: { trend: PriceTrend }) {
  if (trend === 'unknown') return null

  const config: Record<Exclude<PriceTrend, 'unknown'>, { icon: string; label: string; cls: string }> = {
    falling:  { icon: '↓', label: 'Bajando', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    rising:   { icon: '↑', label: 'Subiendo', cls: 'bg-red-50 text-red-600 border-red-100' },
    stable:   { icon: '→', label: 'Estable',  cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    volatile: { icon: '↕', label: 'Volátil',  cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  }
  const c = config[trend as Exclude<PriceTrend, 'unknown'>]
  if (!c) return null

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  )
}

function BuySignalChip({ signal }: { signal: ReturnType<typeof computeDisplayBuySignal> }) {
  if (!signal || signal === 'neutral') return null

  const config = {
    strong_buy: { label: '¡Precio mínimo!',             cls: 'bg-emerald-600 text-white' },
    good_buy:   { label: 'Buen momento para comprar',   cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    wait:       { label: 'Precio alto · considera esperar', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
    neutral:    { label: '',                             cls: '' },
  }
  const c = config[signal]
  if (!c.label) return null

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${c.cls}`}>
      {signal === 'strong_buy' ? '🎯' : signal === 'good_buy' ? '✓' : '⏳'}
      {c.label}
    </span>
  )
}

// ── Retailer offer row ────────────────────────────────────────────────────────

interface OfferRowProps {
  logo:         string        // emoji flag or short label
  retailer:     string        // display name
  tag:          string        // "Importado" | "Local" | etc.
  priceUSD:     number
  priceCOP?:    number        // only for local retailers
  subtext:      string        // shipping + timing info
  availability: AvailabilityStatus
  affiliateUrl: string
  isBest:       boolean       // whether this is the cheapest option
  ctaLabel:     string
}

function OfferRow({
  logo, retailer, tag, priceUSD, priceCOP, subtext,
  availability, affiliateUrl, isBest, ctaLabel,
}: OfferRowProps) {
  const isAvailable = availability === 'in_stock' || availability === 'limited'

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 ${isBest ? 'bg-emerald-50/50' : ''}`}>
      {/* Left: retailer info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">{logo}</span>
          <span className="text-sm font-semibold text-gray-800">{retailer}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{tag}</span>
          {isBest && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
              Mejor precio
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{subtext}</p>
      </div>

      {/* Center: price */}
      <div className="sm:text-right flex-shrink-0">
        <div className="flex sm:flex-col items-baseline sm:items-end gap-2">
          <span className={`text-xl font-bold ${isBest ? 'text-emerald-700' : 'text-gray-800'}`}>
            ${priceUSD.toFixed(2)}
          </span>
          {priceCOP && (
            <span className="text-xs text-gray-400">
              $ {Math.round(priceCOP).toLocaleString('es-CO')} COP
            </span>
          )}
        </div>
        <div className="flex sm:justify-end items-center gap-1.5 mt-1">
          <AvailabilityDot status={availability} />
        </div>
      </div>

      {/* Right: CTA */}
      <div className="flex-shrink-0">
        {isAvailable ? (
          <a
            href={affiliateUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors ${
              isBest
                ? 'bg-[#F7A823] hover:bg-[#e8961a] text-black'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {ctaLabel}
            <span aria-hidden="true">→</span>
          </a>
        ) : (
          <span className="inline-flex items-center text-xs text-gray-400 px-3.5 py-2">
            No disponible
          </span>
        )}
      </div>
    </div>
  )
}

// ── History strip ─────────────────────────────────────────────────────────────

function HistoryStrip({ stats, trend }: { stats: HistoryStats; trend: PriceTrend }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 bg-gray-50 border-t border-gray-100">
      <TrendChip trend={trend} />
      <span className="text-xs text-gray-500">
        Últimos {stats.dayCount} días:
      </span>
      <span className="text-xs text-gray-600">
        mín{' '}
        <span className="font-semibold text-emerald-700">${stats.minUSD.toFixed(2)}</span>
      </span>
      <span className="text-xs text-gray-300" aria-hidden="true">·</span>
      <span className="text-xs text-gray-600">
        máx{' '}
        <span className="font-semibold text-red-500">${stats.maxUSD.toFixed(2)}</span>
      </span>
      <span className="text-xs text-gray-300" aria-hidden="true">·</span>
      <span className="text-xs text-gray-600">
        prom{' '}
        <span className="font-semibold">${stats.avgUSD.toFixed(2)}</span>
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface PriceComparisonPanelProps {
  /** Internal catalog product ID (e.g. "elec-001") */
  productId:      string
  /** Amazon catalog price in USD */
  amazonPriceUSD: number
  /** Amazon affiliate URL */
  amazonUrl:      string
  /** Pricing data from the store (null = not yet tracked) */
  pricingData:    ProductPricingUIData | null
}

export function PriceComparisonPanel({
  amazonPriceUSD,
  amazonUrl,
  pricingData,
}: PriceComparisonPanelProps) {
  // Nothing to show yet — degrade silently
  if (!pricingData || !pricingData.mlOffer) return null

  const { mlOffer, lastCheckedAt, historyStats } = pricingData

  const amazonTotal = amazonPriceUSD + 12   // ~$12 shipping estimate
  const mlTotal     = mlOffer.priceUSD       // free shipping locally

  const amazonIsBest = amazonTotal <= mlTotal
  const mlIsBest     = !amazonIsBest

  const buySignal = computeDisplayBuySignal(historyStats)

  return (
    <section
      aria-label="Comparación de precios en Colombia"
      className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Precios en Colombia
          </h2>
          <span
            title="Precio de Amazon (importado) comparado con la oferta disponible en MercadoLibre Colombia."
            aria-label="¿Cómo funciona esta comparación?"
            className="text-gray-300 hover:text-gray-500 cursor-help text-xs"
          >
            ⓘ
          </span>
          {buySignal && buySignal !== 'neutral' && (
            <BuySignalChip signal={buySignal} />
          )}
        </div>
        {lastCheckedAt && (
          <span
            className="text-[11px] text-gray-400 flex items-center gap-1"
            title={new Date(lastCheckedAt).toLocaleString('es-CO')}
          >
            <span aria-hidden="true">⟳</span>
            {relativeTime(lastCheckedAt)}
          </span>
        )}
      </div>

      {/* Amazon row */}
      <OfferRow
        logo="🇺🇸"
        retailer="Amazon"
        tag="Importado"
        priceUSD={amazonPriceUSD}
        subtext={`~$12 envío · 15–30 días · Total estimado: ~$${amazonTotal.toFixed(0)}`}
        availability="in_stock"
        affiliateUrl={amazonUrl}
        isBest={amazonIsBest}
        ctaLabel="Ver en Amazon"
      />

      {/* Divider */}
      <div className="h-px bg-gray-100 mx-5" />

      {/* MercadoLibre row */}
      <OfferRow
        logo="🇨🇴"
        retailer="MercadoLibre"
        tag="Local"
        priceUSD={mlOffer.priceUSD}
        priceCOP={mlOffer.price}
        subtext={`Envío ${mlOffer.shippingCostEstimateUSD === 0 ? 'gratis' : `~$${mlOffer.shippingCostEstimateUSD}`} · 1–7 días · Colombia`}
        availability={mlOffer.availability}
        affiliateUrl={mlOffer.affiliateUrl ?? mlOffer.url}
        isBest={mlIsBest}
        ctaLabel="Ver en MercadoLibre"
      />

      {/* Position label (shown when history exists) */}
      {historyStats && historyStats.position !== 0.5 && (
        <div className="px-5 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Precio actual de ML:{' '}
            <span className={`font-semibold ${
              historyStats.position <= 0.3
                ? 'text-emerald-600'
                : historyStats.position >= 0.7
                ? 'text-red-500'
                : 'text-gray-700'
            }`}>
              {historyStats.positionLabel}
            </span>
          </p>
        </div>
      )}

      {/* History strip (≥ 3 days of data) */}
      {historyStats && (
        <HistoryStrip stats={historyStats} trend={historyStats.trend} />
      )}

      {/* Disclosure + methodology link */}
      <div className="px-5 py-3 border-t border-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Precios de ML actualizados cada hora vía API oficial · Siempre verifica antes de comprar ·{' '}
          Como afiliado de Amazon ganamos comisión{' '}
          <span title="Sin costo adicional para ti — la comisión la paga Amazon">
            sin costo extra para ti
          </span>
        </p>
        <a
          href="/metodologia"
          className="text-[11px] text-amber-500 hover:text-amber-700 hover:underline whitespace-nowrap flex-shrink-0"
        >
          ¿Cómo calculamos esto? →
        </a>
      </div>
    </section>
  )
}
