/**
 * lib/catalog/similarity/engine.ts
 *
 * Pure related-product scoring — no I/O — Sprint 5A.
 *
 * Scoring criteria (for products in the same category, excluding current ASIN):
 *   1. recommendationScore (primary — from recommendations store)
 *   2. qualityScore        (secondary — from lifecycle store)
 *   3. pricing trend       (tiebreaker: falling > stable > rising)
 *
 * Returns sorted entries; caller slices to desired count.
 *
 * SERVER-ONLY.
 */

import type { Product } from '@/types'
import type { RelatedProductEntry } from './types'

const TREND_SCORE: Record<'falling' | 'stable' | 'rising', number> = {
  falling: 2,
  stable:  1,
  rising:  0,
}

/**
 * Ranks products by similarity to the current one.
 * `candidateEntries` must already be filtered to the right category and
 * must NOT contain the current ASIN.
 */
export function rankRelatedProducts(
  candidateEntries: RelatedProductEntry[],
): RelatedProductEntry[] {
  return [...candidateEntries].sort((a, b) => {
    // 1. recommendationScore DESC
    if (b.recommendationScore !== a.recommendationScore)
      return b.recommendationScore - a.recommendationScore

    // 2. qualityScore DESC
    if (b.qualityScore !== a.qualityScore)
      return b.qualityScore - a.qualityScore

    // 3. trend tiebreaker (falling > stable > rising)
    return TREND_SCORE[b.trend] - TREND_SCORE[a.trend]
  })
}

/** Extracts only the `Product` from a ranked list, up to `count` entries. */
export function extractRelatedProducts(
  ranked: RelatedProductEntry[],
  count:  number,
): Product[] {
  return ranked.slice(0, count).map(e => e.product)
}
