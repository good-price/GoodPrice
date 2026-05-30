/**
 * lib/catalog/self-healing/replacement-engine.ts
 *
 * For each auto-suppressed product, finds catalog-internal replacement candidates.
 * Results are informational only — no auto-replacement is applied. The admin
 * decides whether to act on the suggestions.
 *
 * SERVER-ONLY.
 */

import { loadSuppressedStore } from '@/lib/catalog/live-truth'
import { findReplacementCandidates } from './candidate-finder'
import type { Product } from '@/types'
import type { ReplacementSuggestion } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

/** Maximum replacement suggestions per cycle. */
const MAX_SUGGESTIONS = 15

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate replacement suggestions for all currently-suppressed products.
 *
 * @param allCatalogProducts All raw catalog products (including suppressed ones —
 *        we need their title/category/price for matching).
 * @param publicProducts     The active public catalog (candidates must be public).
 */
export function generateReplacementSuggestions(
  allCatalogProducts: Product[],
  publicProducts: Product[],
): ReplacementSuggestion[] {
  const suppressedStore = loadSuppressedStore()
  const suggestions: ReplacementSuggestion[] = []

  // Build a lookup for all catalog products
  const catalogMap = new Map(allCatalogProducts.map(p => [p.id ?? '', p]))

  for (const [productId, entry] of Object.entries(suppressedStore.entries)) {
    if (suggestions.length >= MAX_SUGGESTIONS) break

    const original = catalogMap.get(productId)
    if (!original || !original.id || !original.asin) continue

    const failedReason = entry.reason

    const candidates = findReplacementCandidates(
      {
        id:       original.id,
        asin:     original.asin,
        title:    original.title,
        price:    original.price,
        category: original.category,
      },
      publicProducts,
    )

    if (candidates.length === 0) continue

    suggestions.push({
      failedProductId: productId,
      failedAsin:      entry.asin,
      failedTitle:     original.title,
      failedReason,
      candidates,
      generatedAt:     new Date().toISOString(),
    })
  }

  return suggestions
}
