/**
 * WatchButton — "Seguir precio" secondary CTA on product detail pages
 *
 * Client Component. Three visual states:
 *   idle      → "🔔 Seguir precio"  (renders immediately — no skeleton)
 *   watching  → "✓ Siguiendo · Configurar alerta →"
 *   alerted   → "🔔 Alerta activa · < $X"
 *
 * Hydration strategy:
 *   useWatchlist() initialises with items=[] and loaded=false.
 *   The idle button is rendered immediately (matches SSR output — no mismatch).
 *   After the first useEffect fires (one render after mount) useWatchlist sets
 *   loaded=true and reads localStorage. If the user already has this item
 *   watched, the button silently transitions to the "watching" state without
 *   any visible flash or skeleton placeholder.
 *
 * This eliminates the old mounted/skeleton anti-pattern while remaining
 *   hydration-safe: server and client both render the idle state initially.
 */

'use client'

import { useState } from 'react'
import { Bell, BellRing, Check, ChevronDown } from 'lucide-react'
import { useWatchlist } from '@/hooks/useWatchlist'
import { AlertSetupSheet } from './AlertSetupSheet'
import type { LocalWatchlistItem } from '@/lib/watchlist/types'

interface WatchButtonProps {
  productId:       string
  asin:            string
  title:           string
  imageUrl:        string
  category:        string
  catalogPriceUSD: number
}

export function WatchButton({
  productId,
  asin,
  title,
  imageUrl,
  category,
  catalogPriceUSD,
}: WatchButtonProps) {
  const { isWatched, add, remove, items, updateAlert, loaded } = useWatchlist()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  // Before useWatchlist hydrates from localStorage (loaded=false),
  // watching is always false — matches the SSR render. No skeleton needed.
  const watching  = loaded && isWatched(productId)
  const watchItem = loaded ? items.find(i => i.productId === productId) : undefined
  const hasAlert  = !!watchItem?.alertTrigger

  const handleFollow = () => {
    if (watching) {
      // Already watching → open alert sheet instead of removing
      setSheetOpen(true)
      return
    }

    // Add to watchlist immediately (session event tracked inside useWatchlist)
    const item: Omit<LocalWatchlistItem, 'addedAt'> = {
      productId, asin, title, imageUrl, category, catalogPriceUSD,
    }
    add(item)
    setJustAdded(true)

    // Reset "just added" feedback after 2 s
    setTimeout(() => setJustAdded(false), 2_000)
  }

  // ── Idle state (not watching) ───────────────────────────────────────────────

  if (!watching) {
    return (
      <button
        onClick={handleFollow}
        className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border-2 border-gray-200 text-gray-700 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-colors"
      >
        <Bell className="h-4 w-4" />
        Seguir precio
      </button>
    )
  }

  // ── Watching state ──────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Main state indicator */}
        <button
          onClick={() => setSheetOpen(true)}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
            justAdded
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : hasAlert
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-gray-50 border border-gray-200 text-gray-600'
          }`}
        >
          {justAdded ? (
            <>
              <Check className="h-4 w-4" />
              ¡Guardado!
            </>
          ) : hasAlert ? (
            <>
              <BellRing className="h-4 w-4" />
              {watchItem?.alertTrigger === 'price_below' && watchItem.alertTargetUSD
                ? `Alerta: < $${watchItem.alertTargetUSD}`
                : watchItem?.alertTrigger === 'all_time_low'
                ? 'Alerta: precio mínimo'
                : 'Alerta activa'}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </>
          ) : (
            <>
              <Check className="h-4 w-4 text-emerald-600" />
              <span className="text-gray-600">Siguiendo</span>
              <span
                className="text-xs text-amber-600 font-semibold cursor-pointer hover:underline"
                onClick={(e) => { e.stopPropagation(); setSheetOpen(true) }}
              >
                + Configurar alerta
              </span>
            </>
          )}
        </button>

        {/* Unfollow (subtle) */}
        <button
          onClick={() => remove(productId)}
          className="text-xs text-gray-400 hover:text-red-400 transition-colors px-1"
          title="Dejar de seguir"
          aria-label="Dejar de seguir este producto"
        >
          ✕
        </button>
      </div>

      <AlertSetupSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        productId={productId}
        asin={asin}
        title={title}
        catalogPriceUSD={catalogPriceUSD}
        currentAlert={
          watchItem?.alertTrigger
            ? { trigger: watchItem.alertTrigger, targetUSD: watchItem.alertTargetUSD }
            : undefined
        }
        onAlertSaved={(alert, subscriptionId) => {
          updateAlert(productId, { ...alert, subscriptionId })
          setSheetOpen(false)
        }}
      />
    </>
  )
}
