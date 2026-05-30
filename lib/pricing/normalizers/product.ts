/**
 * GOODPRICE Pricing — Product Normalizer
 *
 * Converts raw retailer data into a clean NormalizedRetailerProduct,
 * then validates it, deduplicates it against existing offers, and
 * prepares it for storage as a PriceSnapshot.
 *
 * Pipeline stages (all pure functions — no I/O):
 *
 *   Stage 1 — Parse
 *     RawRetailerData → partial fields (delegated to provider.normalizeProduct)
 *
 *   Stage 2 — Enrich
 *     Compute priceUSD, fill defaults, generate affiliate URL
 *
 *   Stage 3 — Validate
 *     Run provider.validateProduct + cross-field consistency checks
 *
 *   Stage 4 — Deduplicate
 *     Compare against existing offers: skip if price unchanged in last N minutes
 *
 *   Stage 5 — Snapshot
 *     Wrap the validated product in a PriceSnapshot for storage
 *
 * Each stage returns a typed result so callers can short-circuit on failure.
 * Stages 1 and 3 require a provider instance; Stages 2/4/5 are provider-agnostic.
 *
 * Note: This module defines the pipeline structure and pure transformation
 * functions. Actual orchestration (calling stages in sequence, persisting results)
 * is the responsibility of the ingestion service (future Phase N+2).
 */

import type {
  RawRetailerData,
  NormalizedRetailerProduct,
  RetailerOffer,
  PriceSnapshot,
  ValidationResult,
  Currency,
} from '../types'
import type { RetailerProvider } from '../providers/types'
import { toUSD, getReferenceRate } from './price'
import { generateSnapshotId } from '../utils/comparison'

// ── Pipeline result types ─────────────────────────────────────────────────────

/** Result of the normalize + validate pipeline */
export type NormalizeResult =
  | { ok: true;  product: NormalizedRetailerProduct }
  | { ok: false; stage: string; reason: string; warnings: string[] }

/** Result of the deduplication check */
export type DedupeResult =
  | { duplicate: true;  reason: string }
  | { duplicate: false }

/** Result of the full ingestion pipeline */
export type IngestionResult =
  | { success: true;  snapshot: PriceSnapshot; isNewLow: boolean }
  | { success: false; stage: string; reason: string }

// ── Stage 2: Enrichment ───────────────────────────────────────────────────────

/**
 * Enrich a partially-normalized product with computed fields.
 *
 * Adds:
 *   - priceUSD (converted from native currency)
 *   - exchangeRate (rate used for conversion)
 *   - normalizedAt (current timestamp)
 *   - discountPercent (if oldPrice present)
 *
 * @param partial - Output from provider.normalizeProduct (may be sparse)
 * @returns Fully populated NormalizedRetailerProduct
 */
export function enrichNormalizedProduct(
  partial: Omit<NormalizedRetailerProduct, 'priceUSD' | 'exchangeRate' | 'normalizedAt'> & {
    priceUSD?: number
    exchangeRate?: number
    normalizedAt?: string
  },
): NormalizedRetailerProduct {
  const rateSnapshot = getReferenceRate(partial.currency as Currency)
  const exchangeRate = partial.exchangeRate ?? rateSnapshot.rate
  const priceUSD = partial.priceUSD ?? toUSD(partial.price, partial.currency as Currency, exchangeRate)

  return {
    ...partial,
    currency: partial.currency as Currency,
    priceUSD,
    exchangeRate,
    normalizedAt: partial.normalizedAt ?? new Date().toISOString(),
    warnings: partial.warnings ?? [],
  }
}

// ── Stage 3: Validation ───────────────────────────────────────────────────────

/**
 * Cross-field consistency checks that apply to ALL providers.
 * Provider-specific validation runs via provider.validateProduct().
 * This function adds universal rules on top.
 *
 * Universal rules:
 *   - priceUSD must be positive and finite
 *   - If oldPrice exists, it must be >= price (otherwise it's not a real discount)
 *   - retailerId must be non-empty
 *   - externalId must be non-empty
 *   - normalizedAt must be a valid ISO date
 */
