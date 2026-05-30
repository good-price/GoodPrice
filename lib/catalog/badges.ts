/**
 * lib/catalog/badges.ts
 *
 * Dynamic badge engine for the GOODPRICE public catalog.
 *
 * Produces context-aware badges that communicate product quality,
 * popularity, and Colombia shipping eligibility to buyers.
 *
 * Badge priority (highest wins):
 *   1. "En tendencia"            — product in intelligence promotion queue
 *   2. "Mejor valorado"          — rating ≥ 4.8 and reviews ≥ 100
 *   3. "Top Colombia"            — confirmed Colombia shipping, rating ≥ 4.5, reviews ≥ 50
 *   4. "Muy seguido"             — reviews ≥ 500 (social proof signal)
 *   5. "Alta intención"          — is a top seller
 *   6. "Importación recomendada" — confirmed Colombia shipping (any quality)
 *   null                         — no dynamic badge; UI falls back to product.badge
 *
 * Architecture:
 *   - buildSmartBadge()       → single-product badge string or null
 *   - buildDynamicBadgeMap()  → Record<productId, string> for server components
 *   - getBadgeStyle()         → Tailwind classes per badge type for ProductCard
 *
 * All functions are pure / sync — safe to call in server components and during
 * static generation. The snapshot type is consumed via `import type` so this
 * module is also safe to import from client components (getBadgeStyle only).
 *
 * Public API:
 *   buildSmartBadge(product, snapshot, promotedSet?)  → badge string or null
 *   buildDynamicBadgeMap(products, snapshot)          → Record<productId, string>
 *   getBadgeStyle(badge)                              → Tailwind class string
 */

import type { Product } from '@/types'
import type { IntelligenceSnapshot } from '@/lib/catalog/intelligence/snapshot'

// ── Badge label constants ──────────────────────────────────────────────────────

export const BADGE_TENDENCIA      = 'En tendencia'
export const BADGE_MEJOR_VALORADO = 'Mejor valorado'
export const BADGE_TOP_COLOMBIA   = 'Top Colombia'
export const BADGE_MUY_SEGUIDO    = 'Muy seguido'
export const BADGE_ALTA_INTENCION = 'Alta intención'
export const BADGE_IMPORTACION    = 'Importación recomendada'

// ── Quality thresholds ────────────────────────────────────────────────────────

/** Minimum rating for "Mejor valorado" */
const RATING_BEST       = 4.8
/** Minimum reviews for "Mejor valorado" */
const REVIEWS_BEST      = 100
/** Minimum rating for "Top Colombia" */
const RATING_COLOMBIA   = 4.5
/** Minimum reviews for "Top Colombia" */
const REVIEWS_COLOMBIA  = 50
/** Minimum reviews for "Muy seguido" */
const REVIEWS_POPULAR   = 500

// ── Core badge logic ──────────────────────────────────────────────────────────

/**
 * Returns the highest-priority dynamic badge for a product, or null if none
 * applies. When null is returned, ProductCard falls back to product.badge.
 *
 * @param product      — product to evaluate
 * @param snapshot     — intelligence snapshot (null on first deploy — graceful)
 * @param promotedSet  — pre-built Set<productId> from snapshot.promotedIds;
 *                       pass this when calling in a loop to avoid O(n²) cost
 */
export function buildSmartBadge(
  product:      Product,
  snapshot:     IntelligenceSnapshot | null,
  promotedSet?: Set<string>,
): string | null {
  const id = product.id ?? ''

  // Priority 1 — intelligence-promoted products ("En tendencia")
  const promoted = promotedSet ?? (snapshot ? new Set(snapshot.promotedIds) : null)
  if (snapshot && promoted && promoted.has(id)) return BADGE_TENDENCIA

  // Priority 2 — exceptional rating + meaningful review count ("Mejor valorado")
  if (product.rating >= RATING_BEST && product.reviews >= REVIEWS_BEST) {
    return BADGE_MEJOR_VALORADO
  }

  // Priority 3 — confirmed Colombia shipping + quality bar ("Top Colombia")
  if (
    product.shipsToColombiaConfirmed === true &&
    product.rating  >= RATING_COLOMBIA &&
    product.reviews >= REVIEWS_COLOMBIA
  ) {
    return BADGE_TOP_COLOMBIA
  }

  // Priority 4 — strong social proof via review count ("Muy seguido")
  if (product.reviews >= REVIEWS_POPULAR) return BADGE_MUY_SEGUIDO

  // Priority 5 — catalog top-seller flag ("Alta intención")
  if (product.isTopSeller) return BADGE_ALTA_INTENCION

  // Priority 6 — any confirmed Colombia-eligible product ("Importación recomendada")
  if (product.shipsToColombiaConfirmed === true) return BADGE_IMPORTACION

  return null
}

// ── Batch helper for server components ───────────────────────────────────────

/**
 * Builds a Record<productId, badge> map for a product array.
 * Products that receive no dynamic badge are excluded from the map.
 *
 * Use this in server components, then pass the result as
 * `dynamicBadges` to ProductGrid (which forwards to ProductCard).
 *
 * O(n) — promoted set is built once, then O(1) per product.
 */
export function buildDynamicBadgeMap(
  products: Product[],
  snapshot: IntelligenceSnapshot | null,
): Record<string, string> {
  // Build promoted set once for O(1) lookups across all products
  const promotedSet = snapshot ? new Set(snapshot.promotedIds) : undefined
  const map: Record<string, string> = {}

  for (const product of products) {
    const badge = buildSmartBadge(product, snapshot, promotedSet)
    if (badge && product.id) {
      map[product.id] = badge
    }
  }

  return map
}

// ── Badge styling ─────────────────────────────────────────────────────────────

/**
 * Returns Tailwind class string for the badge chip background + text colour.
 * Each badge type carries a distinct semantic colour to reinforce its meaning.
 *
 * Dynamic badges receive semantically meaningful colours;
 * static product.badge values and any unknown string fall back to the
 * brand gold (#F7A823) used in the original design.
 */
export function getBadgeStyle(badge: string): string {
  switch (badge) {
    case BADGE_TENDENCIA:      return 'bg-orange-500 text-white'
    case BADGE_MEJOR_VALORADO: return 'bg-purple-600 text-white'
    case BADGE_TOP_COLOMBIA:   return 'bg-teal-500 text-white'
    case BADGE_MUY_SEGUIDO:    return 'bg-blue-500 text-white'
    case BADGE_ALTA_INTENCION: return 'bg-green-600 text-white'
    case BADGE_IMPORTACION:    return 'bg-cyan-600 text-white'
    default:                   return 'bg-[#F7A823] text-black'
  }
}
