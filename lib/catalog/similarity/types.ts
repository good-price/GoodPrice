/**
 * lib/catalog/similarity/types.ts
 *
 * Types for the product similarity / related-products engine — Sprint 5A.
 *
 * SERVER-ONLY.
 */

import type { Product } from '@/types'

export interface RelatedProductEntry {
  product:             Product
  /** recommendationScore from the recommendations store, or 0 if absent. */
  recommendationScore: number
  /** qualityScore from the lifecycle store, or 0 if absent. */
  qualityScore:        number
  /** trend from pricing-memory intelligence */
  trend:               'rising' | 'falling' | 'stable'
}
