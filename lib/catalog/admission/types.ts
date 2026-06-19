/**
 * lib/catalog/admission/types.ts
 *
 * Types for the Catalog Admission Engine — Sprint 3G.
 *
 * SERVER-ONLY.
 */

import type { RuntimeProduct } from '@/lib/catalog/runtime/types'

// ── Context ───────────────────────────────────────────────────────────────────

export interface AdmissionContext {
  /** OPS pipeline ID for traceability. */
  pipelineId: string
  /** Category slug being filled. */
  category:   string
  /** Operator-configured minimum for this category. */
  minimum:    number
  /** Products currently active in this category at fill start. */
  current:    number
  /** How many products need to be added (minimum − current). */
  deficit:    number
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface AdmissionResult {
  /** Products successfully written to the runtime catalog. */
  admitted:    number
  /** Candidates skipped due to invalid category or ID collision. */
  skipped:     number
  /** Candidates rejected because their ASIN already exists in the catalog. */
  duplicates:  number
  /** The RuntimeProduct objects that were admitted. */
  products:    RuntimeProduct[]
}
