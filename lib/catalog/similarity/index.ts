/**
 * lib/catalog/similarity/index.ts
 *
 * Barrel + getRelatedProducts() — Sprint 5A.
 *
 * getRelatedProducts(currentAsin, category, count?):
 *   1. Reads public catalog for same-category products
 *   2. Reads recommendations + lifecycle stores for scores
 *   3. Excludes current ASIN
 *   4. Ranks by recommendationScore → qualityScore → trend
 *   5. Returns top `count` products (default 6)
 *
 * SERVER-ONLY.
 */

export type { RelatedProductEntry } from './types'
export { rankRelatedProducts, extractRelatedProducts } from './engine'

import { getPublicCategoryProducts } from '@/lib/catalog/public'
import { readRecommendations }       from '@/lib/catalog/recommendations/state'
import { readLifecycleStore }        from '@/lib/catalog/lifecycle/state'
import { readProductIntelligence }   from '@/lib/catalog/pricing-memory/state'
import { rankRelatedProducts, extractRelatedProducts } from './engine'
import type { Product }              from '@/types'
import type { RelatedProductEntry }  from './types'

/**
 * Returns up to `count` related products from the same category,
 * ranked by recommendation score then quality then pricing trend.
 *
 * Never throws — returns [] on any error.
 */
export function getRelatedProducts(
  currentAsin: string,
  category:    string,
  count        = 6,
): Product[] {
  try {
    const categoryProducts = getPublicCategoryProducts(category)
    const recommendations  = readRecommendations()
    const lifecycle        = readLifecycleStore()
    const intelligence     = readProductIntelligence()

    const entries: RelatedProductEntry[] = categoryProducts
      .filter(p => p.asin && p.asin !== currentAsin)
      .map(p => {
        const asin = p.asin!
        const rec  = recommendations.products[asin]
        const lc   = lifecycle.products[asin]
        const int  = intelligence.products[asin]
        return {
          product:             p,
          recommendationScore: rec?.recommendationScore ?? 0,
          qualityScore:        rec?.qualityScore ?? lc?.qualityScore ?? 0,
          trend:               rec?.trend        ?? int?.trend       ?? 'stable',
        }
      })

    const ranked = rankRelatedProducts(entries)
    return extractRelatedProducts(ranked, count)
  } catch {
    return []
  }
}
