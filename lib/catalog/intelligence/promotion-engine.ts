/**
 * lib/catalog/intelligence/promotion-engine.ts
 *
 * Identifies products that should be featured / promoted in the catalog.
 *
 * Promotion is about surfacing the BEST products more prominently —
 * as "best sellers", "top rated", or "staff picks" in the UI.
 *
 * This engine produces a QUEUE. It does NOT modify product data.
 * The admin can act on suggestions via the admin dashboard.
 *
 * Promotion rules (best products win):
 *   TIER 1 (strongest case):
 *     - Trending lifecycle + health ≥ 75 + top 10% engagement
 *   TIER 2:
 *     - Healthy lifecycle + health ≥ 80 + top 20% engagement
 *     - isTopSeller=true in catalog + health ≥ 65
 *   TIER 3 (rising stars):
 *     - New lifecycle + health ≥ 70 (promising newcomer)
 *     - Stable lifecycle + health ≥ 75 + top 30% engagement (consistent performer)
 *
 * Maximum 20 candidates returned (sorted best first).
 */

import type { Product } from '@/types'
import type { ProductHealthScore, EngagementScore, ProductLifecycleState, PromotionCandidate } from './types'

export function computePromotionQueue(
  products: Product[],
  healthScores: ProductHealthScore[],
  engagementScores: EngagementScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
): PromotionCandidate[] {
  const healthMap     = new Map(healthScores.map(h => [h.productId, h]))
  const engagementMap = new Map(engagementScores.map(e => [e.productId, e]))

  const total = products.length
  const top10  = Math.ceil(total * 0.10)
  const top20  = Math.ceil(total * 0.20)
  const top30  = Math.ceil(total * 0.30)

  const candidates: Array<PromotionCandidate & { tier: number }> = []

  for (const product of products) {
    const id         = product.id ?? ''
    const health     = healthMap.get(id)
    const engagement = engagementMap.get(id)
    const lifecycle  = lifecycleStates[id]

    if (!health) continue

    // Skip unhealthy / quarantined / archived — never promote these
    if (
      lifecycle === 'quarantined' ||
      lifecycle === 'archived' ||
      lifecycle === 'unhealthy'
    ) continue

    const globalRank = engagement?.globalRank ?? total
    const engScore   = engagement?.score ?? 0

    // Tier 1 — trending + high health + top engagement
    if (
      lifecycle === 'trending' &&
      health.total >= 75 &&
      globalRank <= top10
    ) {
      candidates.push({
        productId:       id,
        asin:            product.asin ?? '',
        title:           product.title,
        category:        product.category,
        reason:          'Trending: high engagement + strong health score',
        healthScore:     health.total,
        engagementScore: engScore,
        lifecycleState:  lifecycle,
        tier:            1,
      })
      continue
    }

    // Tier 2a — healthy + very high health + top engagement
    if (
      lifecycle === 'healthy' &&
      health.total >= 80 &&
      globalRank <= top20
    ) {
      candidates.push({
        productId:       id,
        asin:            product.asin ?? '',
        title:           product.title,
        category:        product.category,
        reason:          'Consistently healthy: top engagement + high reliability',
        healthScore:     health.total,
        engagementScore: engScore,
        lifecycleState:  lifecycle,
        tier:            2,
      })
      continue
    }

    // Tier 2b — catalog top seller flag + healthy enough
    if (product.isTopSeller && health.total >= 65) {
      candidates.push({
        productId:       id,
        asin:            product.asin ?? '',
        title:           product.title,
        category:        product.category,
        reason:          'Catalog top seller with healthy reliability score',
        healthScore:     health.total,
        engagementScore: engScore,
        lifecycleState:  lifecycle,
        tier:            2,
      })
      continue
    }

    // Tier 3a — promising newcomer
    if (lifecycle === 'new' && health.total >= 70) {
      candidates.push({
        productId:       id,
        asin:            product.asin ?? '',
        title:           product.title,
        category:        product.category,
        reason:          'Rising star: new addition with strong initial health',
        healthScore:     health.total,
        engagementScore: engScore,
        lifecycleState:  lifecycle,
        tier:            3,
      })
      continue
    }

    // Tier 3b — stable consistent performer
    if (
      lifecycle === 'stable' &&
      health.total >= 75 &&
      globalRank <= top30
    ) {
      candidates.push({
        productId:       id,
        asin:            product.asin ?? '',
        title:           product.title,
        category:        product.category,
        reason:          'Stable performer: consistent engagement + high reliability',
        healthScore:     health.total,
        engagementScore: engScore,
        lifecycleState:  lifecycle,
        tier:            3,
      })
    }
  }

  // Sort: tier asc → healthScore + engagementScore desc
  return candidates
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.healthScore + b.engagementScore - (a.healthScore + a.engagementScore),
    )
    .slice(0, 20)
    .map(c => ({
      productId:       c.productId,
      asin:            c.asin,
      title:           c.title,
      category:        c.category,
      reason:          c.reason,
      healthScore:     c.healthScore,
      engagementScore: c.engagementScore,
      lifecycleState:  c.lifecycleState,
    } satisfies import('./types').PromotionCandidate))
}
