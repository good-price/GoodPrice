/**
 * lib/catalog/lifecycle/replacements.ts
 *
 * Replacement Candidate Finder — Sprint 4D.
 *
 * Identifies discovery candidates that could replace products marked as
 * needsReplacement for a given category.
 *
 * Criteria:
 *   - Same category as the target
 *   - qualityScore >= 60 (from Sprint 4C intelligence)
 *   - confidenceScore >= 60 (from Sprint 4C intelligence)
 *   - Not already in the runtime catalog
 *
 * Note on shipsToColombiaConfirmed:
 *   DiscoveryCandidate does not carry the Colombia flag — that check runs at
 *   admission time via validateCatalogCandidates(). Candidates already in the
 *   store originate from Amazon best-sellers pages, which typically ship
 *   internationally. The admission pipeline enforces the hard Colombia check.
 *
 * Sorted: qualityScore desc → confidenceScore desc → rating desc.
 * Returns top 10.
 *
 * SERVER-ONLY.
 */

import { loadCandidates }  from '@/lib/catalog/discovery/candidate-store'
import { getRuntimeProducts } from '@/lib/catalog/runtime/reader'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReplacementCandidate {
  asin:            string
  category:        string
  title:           string | null
  qualityScore:    number
  confidenceScore: number
  rating:          number | null
  reviews:         number | null
  timesAdmitted:   number
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns top-10 replacement candidates for the given category.
 * Never throws.
 */
export function findReplacementCandidates(category: string): ReplacementCandidate[] {
  try {
    const store        = loadCandidates()
    const runtimeAsins = new Set(getRuntimeProducts().map(p => p.asin))

    return store.items
      .filter(c =>
        c.category === category &&
        (c.qualityScore    ?? 0) >= 60 &&
        (c.confidenceScore ?? 0) >= 60 &&
        !runtimeAsins.has(c.asin)
      )
      .map(c => ({
        asin:            c.asin,
        category:        c.category,
        title:           c.tileTitle,
        qualityScore:    c.qualityScore    ?? 0,
        confidenceScore: c.confidenceScore ?? 0,
        rating:          c.rating,
        reviews:         c.reviewCount,
        timesAdmitted:   c.timesAdmitted   ?? 0,
      }))
      .sort((a, b) =>
        b.qualityScore     !== a.qualityScore     ? b.qualityScore    - a.qualityScore    :
        b.confidenceScore  !== a.confidenceScore  ? b.confidenceScore - a.confidenceScore :
        (b.rating ?? 0) - (a.rating ?? 0)
      )
      .slice(0, 10)
  } catch {
    return []
  }
}

/**
 * Returns replacement candidates for all categories that need replacement.
 * Returns a map: category → top-10 candidates.
 * Never throws.
 */
export function findAllReplacementCandidates(
  categories: string[],
): Record<string, ReplacementCandidate[]> {
  const result: Record<string, ReplacementCandidate[]> = {}
  for (const cat of categories) {
    result[cat] = findReplacementCandidates(cat)
  }
  return result
}
