/**
 * lib/catalog/product-intelligence/types.ts
 *
 * Aggregated product intelligence profile — Sprint 5A.
 *
 * Combines recommendation scores, pricing trends, lifecycle health,
 * and active alerts into a single read-only view per product.
 *
 * Built at request time from existing stores — no persistence.
 * SERVER-ONLY.
 */

import type { ProductAlert } from '@/lib/catalog/alerts/types'

export type BadgeType =
  | 'top-opportunity'
  | 'price-drop'
  | 'high-confidence'
  | 'best-value'
  | 'recommended'
  | 'critical'

export interface ProductBadge {
  type:  BadgeType
  label: string
}

export interface ProductIntelligence {
  asin: string

  /** 0–100 — from recommendations store */
  recommendationScore: number
  /** 0–100 — from pricing-memory intelligence */
  opportunityScore:    number
  /** 0–100 — from lifecycle store */
  confidenceScore:     number
  /** 0–100 — from lifecycle store */
  qualityScore:        number

  /** From pricing-memory intelligence */
  trend: 'rising' | 'falling' | 'stable'

  /** From lifecycle store */
  lifecycle: 'healthy' | 'aging' | 'stale' | 'critical'

  /** Count of currently unresolved alerts */
  activeAlerts: number

  /** Up to 4 badges, sorted by priority */
  badges: ProductBadge[]

  /** Human-readable signals from the recommendation engine */
  recommendationReasons: string[]

  /** Active (unresolved) alerts for this product */
  alerts: ProductAlert[]
}

/** Null-safe empty default — returned when no data is available for an ASIN. */
export function emptyIntelligence(asin: string): ProductIntelligence {
  return {
    asin,
    recommendationScore: 0,
    opportunityScore:    0,
    confidenceScore:     0,
    qualityScore:        0,
    trend:               'stable',
    lifecycle:           'stale',
    activeAlerts:        0,
    badges:              [],
    recommendationReasons: [],
    alerts:              [],
  }
}
