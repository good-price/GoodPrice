/**
 * GOODPRICE Pricing — Normalizers Public API
 *
 * Re-exports the three normalization modules as a unified surface.
 * Import from here, not from individual normalizer files.
 *
 * Normalization pipeline (in order):
 *   1. price.ts       — parse raw price strings, convert to USD
 *   2. availability.ts — parse raw availability signals into typed status
 *   3. product.ts     — orchestrate full pipeline: parse → enrich → validate → snapshot
 */

// ── Price normalization ───────────────────────────────────────────────────────
export {
  // Exchange rates
  getReferenceRate,
  // Conversion
  toUSD,
  fromUSD,
  // Parsers
  parseUSDPrice,
  parseCOPPrice,
  parsePrice,
  // Validation
  isPriceReasonable,
  detectPriceAnomaly,
} from './price'

// ── Availability normalization ────────────────────────────────────────────────
export {
  // Parsers
  normalizeAvailabilityString,
  normalizeAvailabilityFromQuantity,
  normalizeAvailabilityFromBoolean,
  // Signal combination
  combineAvailabilitySignals,
  // Display helpers
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  isAvailableToBuy,
  isUnavailable,
} from './availability'

// ── Product normalization pipeline ────────────────────────────────────────────
export {
  // Stage functions (individual)
  enrichNormalizedProduct,
  validateNormalizedProduct,
  checkDuplicate,
  createSnapshot,
  // Full pipeline
  runNormalizationPipeline,
  // Config
  DEDUPE_CONFIG,
} from './product'

// ── Types ─────────────────────────────────────────────────────────────────────
export type { NormalizeResult, DedupeResult, IngestionResult } from './product'
