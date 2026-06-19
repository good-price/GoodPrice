/**
 * lib/catalog/pricing-memory/governance.ts
 *
 * Aggregates product intelligence into a governance summary — Sprint 4E.
 *
 * SERVER-ONLY.
 */

import { readProductIntelligence } from './state'
import type { PricingGovernance } from './types'

export function getPricingGovernance(): PricingGovernance {
  const store    = readProductIntelligence()
  const products = Object.values(store.products)

  const totalProducts = products.length

  if (totalProducts === 0) {
    return {
      totalProducts:      0,
      rising:             0,
      falling:            0,
      stable:             0,
      opportunities:      0,
      averageVolatility:  0,
      averageOpportunity: 0,
    }
  }

  let rising = 0, falling = 0, stable = 0, opportunities = 0
  let sumVolatility = 0, sumOpportunity = 0

  for (const p of products) {
    if (p.trend === 'rising')  rising++
    if (p.trend === 'falling') falling++
    if (p.trend === 'stable')  stable++
    if (p.opportunityScore >= 60) opportunities++
    sumVolatility  += p.volatilityScore
    sumOpportunity += p.opportunityScore
  }

  return {
    totalProducts,
    rising,
    falling,
    stable,
    opportunities,
    averageVolatility:  Math.round(sumVolatility  / totalProducts),
    averageOpportunity: Math.round(sumOpportunity / totalProducts),
  }
}
