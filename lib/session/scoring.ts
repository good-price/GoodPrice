/**
 * lib/session/scoring.ts
 *
 * Session-aware product scoring and list personalisation.
 *
 * This module combines session affinity signals with the catalog's existing
 * intelligence rank scores to produce a personalised sort order.
 *
 * Strategy:
 *   personalScore = categoryAffinityBoost + clickBoost − seenPenalty + baseRank
 *
 *   categoryAffinityBoost  — 0–0.4 bonus for products from preferred categories
 *   clickBoost             — 0.2 bonus when the user clicked this exact product before
 *   seenPenalty            — −0.5 when the product was already recommended (suppress)
 *   baseRank               — from intelligence snapshot rankMap (0–1)
 *
 * The resulting scores are only used for relative ordering within the
 * personalised section — they are not stored or sent anywhere.
 *
 * Public API:
 *   personalizeProductList(products, profile, affinityScores, rankMap?, limit?)
 *     → Product[] personalised and ordered for the current session
 */

import type { Product } from '@/types'
import type { SessionProfile, AffinityScore } from './types'
import { getSeenIds } from './recommendation-memory'

// ── Boost constants ───────────────────────────────────────────────────────────

const MAX_AFFINITY_BOOST = 0.4
const CLICK_BOOST        = 0.2
const SEEN_PENALTY       = 0.5

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Re-orders `products` by a combined personal score.
 *
 * @param products        Candidate products (pre-filtered to correct categories)
 * @param profile         Current session profile
 * @param affinityScores  Pre-computed from computeCategoryAffinity(profile)
 * @param rankMap         Intelligence rankMap (productId → 0–1); optional
 * @param limit           Maximum products to return (default: all)
 */
export function personalizeProductList(
  products:       Product[],
  profile:        SessionProfile,
  affinityScores: AffinityScore[],
  rankMap?:       Record<string, number>,
  limit?:         number,
): Product[] {
  if (products.length === 0) return []

  // Build fast lookup maps
  const categoryAffinityMap = new Map(affinityScores.map(a => [a.category, a.score]))
  const clickedSet          = new Set(profile.clickedProducts)
  const seenSet             = getSeenIds(profile)

  type Scored = { product: Product; score: number }
  const scored: Scored[] = products.map(product => {
    const id = product.id ?? ''

    // Affinity boost — scaled by the category's normalised score (0–0.4)
    const catAffinity    = categoryAffinityMap.get(product.category) ?? 0
    const affinityBoost  = catAffinity * MAX_AFFINITY_BOOST

    // Click boost — user has previously clicked through this product
    const clickBoost = clickedSet.has(id) ? CLICK_BOOST : 0

    // Seen penalty — suppress already-recommended products
    const seenPenalty = seenSet.has(id) ? SEEN_PENALTY : 0

    // Base intelligence rank (0–1, or 0 when no snapshot)
    const baseRank = rankMap?.[id] ?? 0

    const score = affinityBoost + clickBoost - seenPenalty + baseRank * 0.5

    return { product, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const sorted = scored.map(s => s.product)
  return limit ? sorted.slice(0, limit) : sorted
}
