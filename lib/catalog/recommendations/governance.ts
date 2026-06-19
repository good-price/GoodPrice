/**
 * lib/catalog/recommendations/governance.ts
 *
 * Aggregates recommendation store into a governance summary — Sprint 4F.
 *
 * Tiers:
 *   excellent: recommendationScore >= 75
 *   good:      50–74
 *   average:   25–49
 *   weak:      < 25
 *
 * SERVER-ONLY.
 */

import { readRecommendations } from './state'
import type { RecommendationGovernance } from './types'

export function getRecommendationGovernance(): RecommendationGovernance {
  const store    = readRecommendations()
  const products = Object.values(store.products)
  const total    = products.length

  if (total === 0) {
    return { totalRecommendations: 0, excellent: 0, good: 0, average: 0, weak: 0, averageScore: 0 }
  }

  let excellent = 0, good = 0, average = 0, weak = 0
  let sumScore  = 0

  for (const p of products) {
    const s = p.recommendationScore
    if      (s >= 75) excellent++
    else if (s >= 50) good++
    else if (s >= 25) average++
    else              weak++
    sumScore += s
  }

  return {
    totalRecommendations: total,
    excellent,
    good,
    average,
    weak,
    averageScore: Math.round(sumScore / total),
  }
}
