/**
 * GOODPRICE Pricing — Retailer Ranking Logic
 *
 * Scores and ranks retailers for a given product context.
 * Used to determine which retailer to recommend first in comparison tables,
 * which badge to show ("Best Deal", "Local Pickup", "Fastest Delivery"),
 * and how to weight offers in the buy signal engine.
 *
 * Ranking dimensions:
 *   1. Price (landed cost in Colombia)  — weight: 50%
 *   2. Reliability (shipping confirmed) — weight: 20%
 *   3. Speed (delivery days to CO)      — weight: 15%
 *   4. Simplicity (no import friction)  — weight: 15%
 *
 * Scores are 0–100. Highest score = recommended retailer.
 *
 * Phase N+3 enhancements:
 *   - Factor in user's past purchase history (if logged in)
 *   - Factor in real-time availability (deprioritize 'limited')
 *   - A/B test weight configurations via database config table
 */

import type { RetailerOffer, Retailer } from '../types'

// ── Scoring configuration ─────────────────────────────────────────────────────

interface RankingWeights {
  price:       number  // 0–1
  reliability: number
  speed:       number
  simplicity:  number
}

const DEFAULT_WEIGHTS: RankingWeights = {
  price:       0.50,
  reliability: 0.20,
  speed:       0.15,
  simplicity:  0.15,
}

// ── Retailer profile metadata ─────────────────────────────────────────────────

/**
 * Static profile scores for each retailer (Phase 15: manually curated).
 * Phase N+2: move these to a database config table.
 *
 * Scores are 0–100 on each dimension.
 */
const RETAILER_PROFILES: Record<string, {
  reliabilityScore: number    // shipping reliability, return policy quality
  speedScore:       number    // delivery speed to Colombia (100 = same day, 0 = 3+ weeks)
  simplicityScore:  number    // 100 = no friction (local), lower = import complexity
  badges:           string[]  // display badges this retailer can earn
}> = {
  amazon: {
    reliabilityScore: 90,  // highly reliable but international
    speedScore:       30,  // 7–21 days international
    simplicityScore:  50,  // requires international shipping setup
    badges: ['Amazon Prime', 'Envío Internacional'],
  },
  mercadolibre: {
    reliabilityScore: 75,  // good but seller quality varies
    speedScore:       85,  // 1–7 days domestic
    simplicityScore:  95,  // fully local, no import
    badges: ['Envío Gratis', 'Entrega Rápida', 'Sin Importar'],
  },
  alkosto: {
    reliabilityScore: 80,  // established chain, good returns
    speedScore:       80,  // 1–5 days domestic + physical store pickup
    simplicityScore:  100, // fully local, pick up in store
    badges: ['Retiro en Tienda', 'Garantía Colombia'],
  },
  falabella: {
    reliabilityScore: 82,
    speedScore:       78,
    simplicityScore:  100,
    badges: ['Retiro en Tienda', 'Garantía Colombia'],
  },
  exito: {
    reliabilityScore: 80,
    speedScore:       80,
    simplicityScore:  100,
    badges: ['Retiro en Tienda', 'Puntos Colombia'],
  },
}

// ── Price scoring ─────────────────────────────────────────────────────────────

/**
 * Score an offer on price relative to the other offers.
 * Cheapest landed cost = 100, most expensive = 0.
 *
 * @param offer      - The offer to score
 * @param allOffers  - All available offers for the same product
 * @returns Price score 0–100
 */
function scorePriceRelative(offer: RetailerOffer, allOffers: RetailerOffer[]): number {
  const available = allOffers.filter(o =>
    o.availability === 'in_stock' || o.availability === 'limited',
  )
  if (available.length <= 1) return 100

  const costs = available.map(o =>
    o.totalLandedCostUSD ?? o.priceUSD + (o.shippingCostEstimateUSD ?? 0),
  )
  const min = Math.min(...costs)
  const max = Math.max(...costs)
  if (max === min) return 100

  const thisCost = offer.totalLandedCostUSD
    ?? offer.priceUSD + (offer.shippingCostEstimateUSD ?? 0)

  return Math.round(((max - thisCost) / (max - min)) * 100)
}

