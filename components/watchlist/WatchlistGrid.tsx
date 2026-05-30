/**
 * WatchlistGrid — Client-rendered list of tracked products
 *
 * Reads from localStorage via useWatchlist. After mount:
 *  1. Fetches current ML prices from /api/pricing/bulk (pricing data)
 *  2. Fetches catalog status from /api/watchlist/status (integrity guard)
 *
 * Phase 28.5 additions:
 *  - Integrity guard: marks products removed from the public catalog
 *  - Relative "Seguido hace N días" date on each card
 *  - Colombia availability chip from offerData
 *  - Discount % when ML price is lower than catalog price
 *  - Improved empty state with offers + top-ventas links
 */

'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Bell, BellOff, Trash2, ExternalLink, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react'
import { useWatchlist } from '@/hooks/useWatchlist'
import { AlertSetupSheet } from './AlertSetupSheet'
import type { LocalWatchlistItem, WatchlistOfferData } from '@/lib/watchlist/types'

// ── Date helper ───────────────────────────────────────────────────────────────

function formatRelativeDate(isoDate: string): string {
  const ms   = Date.now() - new Date(isoDate).getTime()
  const days = Math.floor(ms / (1_000 * 60 * 60 * 24))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7)  return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} sem.`
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  return 'hace más de un año'
}

// ── Trend chip ────────────────────────────────────────────────────────────────

function TrendChip({ trend }: { trend?: string }) {
  if (!trend || trend === 'unknown') return null
  const config: Record<string, { icon: typeof TrendingDown; label: string; cls: string }> = {
    falling:  { icon: TrendingDown, label: 'Bajando',  cls: 'text-emerald-700 bg-emerald-50' },
    rising:   { icon: TrendingUp,   label: 'Subiendo', cls: 'text-red-600 bg-red-50'         },
    stable:   { icon: Minus,        label: 'Estable',  cls: 'text-gray-600 bg-gray-100'      },
    volatile: { icon: Minus,        label: 'Volátil',  cls: 'text-amber-700 bg-amber-50'     },
  }
  const c = config[trend]
  if (!c) return null
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${c.cls}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  )
}

// ── Alert badge ───────────────────────────────────────────────────────────────

function AlertBadge({ item }: { item: LocalWatchlistItem }) {
  if (!item.alertTrigger) return null
  const label =
    item.alertTrigger === 'price_below' && item.alertTargetUSD
      ? `🔔 < $${item.alertTargetUSD}`
      : item.alertTrigger === 'all_time_low'
      ? '🔔 Mínimo histórico'
      : '🔔 Caída de precio'
  return (
    <span className="inline-flex items-center text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      {label}
    </span>
  )
}

// ── Product card ──────────────────────────────────────────────────────────────

interface WatchlistCardProps {
  item:        LocalWatchlistItem
  offerData?:  WatchlistOfferData
  /** 'active' = still in public catalog; 'removed' = suppressed / quarantined */
  integrity?:  'active' | 'removed'
  onRemove:    (productId: string) => void
  onEdit:      (productId: string) => void
}

function WatchlistCard({ item, offerData, integrity, onRemove, onEdit }: WatchlistCardProps) {
  const productPageUrl = `/productos/${item.asin}`
  const amazonUrl      = `https://www.amazon.com/dp/${item.asin}?tag=pulseprice-20`

  const mlPriceUSD = offerData?.priceUSD
  const hasMlPrice = mlPriceUSD !== undefined

  // Discount vs catalog price when ML is cheaper
  const discountPct =
    hasMlPrice && mlPriceUSD < item.catalogPriceUSD
      ? Math.round(((item.catalogPriceUSD - mlPriceUSD) / item.catalogPriceUSD) * 100)
      : null

  const isRemoved = integrity === 'removed'

  return (
    <article className={`bg-white rounded-2xl border shadow-sm p-4 flex gap-4 ${
      isRemoved ? 'border-amber-200 opacity-80' : 'border-gray-100'
    }`}>
      {/* Thumbnail */}
      <a href={isRemoved ? amazonUrl : productPageUrl} target={isRemoved ? '_blank' : undefined} rel={isRemoved ? 'noopener noreferrer sponsored' : undefined} className="flex-shrink-0">
        <div className="relative w-20 h-20 bg-gray-50 rounded-xl overflow-hidden">
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            className="object-contain p-2"
            sizes="80px"
            unoptimized
          />
        </div>
      </a>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <a
          href={isRemoved ? amazonUrl : productPageUrl}
          target={isRemoved ? '_blank' : undefined}
          rel={isRemoved ? 'noopener noreferrer sponsored' : undefined}
          className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 hover:text-amber-700 transition-colors"
        >
          {item.title}
        </a>

        {/* Price row */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Amazon:</span>
          <span className="text-sm font-bold text-gray-900">
            ${item.catalogPriceUSD.toFixed(2)}
          </span>

          {hasMlPrice && (
            <>
              <span className="text-xs text-gray-300" aria-hidden="true">·</span>
              <span className="text-xs text-gray-400">🇨🇴 Colombia:</span>
              <span className={`text-sm font-bold ${
                mlPriceUSD <= item.catalogPriceUSD ? 'text-emerald-700' : 'text-gray-800'
              }`}>
                ${mlPriceUSD.toFixed(2)}
              </span>
              {discountPct !== null && discountPct > 0 && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                  {discountPct}% OFF
                </span>
              )}
              <TrendChip trend={offerData?.trend} />
            </>
          )}

          {offerData?.isNearATL && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              🎯 Mínimo histórico
            </span>
          )}
        </div>

        {/* Alert + actions row */}
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <AlertBadge item={item} />

          {/* Seguido date */}
          <span className="text-xs text-gray-400">
            Seguido {formatRelativeDate(item.addedAt)}
          </span>

          <span className="text-gray-200" aria-hidden="true">|</span>

          <button
            onClick={() => onEdit(item.productId)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-amber-600 transition-colors"
            title={item.alertTrigger ? 'Editar alerta' : 'Configurar alerta'}
          >
            {item.alertTrigger ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            {item.alertTrigger ? 'Editar alerta' : 'Configurar alerta'}
          </button>

          <span className="text-gray-200" aria-hidden="true">|</span>

          <a
            href={amazonUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver en Amazon
          </a>

          <span className="text-gray-200" aria-hidden="true">|</span>

          <button
            onClick={() => onRemove(item.productId)}
            className={`inline-flex items-center gap-1 text-xs transition-colors ${
              isRemoved
                ? 'text-red-400 hover:text-red-600 font-medium'
                : 'text-gray-400 hover:text-red-500'
            }`}
            title="Dejar de seguir"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar
          </button>
        </div>

        {/* Integrity warning — shown when product was removed from public catalog */}
        {isRemoved && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-1">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Este producto ya no está disponible en GOODPRICE</span>
          </div>
        )}
      </div>
    </article>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16 px-6">
      <div className="text-5xl mb-4" aria-hidden="true">🔔</div>
      <h2 className="text-xl font-bold text-gray-700 mb-2">
        Aún no sigues ningún producto
      </h2>
      <p className="text-sm text-gray-500 max-w-sm mx-auto mb-8">
        Visita cualquier producto y toca{' '}
        <strong className="text-gray-700">&ldquo;Seguir precio&rdquo;</strong>{' '}
        para recibir alertas cuando baje.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
        <a
          href="/ofertas"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#F7A823] text-black text-sm font-bold hover:bg-[#e8961a] transition-colors"
        >
          🔥 Ver ofertas del día
        </a>
        <a
          href="/top-ventas"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          ⭐ Más vendidos
        </a>
      </div>
      <p className="text-xs text-gray-400">
        También puedes explorar por{' '}
        <a href="/categorias" className="text-amber-600 hover:underline">
          categorías
        </a>
      </p>
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando lista de seguimiento">
      {[1, 2].map(n => (
        <div key={n} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  )
}

// ── Main grid ─────────────────────────────────────────────────────────────────

export function WatchlistGrid() {
  const { items, remove, updateAlert, loaded } = useWatchlist()
  const [offerMap, setOfferMap]         = useState<Record<string, WatchlistOfferData>>({})
  const [integrityMap, setIntegrityMap] = useState<Record<string, 'active' | 'removed'>>({})
  const [fetching, setFetching]         = useState(false)
  const [editTarget, setEditTarget]     = useState<string | null>(null)

  // Fetch pricing + integrity data once items are loaded from localStorage
  useEffect(() => {
    if (!loaded || items.length === 0) return

    const productIds = items.map(i => i.productId)

    // ── Pricing ──────────────────────────────────────────────────────────────
    setFetching(true)
    fetch('/api/pricing/bulk', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ productIds }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) setOfferMap(data.offers ?? {})
      })
      .catch(() => { /* silently degrade */ })
      .finally(() => setFetching(false))

    // ── Integrity ─────────────────────────────────────────────────────────────
    const idsParam = encodeURIComponent(productIds.join(','))
    fetch(`/api/watchlist/status?ids=${idsParam}`)
      .then(r => r.json())
      .then(data => setIntegrityMap(data.status ?? {}))
      .catch(() => { /* silently degrade — assume all active */ })
  }, [loaded, items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const editItem = editTarget ? items.find(i => i.productId === editTarget) : null

  // Wait for localStorage hydration before showing anything
  if (!loaded) return <LoadingSkeleton />

  if (items.length === 0) return <EmptyState />

  // Count removed items so we can show a summary note
  const removedCount = items.filter(i => integrityMap[i.productId] === 'removed').length

  return (
    <>
      {/* Price data loading indicator */}
      {fetching && (
        <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          Actualizando precios…
        </p>
      )}

      {/* Integrity summary note */}
      {removedCount > 0 && (
        <div className="mb-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            {removedCount === 1
              ? '1 producto seguido ya no está disponible en GOODPRICE'
              : `${removedCount} productos seguidos ya no están disponibles en GOODPRICE`}
            {' '}— puedes quitarlos o seguir viendo su precio en Amazon.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {items.map(item => (
          <WatchlistCard
            key={item.productId}
            item={item}
            offerData={offerMap[item.productId]}
            integrity={integrityMap[item.productId]}
            onRemove={remove}
            onEdit={setEditTarget}
          />
        ))}
      </div>

      {/* Edit alert sheet */}
      {editItem && (
        <AlertSetupSheet
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          productId={editItem.productId}
          asin={editItem.asin}
          title={editItem.title}
          catalogPriceUSD={editItem.catalogPriceUSD}
          currentAlert={
            editItem.alertTrigger
              ? { trigger: editItem.alertTrigger, targetUSD: editItem.alertTargetUSD }
              : undefined
          }
          onAlertSaved={(alert, subscriptionId) => {
            updateAlert(editItem.productId, { ...alert, subscriptionId })
            setEditTarget(null)
          }}
        />
      )}
    </>
  )
}