export function validateNormalizedProduct(
  product: NormalizedRetailerProduct,
): ValidationResult {
  const errors: string[]   = []
  const warnings: string[] = [...product.warnings]

  if (!isFinite(product.priceUSD) || product.priceUSD <= 0) {
    errors.push(`priceUSD must be positive; got ${product.priceUSD}`)
  }

  if (product.oldPrice !== undefined) {
    if (product.oldPrice <= product.price) {
      warnings.push(
        `oldPrice (${product.oldPrice}) is not higher than price (${product.price}) — ` +
        `discount may be fabricated; treating as no discount`,
      )
    }
  }

  if (!product.retailerId) {
    errors.push('retailerId is required')
  }

  if (!product.externalId) {
    errors.push('externalId is required')
  }

  try {
    new Date(product.normalizedAt)
  } catch {
    errors.push(`normalizedAt is not a valid ISO date: "${product.normalizedAt}"`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

// ── Stage 4: Deduplication ────────────────────────────────────────────────────

/**
 * Deduplication configuration.
 * A new snapshot is skipped if price + availability haven't changed
 * AND the last check was recent enough.
 *
 * @deferred Phase N+2: tune these values based on actual data variance observed
 */
export const DEDUPE_CONFIG = {
  /**
   * If the price difference is smaller than this fraction of the old price,
   * treat it as unchanged (handles floating-point noise).
   * 0.001 = prices must differ by > 0.1% to count as a new snapshot.
   */
  minPriceChangeFraction: 0.001,

  /**
   * If the last check was within this window and nothing changed,
   * skip recording a new snapshot to avoid redundant data.
   * 4 hours in milliseconds.
   */
  skipIfUnchangedWithinMs: 4 * 60 * 60 * 1_000,
} as const

/**
 * Check whether a new snapshot would be a duplicate of an existing offer.
 *
 * A snapshot is a duplicate if:
 *   - Price hasn't changed meaningfully (within minPriceChangeFraction)
 *   - Availability hasn't changed
 *   - Last check was within the deduplication window
 *
 * @param incoming    - New normalized product data
 * @param existing    - Current offer from the database (if any)
 * @returns DedupeResult indicating whether to skip recording
 */
export function checkDuplicate(
  incoming: NormalizedRetailerProduct,
  existing: RetailerOffer | null,
): DedupeResult {
  if (!existing) return { duplicate: false }

  const lastChecked = new Date(existing.lastCheckedAt).getTime()
  const now = Date.now()
  const ageMs = now - lastChecked

  if (ageMs > DEDUPE_CONFIG.skipIfUnchangedWithinMs) {
    // Too old — always record a fresh snapshot
    return { duplicate: false }
  }

  const priceChanged =
    Math.abs(incoming.priceUSD - existing.priceUSD) / existing.priceUSD >
    DEDUPE_CONFIG.minPriceChangeFraction

  const availabilityChanged =
    incoming.availability !== existing.availability

  if (priceChanged || availabilityChanged) return { duplicate: false }

  return {
    duplicate: true,
    reason: `Price ($${existing.priceUSD}) and availability (${existing.availability}) ` +
            `unchanged within the last ${Math.round(ageMs / 60_000)} minutes`,
  }
}

// ── Stage 5: Snapshot creation ────────────────────────────────────────────────

/**
 * Wrap a validated NormalizedRetailerProduct into an immutable PriceSnapshot.
 *
 * @param product       - Validated, enriched normalized product
 * @param isNewLow      - Whether this price is the new all-time low
 * @returns PriceSnapshot ready for persistence
 */
export function createSnapshot(
  product: NormalizedRetailerProduct,
  isNewLow = false,
): PriceSnapshot {
  const recordedAt = new Date().toISOString()

  return {
    id: generateSnapshotId(product.retailerId, product.externalId, recordedAt),
    productId: product.externalId, // Phase N+2: map to internal catalogId
    retailerId: product.retailerId,
    price: product.price,
    currency: product.currency,
    priceUSD: product.priceUSD,
    exchangeRateUsed: product.exchangeRate,
    availability: product.availability,
    recordedAt,
    source: 'manual', // Phase N+2: set dynamically from fetch context
    wasAllTimeLow: isNewLow,
    metadata: {
      normalizedAt: product.normalizedAt,
      warningCount: product.warnings.length,
    },
  }
}

// ── Full pipeline (pure orchestration) ───────────────────────────────────────

/**
 * Run the complete normalization pipeline for a raw data payload.
 *
 * This function is the single entry point for the ingestion pipeline.
 * It is intentionally pure (no I/O) — callers are responsible for:
 *   - Providing the raw data
 *   - Providing the existing offer (for deduplication)
 *   - Persisting the resulting snapshot
 *
 * @param raw      - Raw data from a fetcher
 * @param provider - Provider for this retailer
 * @param existing - Current offer in the database (null if new product)
 * @returns IngestionResult — either a new snapshot or a failure/skip reason
 *
 * @deferred Phase N+2: this will be called by the ingestion worker
 */
export function runNormalizationPipeline(
  raw: RawRetailerData,
  provider: RetailerProvider,
  existing: RetailerOffer | null,
): IngestionResult {
  // Stage 1: Parse (provider-specific)
  const partial = provider.normalizeProduct(raw)
  if (!partial) {
    return { success: false, stage: 'parse', reason: 'Provider returned null (no data to parse)' }
  }

  // Stage 2: Enrich
  const product = enrichNormalizedProduct(partial)

  // Stage 3: Validate (universal + provider-specific)
  const universalValidation = validateNormalizedProduct(product)
  const providerValidation  = provider.validateProduct(product)

  const allErrors = [...universalValidation.errors, ...providerValidation.errors]
  if (allErrors.length > 0) {
    return {
      success: false,
      stage: 'validate',
      reason: allErrors.join('; '),
    }
  }

  // Stage 4: Deduplicate
  const dedupe = checkDuplicate(product, existing)
  if (dedupe.duplicate) {
    return { success: false, stage: 'dedupe', reason: dedupe.reason }
  }

  // Stage 5: Snapshot
  const isNewLow =
    existing !== null ? product.priceUSD < existing.priceUSD : true

  const snapshot = createSnapshot(product, isNewLow)

  return { success: true, snapshot, isNewLow }
}
