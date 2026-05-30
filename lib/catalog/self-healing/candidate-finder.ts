/**
 * lib/catalog/self-healing/candidate-finder.ts
 *
 * Finds similar catalog products as replacement candidates for failed/suppressed
 * products. Uses Jaccard title similarity + category match + price proximity.
 *
 * SERVER-ONLY.
 */

import { jaccardSimilarity } from '@/lib/catalog/live-truth'
import type { Product } from '@/types'
import type { ReplacementCandidate } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

/** Minimum Jaccard similarity to be considered a candidate. */
const MIN_SIMILARITY = 0.15
/** Maximum price delta % to be considered a candidate (0.40 = within ±40%). */
const MAX_PRICE_DELTA_PCT = 0.40
/** Maximum number of candidates to return per product. */
const MAX_CANDIDATES = 3

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find replacement candidates for a failed product from the active public catalog.
 *
 * @param failedProduct  The suppressed / failed product to replace.
 * @param publicProducts The current public catalog (must NOT include the failed product).
 * @returns Up to MAX_CANDIDATES candidates, sorted by similarity desc.
 */
export function findReplacementCandidates(
  failedProduct: { id: string; asin: string; title: string; price: number; category: string },
  publicProducts: Product[],
): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = []

  for (const p of publicProducts) {
    if (!p.id || !p.asin) continue
    if (p.id   === failedProduct.id)   continue  // skip self
    if (p.asin === failedProduct.asin) continue

    // Must be same category
    if (p.category !== failedProduct.category) continue

    // Price proximity check
    const priceDelta = failedProduct.price > 0
      ? Math.abs(p.price - failedProduct.price) / failedProduct.price
      : 0
    if (priceDelta > MAX_PRICE_DELTA_PCT) continue

    // Title similarity
    const similarity = jaccardSimilarity(failedProduct.title, p.title)
    if (similarity < MIN_SIMILARITY) continue

    candidates.push({
      productId:     p.id,
      asin:          p.asin,
      title:         p.title,
      price:         p.price,
      category:      p.category,
      similarity:    Math.round(similarity * 100) / 100,
      priceDeltaPct: Math.round(priceDelta * 100),
    })
  }

  // Sort: highest similarity first, then lowest price delta
  candidates.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity
    return a.priceDeltaPct - b.priceDeltaPct
  })

  return candidates.slice(0, MAX_CANDIDATES)
}
