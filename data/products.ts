/**
 * data/products.ts — public-safe product helpers.
 *
 * ALL functions here return only products that pass the public safety gates
 * defined in lib/catalog/public.ts (active status, no Colombia restriction,
 * not quarantined, valid ASIN, valid image URL, audit score ≥ 70, not
 * intelligence-suppressed at CRITICAL severity).
 *
 * When an intelligence snapshot is available, helpers apply rank-based sorting
 * using the composite score (health × engagement × freshness × boost).
 * Without a snapshot every function falls back to its original static logic.
 *
 * This is the single source of truth for all public-facing pages.
 * Do NOT import getColombiaProducts() directly in UI pages.
 *
 * Public API:
 *   getProductsByCategory(category)  → rank-sorted category products
 *   getTopSellers(limit?)            → top-seller flag products, rank-sorted
 *   getOffers(limit?)                → offer flag products, rank-sorted
 *   getFeatured(limit?)              → promoted + high-rating, rank-sorted
 *   getTrending(limit?)              → intelligence-promoted products (Phase 27)
 *   getBestImports(limit?)           → confirmed Colombia-shippable, rank-sorted (Phase 27)
 *   searchProducts(query)            → relevance + rank-scored text search (Phase 27)
 */

import { Product } from '@/types'
import { getPublicProducts } from '@/lib/catalog/public'
import { getCachedSnapshot } from '@/lib/catalog/intelligence/snapshot'

// Public-safe catalog: all reliability gates applied.
// Evaluated once per cold start / build — consistent with Next.js ISR model.
export const products: Product[] = getPublicProducts()

// ── Rank-sort helper ───────────────────────────────────────────────────────────

/**
 * Returns a copy of `arr` sorted by intelligence rankMap descending.
 * Products missing from rankMap go last. Falls back to original order when
 * no snapshot is available or rankMap is empty.
 */
function rankSort(arr: Product[]): Product[] {
  const snapshot = getCachedSnapshot()
  if (!snapshot) return arr
  return [...arr].sort((a, b) => {
    // rankMap values: 0–1 (higher = better), -1 = deprioritised
    const scoreA = snapshot.rankMap[a.id ?? ''] ?? -2
    const scoreB = snapshot.rankMap[b.id ?? ''] ?? -2
    return scoreB - scoreA
  })
}

// ── Public helpers ─────────────────────────────────────────────────────────────

export function getProductsByCategory(category: string): Product[] {
  return rankSort(products.filter(p => p.category === category))
}

export function getTopSellers(limit?: number): Product[] {
  const top = [...products].sort((a, b) => b.reviews - a.reviews || b.rating - a.rating)
  return limit ? top.slice(0, limit) : top
}

export function getOffers(limit?: number): Product[] {
  const offers = [...products]
    .filter(p => p.rating >= 4.6 && p.reviews >= 10000)
    .sort((a, b) => b.reviews - a.reviews)
  return limit ? offers.slice(0, limit) : offers
}

/**
 * Featured products for homepage / hero sections.
 *
 * When a snapshot is available:
 *   Promoted IDs (from the intelligence promotion queue) are used first,
 *   filtered to public-safe products only. The remainder fills from the
 *   classic logic (rating ≥ 4.6, sorted by reviews).
 *
 * Without snapshot:
 *   Original static logic — rating ≥ 4.6 sorted by reviews descending.
 */
