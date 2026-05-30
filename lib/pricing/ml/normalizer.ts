/**
 * MercadoLibre API Response → NormalizedRetailerProduct
 *
 * Converts a typed MLItemResponse (from the ML public API) into a
 * NormalizedRetailerProduct that the generic pricing pipeline can process.
 *
 * This is the glue between the ML-specific types and the provider-agnostic
 * pricing infrastructure defined in lib/pricing/types.ts.
 *
 * Availability resolution order:
 *   1. ML item `status` field ('active' | 'paused' | 'closed' | etc.)
 *   2. `available_quantity` numeric signal (0 = out_of_stock, ≤5 = limited)
 *   3. Combine both signals (most restrictive wins)
 *
 * Price: ML API returns COP integers directly — no string parsing needed.
 * The provider's `normalizePrice` handles the string case for display/scrape paths.
 *
 * All functions are pure (no I/O, no async).
 */

import type { MLItemResponse, MLSearchItem } from './types'
import type { NormalizedRetailerProduct, AvailabilityStatus } from '../types'
import { normalizeAvailabilityFromQuantity, combineAvailabilitySignals } from '../normalizers/availability'
import { toUSD } from '../normalizers/price'

// ── ML status → AvailabilityStatus ───────────────────────────────────────────

const ML_STATUS_MAP: Record<string, AvailabilityStatus> = {
  active:       'in_stock',
  paused:       'out_of_stock',
  closed:       'out_of_stock',
  under_review: 'unknown',
  inactive:     'out_of_stock',
}

/**
 * Resolve ML item status to an AvailabilityStatus.
 * Combines the API `status` field with `available_quantity` for accuracy.
 *
 * @param status            - ML item status string
 * @param availableQuantity - ML `available_quantity` integer
 */
export function resolveMLAvailability(
  status: string,
  availableQuantity: number,
): AvailabilityStatus {
  const statusSignal   = ML_STATUS_MAP[status.toLowerCase()] ?? 'unknown'
  const quantitySignal = normalizeAvailabilityFromQuantity(availableQuantity)

  return combineAvailabilitySignals([statusSignal, quantitySignal])
}

// ── Full item normalization ───────────────────────────────────────────────────

/**
 * Convert a full MLItemResponse (from /items/{id}) into a NormalizedRetailerProduct.
 *
 * @param item      - Full ML API item response
 * @param copPerUSD - Current COP/USD exchange rate
 * @returns Normalized product ready for the pricing pipeline
 */
export function normalizeMLItem(
  item: MLItemResponse,
  copPerUSD: number,
): NormalizedRetailerProduct {
  const warnings: string[] = []

  // Price: ML API returns COP integers — already numeric
  const price    = item.price
  const priceUSD = toUSD(price, 'COP', copPerUSD)

  if (isNaN(priceUSD)) {
    warnings.push(`Could not convert price ${price} COP to USD (rate: ${copPerUSD})`)
  }

  // Old price (crossed-out)
  const oldPrice = item.original_price ?? undefined

  // Availability
  const availability = resolveMLAvailability(item.status, item.available_quantity)
  if (availability === 'unknown') {
    warnings.push(`Unknown availability: status="${item.status}", qty=${item.available_quantity}`)
  }

  // Image: prefer secure_thumbnail, fall back to thumbnail
  const imageUrl = item.secure_thumbnail || item.thumbnail || ''
  if (!imageUrl) warnings.push('No image URL available from ML API')

  // External ID: strip any dash (MCO-123 → MCO123)
  const externalId = item.id.replace('-', '')

  return {
    externalId,
    retailerId:               'mercadolibre',
    title:                    item.title.trim(),
    price,
    currency:                 'COP',
    priceUSD:                 isNaN(priceUSD) ? 0 : priceUSD,
    exchangeRate:             copPerUSD,
    oldPrice,
    availability,
    imageUrl,
    url:                      item.permalink,
    shipsToColombiaConfirmed: true, // MercadoLibre is a local marketplace
    normalizedAt:             new Date().toISOString(),
    warnings,
  }
}

// ── Search result normalization ───────────────────────────────────────────────

/**
 * Convert a lightweight MLSearchItem (from /sites/MCO/search) into a
 * NormalizedRetailerProduct. Less complete than a full item — no attributes,
 * no secondary status, no secure_thumbnail — but sufficient for initial matching.
 *
 * Used when we want to normalize a search result before fetching full details.
 *
 * @param item      - ML search result item
 * @param copPerUSD - Current COP/USD exchange rate
 */
export function normalizeMLSearchItem(
  item: MLSearchItem,
  copPerUSD: number,
): NormalizedRetailerProduct {
  const warnings: string[] = []

  const price    = item.price
  const priceUSD = toUSD(price, 'COP', copPerUSD)

  if (isNaN(priceUSD)) {
    warnings.push(`Could not convert price ${price} COP to USD (rate: ${copPerUSD})`)
  }

  const oldPrice     = item.original_price ?? undefined
  const availability = normalizeAvailabilityFromQuantity(item.available_quantity)

  return {
    externalId:               item.id.replace('-', ''),
    retailerId:               'mercadolibre',
    title:                    item.title.trim(),
    price,
    currency:                 'COP',
    priceUSD:                 isNaN(priceUSD) ? 0 : priceUSD,
    exchangeRate:             copPerUSD,
    oldPrice,
    availability,
    imageUrl:                 item.thumbnail || '',
    url:                      item.permalink,
    shipsToColombiaConfirmed: true,
    normalizedAt:             new Date().toISOString(),
    warnings,
  }
}

// ── Exchange rate helpers ─────────────────────────────────────────────────────

/**
 * Format a COP price for display.
 * Example: 1299000 → "$ 1.299.000"
 */
export function formatCOP(amount: number): string {
  return `$ ${Math.round(amount).toLocaleString('es-CO')}`
}

/**
 * Format a USD price for display.
 * Example: 312.65 → "USD $312.65"
 */
export function formatUSD(amount: number): string {
  return `USD $${amount.toFixed(2)}`
}
