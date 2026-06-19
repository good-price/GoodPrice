/**
 * lib/catalog/admission/admission.ts
 *
 * Catalog Admission Pipeline — Sprint 3G.
 *
 * admitCatalogCandidates():
 *   Takes a pre-validated list of CatalogCandidates and writes them into
 *   the runtime catalog as RuntimeProducts via addRuntimeProduct().
 *
 * Guarantees:
 *   - Never admits more products than context.deficit
 *   - Never admits ASIN duplicates (addRuntimeProduct is idempotent; we also
 *     pre-check to skip and count duplicates separately)
 *   - Never produces ID collisions (ID generated from current catalog + batch)
 *   - Never admits products with invalid category slugs
 *   - All writes atomic (via addRuntimeProduct → renameSync pattern)
 *   - Never throws
 *
 * onProgress callback: called after each successful admission with the running
 *   count and the ASIN just admitted. Used by runner.ts to update the
 *   CatalogExecutionState continuously during the admitting stage.
 *
 * SERVER-ONLY.
 */

import { getRuntimeProducts }    from '@/lib/catalog/runtime/reader'
import { addRuntimeProduct }     from '@/lib/catalog/runtime/writer'
import { isValidAsin, VALID_CATEGORIES } from '@/lib/catalog/runtime/validation'
import type { CatalogCandidate } from '@/lib/catalog/discovery/types'
import { updateProductLifecycle } from '@/lib/catalog/lifecycle/state'
import { updatePriceHistory }     from '@/lib/catalog/pricing-memory/state'

import { buildRuntimeProduct }   from './builder'
import type { AdmissionContext, AdmissionResult } from './types'
import type { RuntimeProduct }   from '@/lib/catalog/runtime/types'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Admits validated CatalogCandidates into the runtime catalog.
 *
 * Stops as soon as `admitted === context.deficit` — never over-fills.
 *
 * @param candidates   Pre-validated, pre-ranked candidates.
 * @param context      Fill context (category, deficit, pipelineId, …).
 * @param onProgress   Optional callback fired after each admitted product.
 */
export function admitCatalogCandidates(
  candidates:  CatalogCandidate[],
  context:     AdmissionContext,
  onProgress?: (admitted: number, asin: string) => void,
): AdmissionResult {
  const result: AdmissionResult = {
    admitted:   0,
    skipped:    0,
    duplicates: 0,
    products:   [],
  }

  try {
    // Snapshot the catalog once; we'll extend it in-memory as we admit products
    // to generate correct sequential IDs without re-reading from disk each time.
    const existingProducts: RuntimeProduct[] = getRuntimeProducts()
    const existingAsins = new Set(existingProducts.map(p => p.asin))
    const existingIds   = new Set(existingProducts.map(p => p.id))

    // Accumulate admitted products for in-batch ID generation
    const batchProducts: RuntimeProduct[] = []

    for (const candidate of candidates) {
      // Hard limit — never exceed deficit
      if (result.admitted >= context.deficit) break

      // Guard: ASIN format
      if (!isValidAsin(candidate.asin)) {
        result.skipped++
        continue
      }

      // Guard: category valid
      if (!VALID_CATEGORIES.has(candidate.category)) {
        result.skipped++
        continue
      }

      // Guard: ASIN duplicate (already in catalog or already admitted this batch)
      if (existingAsins.has(candidate.asin)) {
        result.duplicates++
        continue
      }

      // Build the RuntimeProduct — pass existing + batch so ID is unique
      const product = buildRuntimeProduct(
        candidate,
        context,
        [...existingProducts, ...batchProducts],
      )

      // Guard: ID uniqueness (shouldn't collide, but be safe)
      if (existingIds.has(product.id)) {
        result.skipped++
        continue
      }

      // Admit — addRuntimeProduct is idempotent by ASIN
      addRuntimeProduct(product, 'auto-fill')

      // Sprint 4D: seed lifecycle record for this newly-admitted product
      updateProductLifecycle(product.asin, {
        category:        product.category,
        firstSeenAt:     product.admittedAt,
        lastSeenAt:      product.admittedAt,
        lastValidatedAt: product.lastValidated ?? null,
        confidenceScore: candidate.confidenceScore ?? (candidate.validationScore ?? 50),
        qualityScore:    candidate.qualityScore    ?? (candidate.validationScore ?? 50),
        validationCount: 1,
        failureCount:    0,
      })

      // Sprint 4E: record initial price observation
      if (candidate.price != null && candidate.price > 0) {
        updatePriceHistory(product.asin, candidate.price, product.admittedAt)
      }

      // Track to prevent double-admission within batch
      existingAsins.add(candidate.asin)
      existingIds.add(product.id)
      batchProducts.push(product)

      result.admitted++
      result.products.push(product)

      onProgress?.(result.admitted, candidate.asin)
    }
  } catch {
    // Intentionally swallowed — return partial result
  }

  return result
}
