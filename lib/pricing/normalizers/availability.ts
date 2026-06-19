/**
 * GOODPRICE Pricing — Availability Normalizer
 *
 * Parses raw availability signals from any retailer into a typed AvailabilityStatus.
 *
 * Each retailer expresses availability differently:
 *   Amazon:   "In Stock", "Only 3 left", "Currently unavailable"
 *   Alkosto:  "Disponible", "Agotado", "Pocas unidades"
 *   Falabella: "Disponible", "Agotado", quantity indicator
 *   Éxito:    VTEX IsAvailable boolean + stock count
 *
 * This module provides:
 *   1. normalizeAvailabilityString — for text-based availability
 *   2. normalizeAvailabilityFromQuantity — for numeric quantity signals
 *   3. normalizeAvailabilityFromBoolean — for boolean IsAvailable fields
 *   4. combineAvailabilitySignals — merge multiple signals into one verdict
 *
 * Design principle: when in doubt, return 'unknown' rather than a wrong status.
 * A false 'in_stock' is worse than 'unknown' for user trust.
 */

import type { AvailabilityStatus } from '../types'

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Below this quantity, status is 'limited' rather than 'in_stock' */
const LIMITED_STOCK_THRESHOLD = 5

// ── Text normalization ────────────────────────────────────────────────────────

/** Ordered availability keyword patterns (checked in order — more specific first) */
const AVAILABILITY_PATTERNS: Array<{ patterns: string[]; status: AvailabilityStatus }> = [
  // Preorder — check before general "available" patterns
  {
    patterns: ['pre-order', 'preorder', 'preventa', 'pre-venta', 'próxima llegada', 'pre-release'],
    status: 'preorder',
  },
  // Discontinued — check early (some sites say "discontinued - in stock" for clearance)
  {
    patterns: ['discontinued by manufacturer', 'discontinuado', 'descontinuado', 'discontinued'],
    status: 'discontinued',
  },
  // Out of stock
  {
    patterns: [
      'out of stock', 'currently unavailable', 'not available',
      'agotado', 'sin stock', 'no disponible', 'no hay stock',
      'cerrado', 'pausado', 'temporalmente sin stock',
      'temporarily out of stock',
    ],
    status: 'out_of_stock',
  },
  // Limited stock — check before generic 'in_stock'
  {
    patterns: [
      'only', 'order soon', 'pocas unidades', 'últimas unidades',
      'últimas', 'pocos disponibles', 'limited stock', 'low stock',
    ],
    status: 'limited',
  },
  // In stock — broad positive signals
  {
    patterns: [
      'in stock', 'ships from', 'usually ships', 'available to ship',
      'disponible', 'en stock', 'activo', 'active',
      'agregar al carro', 'agregar al carrito', 'add to cart',
    ],
    status: 'in_stock',
  },
]

/**
 * Parse a raw availability string into a typed AvailabilityStatus.
 * Case-insensitive, trims whitespace, matches substrings.
 *
 * @param rawStatus - Any availability text from a retailer
 * @returns Typed availability status; 'unknown' if no pattern matches
 */
export function normalizeAvailabilityString(rawStatus: string): AvailabilityStatus {
  if (!rawStatus || typeof rawStatus !== 'string') return 'unknown'

  const lower = rawStatus.toLowerCase().trim()
  if (!lower) return 'unknown'

  for (const { patterns, status } of AVAILABILITY_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return status
  }

  return 'unknown'
}

// ── Quantity-based normalization ──────────────────────────────────────────────

/**
 * Derive availability from a raw stock quantity number.
 * Used when the retailer provides a numeric quantity (VTEX, PA-API, scrapers).
 *
 * @param quantity - Available quantity (0 = out of stock, null/undefined = unknown)
 * @returns Typed availability status
 */
export function normalizeAvailabilityFromQuantity(
  quantity: number | null | undefined,
): AvailabilityStatus {
  if (quantity === null || quantity === undefined) return 'unknown'
  if (!isFinite(quantity) || quantity < 0) return 'unknown'
  if (quantity === 0) return 'out_of_stock'
  if (quantity <= LIMITED_STOCK_THRESHOLD) return 'limited'
  return 'in_stock'
}

// ── Boolean-based normalization ───────────────────────────────────────────────

/**
 * Derive availability from a boolean IsAvailable signal.
 * Used for VTEX (Éxito) and similar platforms with explicit availability flags.
 *
 * @param isAvailable - Boolean or string "true"/"false" from retailer
 * @param quantity    - Optional quantity to refine 'in_stock' → 'limited'
 * @returns Typed availability status
 */
export function normalizeAvailabilityFromBoolean(
  isAvailable: boolean | string | null | undefined,
  quantity?: number | null,
): AvailabilityStatus {
  if (isAvailable === null || isAvailable === undefined) return 'unknown'

  const available =
    typeof isAvailable === 'boolean'
      ? isAvailable
      : isAvailable.toLowerCase() === 'true'

  if (!available) return 'out_of_stock'

  // Refine with quantity if provided
  if (quantity !== null && quantity !== undefined) {
    return normalizeAvailabilityFromQuantity(quantity)
  }

  return 'in_stock'
}

// ── Signal combination ────────────────────────────────────────────────────────

/**
 * Combine multiple availability signals into a single verdict.
 *
 * Priority order (most restrictive wins when signals conflict):
 *   out_of_stock > limited > in_stock > preorder > discontinued > unknown
 *
 * Rationale: it's better to show 'out_of_stock' when uncertain than to show
 * 'in_stock' and send the user to a page where they can't buy.
 *
 * @param signals - Array of availability signals from different sources
 * @returns The most conservative (safe) status
 */
export function combineAvailabilitySignals(
  signals: AvailabilityStatus[],
): AvailabilityStatus {
  const filtered: AvailabilityStatus[] = signals.filter(s => s !== 'unknown')
  if (filtered.length === 0) return 'unknown'

  // Priority: most restrictive → least restrictive
  const priority: AvailabilityStatus[] = [
    'out_of_stock',
    'discontinued',
    'limited',
    'preorder',
    'in_stock',
  ]

  for (const status of priority) {
    if (filtered.includes(status)) return status
  }

  return 'unknown'
}

// ── Display utilities ─────────────────────────────────────────────────────────

/** Human-readable Spanish labels for each availability status */
export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  in_stock:     'Disponible',
  out_of_stock: 'Agotado',
  limited:      'Últimas unidades',
  preorder:     'Preventa',
  discontinued: 'Descontinuado',
  unknown:      'Sin información',
}

/** Tailwind CSS color classes for each availability status */
export const AVAILABILITY_COLORS: Record<AvailabilityStatus, string> = {
  in_stock:     'text-emerald-600',
  out_of_stock: 'text-red-500',
  limited:      'text-amber-500',
  preorder:     'text-blue-500',
  discontinued: 'text-gray-400',
  unknown:      'text-gray-400',
}

/** Whether this status indicates the product can currently be purchased */
export function isAvailableToBuy(status: AvailabilityStatus): boolean {
  return status === 'in_stock' || status === 'limited'
}

/** Whether this status should prevent showing the product in "available" filters */
export function isUnavailable(status: AvailabilityStatus): boolean {
  return status === 'out_of_stock' || status === 'discontinued'
}
