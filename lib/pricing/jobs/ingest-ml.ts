/**
 * GOODPRICE Pricing — MercadoLibre Single-Product Ingestion
 *
 * Orchestrates fetching a product's current ML price and persisting it.
 * This is the core "ingest one product" unit — called by the price-check job.
 *
 * Flow for a mapped product (has mlItemId):
 *   1. Fetch full ML item via /items/{mlItemId}
 *   2. Normalize: MLItemResponse → NormalizedRetailerProduct
 *   3. Check deduplication (skip if price unchanged in last 4h)
 *   4. Build PriceSnapshot and RetailerOffer
 *   5. Persist snapshot (append) and offer (upsert)
 *   6. Return IngestionReport
 *
 * Flow for an unmapped product (mlItemId = null):
 *   1. Search ML using the product's searchQuery
 *   2. Rank + filter results with findBestMatch()
 *   3. If confident match found: set mlItemId, then run mapped flow
 *   4. If no confident match: return report with matchCandidates for review
 *
 * Rate limiting: acquires a token before each ML API call.
 *
 * This module is server-side only — never import in client components.
 */

import type { PriceSnapshot, RetailerOffer, NormalizedRetailerProduct } from '../types'
import type { ProductMapping } from '../ml/types'
import { getItem, searchProducts, getCOPtoUSDRate, MLNotFoundError } from '../ml/client'
import { normalizeMLItem } from '../ml/normalizer'
import { findBestMatch, filterActiveResults } from '../ml/search'
import { checkDuplicate } from '../normalizers/product'
import { getPricingStore } from '../store'
import { getRateLimiter } from './rate-limiter'
import { generateSnapshotId } from '../utils/comparison'

// ── Report types ──────────────────────────────────────────────────────────────

export type IngestionStatus =
  | 'success'          // new snapshot recorded
  | 'duplicate'        // price unchanged — snapshot skipped
  | 'not_found'        // ML item ID returned 404
  | 'no_match'         // search returned no confident match
  | 'search_needed'    // product has no mapping yet — search triggered
  | 'match_found'      // search found a new match — now ingested
  | 'error'            // unexpected error

export interface IngestionReport {
  productId:     string
  status:        IngestionStatus
  mlItemId:      string | null
  priceUSD?:     number
  priceCOP?:     number
  availability?: string
  isNewLow?:     boolean
  snapshotId?:   string
  matchScore?:   number
  error?:        string
  durationMs:    number
}

// ── Ingestion helpers ─────────────────────────────────────────────────────────

/**
 * Build a RetailerOffer from a normalized ML product.
 * Includes the canonical product ID and affiliate URL (if available).
 */
function buildOffer(
  productId: string,
  normalized: NormalizedRetailerProduct,
  snapshot: PriceSnapshot,
): RetailerOffer {
  const productUrl = normalized.url
  // Affiliate URL: placeholder until Awin integration is set up
  const affiliateUrl = productUrl

  return {
    productId,
    retailerId:               'mercadolibre',
    externalId:               normalized.externalId,
    url:                      productUrl,
    affiliateUrl,
    price:                    normalized.price,
    currency:                 'COP',
    priceUSD:                 normalized.priceUSD,
    oldPrice:                 normalized.oldPrice,
    discountPercent:          normalized.oldPrice && normalized.oldPrice > normalized.price
      ? Math.round(((normalized.oldPrice - normalized.price) / normalized.oldPrice) * 100)
      : undefined,
    availability:             normalized.availability,
    shipsToColombiaConfirmed: true,
    shippingCostEstimateUSD:  0, // free shipping common on ML
    totalLandedCostUSD:       normalized.priceUSD, // no import cost for local
    lastCheckedAt:            snapshot.recordedAt,
    source:                   'retailer_api',
    isVerified:               true,
    validUntil:               new Date(Date.now() + 4 * 60 * 60 * 1_000).toISOString(),
  }
}

// ── Core ingestion: mapped product (has mlItemId) ─────────────────────────────