// ── Composite scoring ─────────────────────────────────────────────────────────

export interface RetailerScore {
  retailerId:       string
  totalScore:       number  // 0–100 composite
  priceScore:       number
  reliabilityScore: number
  speedScore:       number
  simplicityScore:  number
  badges:           string[]
  isRecommended:    boolean
}

/**
 * Score all offers and return ranked list (highest score first).
 *
 * @param offers   - All current offers for a product
 * @param weights  - Optional weight overrides (defaults to DEFAULT_WEIGHTS)
 * @returns Sorted array of scored retailers (best first)
 */
export function rankRetailers(
  offers: RetailerOffer[],
  weights: Partial<RankingWeights> = {},
): RetailerScore[] {
  const w = { ...DEFAULT_WEIGHTS, ...weights }

  const available = offers.filter(o =>
    o.availability === 'in_stock' || o.availability === 'limited',
  )

  if (available.length === 0) return []

  const scores: RetailerScore[] = available.map(offer => {
    const profile = RETAILER_PROFILES[offer.retailerId]

    const priceScore       = scorePriceRelative(offer, available)
    const reliabilityScore = profile?.reliabilityScore ?? 50
    const speedScore       = profile?.speedScore       ?? 50
    const simplicityScore  = profile?.simplicityScore  ?? 50

    const totalScore = Math.round(
      priceScore       * w.price +
      reliabilityScore * w.reliability +
      speedScore       * w.speed +
      simplicityScore  * w.simplicity,
    )

    return {
      retailerId: offer.retailerId,
      totalScore,
      priceScore,
      reliabilityScore,
      speedScore,
      simplicityScore,
      badges: profile?.badges ?? [],
      isRecommended: false, // set after sorting
    }
  })

  // Sort descending by total score
  scores.sort((a, b) => b.totalScore - a.totalScore)

  // Mark the top scorer as recommended
  if (scores.length > 0) scores[0].isRecommended = true

  return scores
}

/**
 * Get the single recommended retailer for a product.
 *
 * @param offers - All current offers for a product
 * @returns The highest-scoring retailer, or null if no available offers
 */
export function getRecommendedRetailer(
  offers: RetailerOffer[],
): RetailerScore | null {
  const ranked = rankRetailers(offers)
  return ranked[0] ?? null
}

// ── Badge assignment ──────────────────────────────────────────────────────────

/**
 * Assign contextual badges to a set of ranked offers.
 * Badges communicate value propositions beyond raw price.
 *
 * @param scores - Ranked retailer scores
 * @returns Map of retailerId → active badge labels for this context
 */
export function assignContextualBadges(
  scores: RetailerScore[],
): Map<string, string[]> {
  const badgeMap = new Map<string, string[]>()

  for (const score of scores) {
    const badges: string[] = [...score.badges]

    if (score.isRecommended)    badges.unshift('Mejor opción')
    if (score.priceScore === 100) badges.push('Precio más bajo')
    if (score.speedScore >= 85) badges.push('Entrega rápida')
    if (score.simplicityScore === 100) badges.push('Sin importar')

    badgeMap.set(score.retailerId, badges)
  }

  return badgeMap
}

// ── Retailer metadata helpers ─────────────────────────────────────────────────

/**
 * Get all badge types a retailer can potentially earn.
 * Used to pre-render badge slots in the UI without waiting for comparison data.
 */
export function getRetailerBadges(retailerId: string): string[] {
  return RETAILER_PROFILES[retailerId]?.badges ?? []
}

/**
 * Check whether a retailer is local to Colombia (no import required).
 * Local retailers get a simplicity bonus in the ranking algorithm.
 */
export function isLocalRetailer(retailerId: string): boolean {
  const profile = RETAILER_PROFILES[retailerId]
  return (profile?.simplicityScore ?? 0) >= 95
}

/**
 * Estimate total delivery days to Colombia for a retailer.
 * Used for UI display ("Est. 7–21 días").
 */
export function estimatedDeliveryDays(
  retailer: Retailer,
): { min: number; max: number } {
  return retailer.shippingEstimateDays ?? { min: 1, max: 21 }
}
