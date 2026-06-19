/**
 * lib/catalog/discovery/amazon/validator.ts
 *
 * Validates ParsedProduct[] before adding to the candidate store. Sprint 4A.
 *
 * Hard rules (any failure = rejected):
 *   - ASIN matches /^[A-Z0-9]{10}$/
 *   - Title present (non-empty)
 *   - Image present (non-null, non-empty)
 *   - reviews >= 5
 *   - rating >= 3.0
 *
 * Deduplication:
 *   - Removes products already active in the runtime catalog
 *   - Removes duplicates within the batch (by ASIN)
 *
 * Never throws.
 * SERVER-ONLY.
 */

import { getRuntimeProducts } from '@/lib/catalog/runtime/reader'
import type { ParsedProduct, AmazonValidationResult } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const ASIN_RE      = /^[A-Z0-9]{10}$/
const MIN_REVIEWS  = 5
const MIN_RATING   = 3.0

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates and deduplicates a list of ParsedProducts.
 *
 * Products already active in the runtime catalog are removed (they don't
 * need to be in the candidate pool — they're already admitted).
 *
 * Returns the passing candidates, rejection count, and any runtime errors.
 * Never throws.
 */
export function validateDiscoveryCandidates(
  candidates: ParsedProduct[],
): AmazonValidationResult {
  try {
    const activeAsins  = new Set(getRuntimeProducts().map(p => p.asin))
    const seen         = new Set<string>()
    const passing:     ParsedProduct[] = []
    const rejectedAsins: string[] = []
    let   rejected     = 0
    const errors:      string[] = []

    for (const c of candidates) {
      // Hard: valid ASIN format (untraceable if invalid — skip without flagging)
      if (!ASIN_RE.test(c.asin)) { rejected++; continue }

      // Hard: deduplicate within batch
      if (seen.has(c.asin)) { rejected++; rejectedAsins.push(c.asin); continue }

      // Hard: skip already active in catalog (not a quality reject — don't flag)
      if (activeAsins.has(c.asin)) { rejected++; continue }

      // Hard: title required
      if (!c.title || c.title.trim().length === 0) { rejected++; rejectedAsins.push(c.asin); continue }

      // Hard: image required
      if (!c.image || c.image.trim().length === 0) { rejected++; rejectedAsins.push(c.asin); continue }

      // Hard: minimum reviews
      if (c.reviews < MIN_REVIEWS) { rejected++; rejectedAsins.push(c.asin); continue }

      // Hard: minimum rating
      if (c.rating < MIN_RATING) { rejected++; rejectedAsins.push(c.asin); continue }

      seen.add(c.asin)
      passing.push(c)
    }

    return { candidates: passing, rejected, rejectedAsins, errors }

  } catch (err) {
    return {
      candidates:    [],
      rejected:      candidates.length,
      rejectedAsins: [],
      errors:        [err instanceof Error ? err.message : String(err)],
    }
  }
}
