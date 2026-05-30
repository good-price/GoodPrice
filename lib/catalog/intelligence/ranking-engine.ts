/**
 * lib/catalog/intelligence/ranking-engine.ts
 *
 * Computes composite ranking scores for products within each category.
 *
 * Ranking formula:
 *   rankScore = 0.40 × (health/100)
 *             + 0.30 × (engagement/100)
 *             + 0.20 × (freshness bonus)
 *             + 0.10 × (offer/top-seller boost)
 *
 * Freshness bonus:
 *   1.0 if lastValidated ≤ 30 days
 *   0.7 if ≤ 90 days
 *   0.4 if ≤ 180 days
 *   0.0 otherwise
 *
 * Offer/top-seller boost:
 *   isOffer=true → 0.7
 *   isTopSeller=true → 1.0
 *   both → 1.0
 *   neither → 0.0
 *
 * Returns per-category sorted arrays of product IDs (best first).
 * Unhealthy / quarantined / archived products are placed last.
 */

import type { Product } from '@/types'
import type { ProductHealthScore, EngagementScore, ProductLifecycleState, RankedProduct } from './types'

// ── Constants ──────────────────────────────────────────────────────────────────

const W_HEALTH     = 0.40
const W_ENGAGEMENT = 0.30
const W_FRESHNESS  = 0.20
const W_BOOST      = 0.10

// ── Helpers ────────────────────────────────────────────────────────────────────

function freshnessBonus(lastValidated: string | undefined): number {
  if (!lastValidated) return 0
  const ageDays = (Date.now() - new Date(lastValidated).getTime()) / 86_400_000
  if (ageDays <= 30)  return 1.0
  if (ageDays <= 90)  return 0.7
  if (ageDays <= 180) return 0.4
  return 0.1
}

function catalogBoost(product: Product): number {
  if (product.isTopSeller) return 1.0
  if (product.isOffer)     return 0.7
  return 0.0
}

const DEPRIORITISED = new Set<ProductLifecycleState>(['unhealthy', 'quarantined', 'archived'])

// ── Main function ──────────────────────────────────────────────────────────────

export function computeRankScore(
  product: Product,
  health: ProductHealthScore,
  engagement: EngagementScore | null,
  lifecycle: ProductLifecycleState,
): number {
  // Deprioritised products always go to the bottom
  if (DEPRIORITISED.has(lifecycle)) return -1

  const h = health.total / 100
  const e = (engagement?.score ?? 0) / 100
  const f = freshnessBonus(product.lastValidated)
  const b = catalogBoost(product)

  return W_HEALTH * h + W_ENGAGEMENT * e + W_FRESHNESS * f + W_BOOST * b
}

/**
 * Returns per-category rankings: Record<categorySlug, productId[]>
 * Products are sorted from best to worst.
 */
export function computeCategoryRankings(
  products: Product[],
  healthScores: ProductHealthScore[],
  engagementScores: EngagementScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
): Record<string, string[]> {
  const healthMap     = new Map(healthScores.map(h => [h.productId, h]))
  const engagementMap = new Map(engagementScores.map(e => [e.productId, e]))

  // Group by category
  const byCat = new Map<string, Array<{ productId: string; rankScore: number }>>()

  for (const product of products) {
    const id         = product.id ?? ''
    const health     = healthMap.get(id)
    const engagement = engagementMap.get(id) ?? null
    const lifecycle  = lifecycleStates[id] ?? 'stale'

    if (!health) continue

    const rankScore = computeRankScore(product, health, engagement, lifecycle)
    const cat       = product.category

    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat)!.push({ productId: id, rankScore })
  }

  // Sort each category and extract IDs
  const result: Record<string, string[]> = {}
  for (const [cat, items] of Array.from(byCat.entries())) {
    result[cat] = items
      .sort((a, b) => b.rankScore - a.rankScore)
      .map(i => i.productId)
  }

  return result
}

/**
 * Returns ranked products for a single category (for use in page rendering).
 */
export function getCategoryRankedProducts(
  categorySlug: string,
  products: Product[],
  healthScores: ProductHealthScore[],
  engagementScores: EngagementScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
): RankedProduct[] {
  const catProducts = products.filter(p => p.category === categorySlug)
  const rankings    = computeCategoryRankings(
    catProducts, healthScores, engagementScores, lifecycleStates,
  )
  const ranked = rankings[categorySlug] ?? []

  return ranked.map((productId, idx) => ({
    productId,
    rankScore: 0,  // score not needed for UI consumption
    position:  idx + 1,
  }))
}
