/**
 * lib/catalog/intelligence/recommendations.ts
 *
 * Generates product-to-product related product suggestions.
 *
 * Similarity signals (in priority order):
 *   1. same_brand     → same brand in same category (strongest signal)
 *   2. same_category  → same category, similar price range (±40%)
 *   3. similar_price  → same category, very close price (±15%)
 *
 * Unhealthy / quarantined / archived products are excluded from recommendations.
 * Results are sorted by health score descending (best first).
 *
 * Used by: admin dashboard "related products" view.
 * NOT yet wired into public product pages — that requires ISR cache or edge cache.
 */

import type { Product } from '@/types'
import type { ProductHealthScore, ProductLifecycleState, RelatedProduct } from './types'

// ── Constants ──────────────────────────────────────────────────────────────────

const EXCLUDED_STATES = new Set<ProductLifecycleState>(['quarantined', 'archived', 'unhealthy'])
const MAX_RELATED     = 6

// ── Main function ──────────────────────────────────────────────────────────────

export function getRelatedProducts(
  targetProductId: string,
  products: Product[],
  healthScores: ProductHealthScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
): RelatedProduct[] {
  const healthMap = new Map(healthScores.map(h => [h.productId, h]))

  const target = products.find(p => p.id === targetProductId)
  if (!target) return []

  const candidates: Array<RelatedProduct & { healthScore: number }> = []

  for (const product of products) {
    const id = product.id ?? ''
    if (id === targetProductId) continue

    const lifecycle = lifecycleStates[id]
    if (lifecycle && EXCLUDED_STATES.has(lifecycle)) continue

    const health = healthMap.get(id)
    if (!health) continue

    // Same brand + same category
    if (
      product.brand &&
      target.brand &&
      product.brand.toLowerCase() === target.brand.toLowerCase() &&
      product.category === target.category
    ) {
      candidates.push({
        productId:   id,
        title:       product.title,
        asin:        product.asin ?? '',
        similarity:  'same_brand',
        healthScore: health.total,
      })
      continue
    }

    // Same category + similar price (±40%)
    if (
      product.category === target.category &&
      target.price > 0 &&
      product.price > 0
    ) {
      const priceDiff = Math.abs(product.price - target.price) / target.price
      if (priceDiff <= 0.40) {
        candidates.push({
          productId:   id,
          title:       product.title,
          asin:        product.asin ?? '',
          similarity:  priceDiff <= 0.15 ? 'similar_price' : 'same_category',
          healthScore: health.total,
        })
      }
    }
  }

  // Deduplicate (same_brand wins over same_category wins over similar_price)
  const seen     = new Set<string>()
  const priority = { same_brand: 0, similar_price: 1, same_category: 2 }
  const sorted   = candidates.sort(
    (a, b) =>
      priority[a.similarity] - priority[b.similarity] ||
      b.healthScore - a.healthScore,
  )

  const result: RelatedProduct[] = []
  for (const c of sorted) {
    if (seen.has(c.productId)) continue
    seen.add(c.productId)
    result.push({ productId: c.productId, title: c.title, asin: c.asin, similarity: c.similarity })
    if (result.length >= MAX_RELATED) break
  }

  return result
}

/**
 * Bulk related products — returns top N related products per product in the catalog.
 * Used in the intelligence report for admin observability.
 */
export function getTopRelatedByCategory(
  products: Product[],
  healthScores: ProductHealthScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
  targetCategory: string,
  topN = 5,
): Record<string, RelatedProduct[]> {
  const result: Record<string, RelatedProduct[]> = {}

  const catProducts = products.filter(p => p.category === targetCategory)
  for (const product of catProducts) {
    const id = product.id ?? ''
    result[id] = getRelatedProducts(id, products, healthScores, lifecycleStates)
      .slice(0, topN)
  }

  return result
}
