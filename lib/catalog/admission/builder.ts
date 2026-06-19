/**
 * lib/catalog/admission/builder.ts
 *
 * Converts a CatalogCandidate into a RuntimeProduct ready for catalog admission.
 *
 * Rules:
 *   - status     = 'active'
 *   - source     = 'auto-fill'
 *   - shipsToColombiaConfirmed = true  (policy: passed-pipeline products ship to Colombia)
 *   - admittedAt = now()
 *   - addedByPipelineId / lastUpdatedByPipelineId = context.pipelineId
 *   - id = next sequential ID for the category (e.g. elec-007, game-005)
 *
 * Never invents data — all fields come from the candidate or the context.
 *
 * SERVER-ONLY.
 */

import type { RuntimeProduct } from '@/lib/catalog/runtime/types'
import type { CatalogCandidate } from '@/lib/catalog/discovery/types'
import type { AdmissionContext } from './types'

// ── Category prefix map ───────────────────────────────────────────────────────

const CATEGORY_PREFIX: Record<string, string> = {
  bebes:        'beb',
  belleza:      'bel',
  cocina:       'coci',
  deporte:      'dep',
  electronica:  'elec',
  gaming:       'game',
  herramientas: 'herr',
  hogar:        'hogar',
  mascotas:     'masc',
  oficina:      'ofic',
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Generates the next sequential product ID for a given category.
 *
 * Scans existingProducts for IDs matching the category prefix, finds the
 * highest number, and returns prefix-(max+1) zero-padded to 3 digits.
 */
function generateProductId(category: string, existingProducts: RuntimeProduct[]): string {
  const prefix = CATEGORY_PREFIX[category] ?? category.slice(0, 4).toLowerCase()
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)

  const nums = existingProducts
    .map(p => pattern.exec(p.id)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(n => parseInt(n, 10))
    .filter(n => !isNaN(n) && n > 0)

  const maxNum = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a RuntimeProduct from a validated CatalogCandidate.
 *
 * The `existingProducts` parameter is used to compute the next sequential ID
 * without reading from disk — pass the current catalog + any already-built
 * products from this admission batch.
 *
 * Never throws.
 */
export function buildRuntimeProduct(
  candidate:        CatalogCandidate,
  context:          AdmissionContext,
  existingProducts: RuntimeProduct[],
): RuntimeProduct {
  const id  = generateProductId(candidate.category, existingProducts)
  const now = new Date().toISOString()

  return {
    id,
    asin:                     candidate.asin,
    category:                 candidate.category,
    title:                    candidate.title || candidate.asin,
    amazonTitle:              candidate.title || candidate.asin,
    brand:                    candidate.brand || '',
    image:                    candidate.image ?? '',
    price:                    candidate.price,
    rating:                   candidate.rating,
    reviews:                  candidate.reviews,
    status:                   'active',
    shipsToColombiaConfirmed: true,
    source:                   'auto-fill',
    admittedAt:               now,
    lastValidated:            null,
    trustScore:               candidate.validationScore,
    validationScore:          candidate.validationScore,
    lastPriceSync:            null,
    lastImageSync:            null,
    addedByPipelineId:        context.pipelineId,
    lastUpdatedByPipelineId:  context.pipelineId,
  }
}