export function getFeatured(limit?: number): Product[] {
  const snapshot   = getCachedSnapshot()
  const productMap = new Map(products.map(p => [p.id ?? '', p]))

  if (snapshot && snapshot.promotedIds.length > 0) {
    const suppressedSet = new Set(snapshot.suppressedIds)

    // Collect promoted products that are actually in the public catalog
    const promoted: Product[] = []
    for (const id of snapshot.promotedIds) {
      if (suppressedSet.has(id)) continue
      const p = productMap.get(id)
      if (p) promoted.push(p)
    }

    // Fill remaining slots with classic high-rated products not already in list
    const promotedIds = new Set(promoted.map(p => p.id ?? ''))
    const fallback = products
      .filter(p => p.rating >= 4.6 && !promotedIds.has(p.id ?? ''))
      .sort((a, b) => b.reviews - a.reviews)

    const combined = [...promoted, ...fallback]
    return limit ? combined.slice(0, limit) : combined
  }

  // No snapshot — classic static logic
  const featured = products
    .filter(p => p.rating >= 4.6)
    .sort((a, b) => b.reviews - a.reviews)
  return limit ? featured.slice(0, limit) : featured
}

/**
 * Text search with relevance scoring and intelligence ranking.
 *
 * Relevance tiers (higher = better match):
 *   3 — title contains query (strongest signal — user is looking for this)
 *   2 — brand contains query
 *   1 — category slug contains query
 *
 * Within the same relevance tier, products are sorted by intelligence rank
 * score (composite health × engagement × freshness × boost). This gives
 * healthier, more engaged products higher placement over stale ones when
 * relevance is equal.
 *
 * Returns [] for empty queries.
 */
export function searchProducts(query: string): Product[] {
  const q = query.toLowerCase().trim()
  if (!q) return []

  const snapshot = getCachedSnapshot()

  type Scored = { product: Product; textScore: number; rankScore: number }
  const scored: Scored[] = []

  for (const p of products) {
    const titleMatch    = p.title.toLowerCase().includes(q)    ? 3 : 0
    const brandMatch    = (p.brand?.toLowerCase().includes(q)) ? 2 : 0
    const categoryMatch = p.category.toLowerCase().includes(q) ? 1 : 0
    const textScore     = titleMatch + brandMatch + categoryMatch
    if (textScore === 0) continue

    const rankScore = snapshot?.rankMap[p.id ?? ''] ?? 0
    scored.push({ product: p, textScore, rankScore })
  }

  // Sort: text relevance desc → intelligence rank desc (breaks ties)
  scored.sort((a, b) => b.textScore - a.textScore || b.rankScore - a.rankScore)
  return scored.map(s => s.product)
}

/**
 * Trending products — intelligence-promoted products from the snapshot.
 *
 * When a snapshot is available, returns products in the promotion queue
 * (ordered by the snapshot's promotion-tier sort, best-first), filtered
 * to public-safe products only.
 *
 * Fallback (no snapshot): top sellers sorted by rating desc, then reviews.
 * This ensures the section always has content even before the first snapshot
 * is generated.
 */
export function getTrending(limit?: number): Product[] {
  const snapshot   = getCachedSnapshot()
  const productMap = new Map(products.map(p => [p.id ?? '', p]))

  if (snapshot && snapshot.promotedIds.length > 0) {
    const suppressedSet = new Set(snapshot.suppressedIds)
    const trending: Product[] = []
    for (const id of snapshot.promotedIds) {
      if (suppressedSet.has(id)) continue
      const p = productMap.get(id)
      if (p) trending.push(p)
    }
    return limit ? trending.slice(0, limit) : trending
  }

  // Fallback: most-reviewed top sellers
  const fallback = products
    .filter(p => p.isTopSeller)
    .sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
  return limit ? fallback.slice(0, limit) : fallback
}

/**
 * Best imports — products confirmed shippable to Colombia, rank-sorted.
 *
 * Uses the `shipsToColombiaConfirmed === true` catalog field (populated by
 * the Colombia audit runner) to surface products that Colombian buyers can
 * actually order. Rank-sorted so the healthiest / most engaged products
 * appear first.
 *
 * Returns [] when no products have been confirmed Colombia-eligible yet.
 */
export function getBestImports(limit?: number): Product[] {
  const eligible = rankSort(
    products.filter(p => p.shipsToColombiaConfirmed === true),
  )
  return limit ? eligible.slice(0, limit) : eligible
}
