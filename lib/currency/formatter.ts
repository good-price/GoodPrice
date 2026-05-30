/**
 * lib/currency/formatter.ts
 *
 * Price formatting for the Colombia-first GOODPRICE UX.
 *
 * Display contract:
 *   Primary:   $ 1.029.000 COP    (Colombian peso, always shown)
 *   Secondary: ≈ USD $279.99      (US dollar reference, smaller / muted)
 *
 * Colombia locale (es-CO):
 *   - Thousands separator: .  (period)
 *   - Decimal separator:   ,  (comma)
 *   - Currency symbol:     $  (same as USD — we append "COP" / "USD" explicitly)
 *
 * These functions are server-side only. The formatted strings are passed to
 * client components as props — no client-side currency computation occurs.
 *
 * Zero npm dependencies — uses the built-in Intl.NumberFormat API.
 */

import { getCachedRate } from './cache'
import type { FormattedPrice } from './types'

// ── Formatters ─────────────────────────────────────────────────────────────────

/**
 * Formats a Colombian Peso amount as a display string.
 *   formatCOP(1029000)  → "$ 1.029.000"
 *   formatCOP(1029500)  → "$ 1.029.500"
 */
export function formatCOP(amountCOP: number): string {
  const rounded  = Math.round(amountCOP)
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded)
  return `$ ${formatted}`
}

/**
 * Formats a USD amount as a reference string.
 *   formatUSD(279.99) → "USD $279.99"
 *   formatUSD(50)     → "USD $50.00"
 */
export function formatUSD(amountUSD: number): string {
  return `USD $${amountUSD.toFixed(2)}`
}

/**
 * Converts a USD price to COP using the cached exchange rate.
 * Uses the in-process cached rate — no disk read unless the cache is stale.
 *   convertUSDtoCOP(279.99) → 1153959  (at 4125.50 rate)
 */
export function convertUSDtoCOP(amountUSD: number): number {
  return amountUSD * getCachedRate()
}

/**
 * Produces a complete FormattedPrice object from a USD amount.
 * Use this in server components that render ProductCard / ProductGrid.
 *
 *   priceFor(279.99) → {
 *     cop:    "$ 1.153.959",
 *     usd:    "USD $279.99",
 *     copRaw: 1153959,
 *   }
 */
export function priceFor(amountUSD: number): FormattedPrice {
  const copRaw = convertUSDtoCOP(amountUSD)
  return {
    cop:    formatCOP(copRaw),
    usd:    formatUSD(amountUSD),
    copRaw,
  }
}

/**
 * Builds a map of productId → formatted COP price string.
 * Pass this to ProductGrid or ProductsClient as the `copPrices` prop.
 *
 * Usage in a server component:
 *   const copPrices = buildCopPriceMap(products)
 *   <ProductGrid products={products} copPrices={copPrices} />
 */
export function buildCopPriceMap(
  products: Array<{ id?: string | null; price: number }>,
): Record<string, string> {
  const rate   = getCachedRate()
  const result: Record<string, string> = {}
  for (const p of products) {
    const id = p.id ?? ''
    if (!id) continue
    result[id] = formatCOP(p.price * rate)
  }
  return result
}
