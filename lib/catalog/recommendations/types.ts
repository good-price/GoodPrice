/**
 * lib/catalog/recommendations/types.ts
 *
 * Core types for the Recommendation Intelligence Engine — Sprint 4F.
 *
 * SERVER-ONLY.
 */

export interface ProductRecommendation {
  asin:     string
  category: string

  /** 0–100 composite score (opportunity + confidence + quality + trend + lifecycle). */
  recommendationScore: number

  /** From pricing-memory intelligence. 0–100. */
  opportunityScore:  number
  /** From lifecycle store. 0–100. */
  confidenceScore:   number
  /** From lifecycle store. 0–100. */
  qualityScore:      number

  /** From pricing-memory intelligence. */
  trend: 'rising' | 'falling' | 'stable'

  /** Human-readable signals that explain the score. */
  reasons: string[]

  createdAt: string
}

export interface RecommendationStore {
  updatedAt: string | null
  products:  Record<string, ProductRecommendation>
}

export interface RecommendationGovernance {
  totalRecommendations: number
  /** recommendationScore >= 75 */
  excellent:    number
  /** recommendationScore 50–74 */
  good:         number
  /** recommendationScore 25–49 */
  average:      number
  /** recommendationScore < 25 */
  weak:         number
  /** Integer — arithmetic mean of recommendationScore */
  averageScore: number
}