async function ingestMappedProduct(
  mapping: ProductMapping,
  copPerUSD: number,
): Promise<IngestionReport> {
  const start = Date.now()
  const mlItemId = mapping.mlItemId!

  const store   = getPricingStore()
  const limiter = getRateLimiter('mercadolibre')

  try {
    // Rate-limited fetch
    await limiter.acquire()
    const mlItem = await getItem(mlItemId)

    // Normalize
    const normalized = normalizeMLItem(mlItem, copPerUSD)

    // Deduplication check
    const existingOffer = await store.getOffer(mapping.productId, 'mercadolibre')
    const dedupe = checkDuplicate(normalized, existingOffer)

    if (dedupe.duplicate) {
      return {
        productId:    mapping.productId,
        status:       'duplicate',
        mlItemId,
        priceUSD:     normalized.priceUSD,
        priceCOP:     normalized.price,
        availability: normalized.availability,
        durationMs:   Date.now() - start,
      }
    }

    // Determine if this is a new all-time low
    const latestSnap = await store.getLatestSnapshot(mapping.productId, 'mercadolibre')
    const isNewLow   = latestSnap === null || normalized.priceUSD < latestSnap.priceUSD

    // Create snapshot
    const recordedAt  = new Date().toISOString()
    const snapshotId  = generateSnapshotId('mercadolibre', normalized.externalId, recordedAt)
    const snapshot: PriceSnapshot = {
      id:               snapshotId,
      productId:        mapping.productId,
      retailerId:       'mercadolibre',
      price:            normalized.price,
      currency:         'COP',
      priceUSD:         normalized.priceUSD,
      exchangeRateUsed: copPerUSD,
      availability:     normalized.availability,
      recordedAt,
      source:           'retailer_api',
      wasAllTimeLow:    isNewLow,
      metadata: {
        mlItemId,
        normalizedAt:  normalized.normalizedAt,
        warningCount:  normalized.warnings.length,
      },
    }

    // Build offer
    const offer = buildOffer(mapping.productId, normalized, snapshot)

    // Persist
    await Promise.all([
      store.saveSnapshot(snapshot),
      store.saveOffer(offer),
    ])

    // Update mapping with last-checked timestamp
    await store.saveMapping({
      ...mapping,
      lastCheckedAt: recordedAt,
    })

    return {
      productId:    mapping.productId,
      status:       'success',
      mlItemId,
      priceUSD:     normalized.priceUSD,
      priceCOP:     normalized.price,
      availability: normalized.availability,
      isNewLow,
      snapshotId,
      durationMs:   Date.now() - start,
    }
  } catch (err) {
    if (err instanceof MLNotFoundError) {
      return {
        productId:  mapping.productId,
        status:     'not_found',
        mlItemId,
        error:      `ML item ${mlItemId} returned 404 — mapping may be stale`,
        durationMs: Date.now() - start,
      }
    }

    return {
      productId:  mapping.productId,
      status:     'error',
      mlItemId,
      error:      err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

// ── Core ingestion: unmapped product (needs search) ──────────────────────────

async function searchAndIngest(
  mapping: ProductMapping,
  expectedUSD: number,
  copPerUSD: number,
): Promise<IngestionReport> {
  const start   = Date.now()
  const store   = getPricingStore()
  const limiter = getRateLimiter('mercadolibre')

  try {
    // Search ML for this product
    await limiter.acquire()
    const searchResponse = await searchProducts(mapping.searchQuery, 20, 'new')

    // Update mapping with last searched timestamp
    const now = new Date().toISOString()
    await store.saveMapping({ ...mapping, lastSearchedAt: now })

    const active = filterActiveResults(searchResponse.results)
    const match  = findBestMatch(active, mapping.searchQuery, expectedUSD, copPerUSD)

    if (!match || !match.isConfident) {
      return {
        productId:  mapping.productId,
        status:     'no_match',
        mlItemId:   null,
        matchScore: match?.score,
        error:      match
          ? `Best match score ${match.score} < threshold (needs manual review)`
          : 'No results returned for search query',
        durationMs: Date.now() - start,
      }
    }

    // Save the found mapping
    const updatedMapping: ProductMapping = {
      ...mapping,
      mlItemId:      match.item.id,
      mlItemTitle:   match.item.title,
      verified:      false, // needs manual confirmation
      lastSearchedAt: now,
    }
    await store.saveMapping(updatedMapping)

    // Now ingest using the newly found item ID
    const ingestResult = await ingestMappedProduct(updatedMapping, copPerUSD)

    return {
      ...ingestResult,
      status:     ingestResult.status === 'success' ? 'match_found' : ingestResult.status,
      matchScore: match.score,
    }
  } catch (err) {
    return {
      productId:  mapping.productId,
      status:     'error',
      mlItemId:   null,
      error:      err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Ingest current ML price data for a single catalog product.
 *
 * Handles both mapped (has mlItemId) and unmapped (needs search) products.
 *
 * @param mapping     - Product→ML mapping record
 * @param expectedUSD - Catalog Amazon price in USD (used for price sanity scoring)
 * @returns IngestionReport describing what happened
 */
export async function ingestMLProduct(
  mapping: ProductMapping,
  expectedUSD: number,
): Promise<IngestionReport> {
  // Get current exchange rate (cached)
  const copPerUSD = await getCOPtoUSDRate()

  if (mapping.mlItemId) {
    return ingestMappedProduct(mapping, copPerUSD)
  } else {
    return searchAndIngest(mapping, expectedUSD, copPerUSD)
  }
}
