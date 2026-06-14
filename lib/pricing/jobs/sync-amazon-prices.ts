/**
 * lib/pricing/jobs/sync-amazon-prices.ts
 *
 * Amazon live-price sync job for GOODPRICE Fase A.
 *
 * Reads all active catalog products, scrapes each Amazon page via
 * fetchAndParseProduct(), compares against the catalog price, and writes a
 * metadata override when the delta is ≥ DELTA_THRESHOLD_PCT.
 *
 * Detects: invalid ASIN (404), ASIN redirect, unavailable product, robot block.
 *
 * Known limitation (Fase A): on Vercel, overrides are written to /tmp and are
 * NOT visible to user-request lambdas. Fase B will migrate to Vercel KV.
 *
 * SERVER-ONLY.
 */

import { fetchAndParseProduct } from '@/lib/catalog/live-truth/amazon-parser'
import { setOverride } from '@/lib/catalog/live-truth/overrides'
import { getRawProducts } from '@/data/catalog'
import type { RawProduct } from '@/types'
import type { ExtractedProductData } from '@/lib/catalog/live-truth/types'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Write an override when the absolute price delta exceeds this percentage. */
const DELTA_THRESHOLD_PCT = 3

/**
 * If the delta is larger than this, the scraped price is probably wrong
 * (product page mismatch, currency bleed, robot page misdetected as content).
 * Skip the override rather than corrupt catalog data.
 */
const SUSPICIOUS_DELTA_PCT = 60

// ── Result types ──────────────────────────────────────────────────────────────

export type AmazonSyncStatus =
  | 'ok'           // Price within threshold — no override needed
  | 'overridden'   // Override written
  | 'unavailable'  // Product confirmed unavailable on Amazon
  | 'invalid_asin' // HTTP 404 — ASIN does not exist
  | 'redirected'   // Amazon redirected to a different ASIN
  | 'blocked'      // Amazon robot-check / CAPTCHA page
  | 'failed'       // Extraction failed (network / timeout / no price)
  | 'suspicious'   // Delta too large to trust — skipped

export interface AmazonSyncProductResult {
  productId:     string
  asin:          string
  status:        AmazonSyncStatus
  catalogPrice:  number
  livePrice?:    number
  deltaPct?:     number
  redirectedTo?: string
  reason:        string
  durationMs:    number
}

export interface AmazonPriceSyncJobResult {
  startedAt:   string
  completedAt: string
  durationMs:  number
  processed:   number
  skipped:     number
  overrides:   number
  results:     AmazonSyncProductResult[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectRedirectAsin(finalUrl: string, requestedAsin: string): string | null {
  const m = finalUrl.match(/\/dp\/([A-Z0-9]{10})/)
  return (m && m[1] !== requestedAsin) ? m[1] : null
}

function processLivePrice(
  product: RawProduct,
  extracted: ExtractedProductData,
  durationMs: number,
): { result: AmazonSyncProductResult; didOverride: boolean } {
  const { id: productId, asin, price: catalogPrice } = product

  // ASIN redirect (URL-level, 200 response with different /dp/ ASIN)
  if (extracted.finalUrl) {
    const redirectedTo = detectRedirectAsin(extracted.finalUrl, asin)
    if (redirectedTo) {
      return {
        result: {
          productId, asin, status: 'redirected', catalogPrice,
          redirectedTo,
          reason: `ASIN redirected to ${redirectedTo}`,
          durationMs,
        },
        didOverride: false,
      }
    }
  }

  // Product unavailable (in_stock / limited / out_of_stock still have prices)
  if (extracted.availabilityStatus === 'unavailable') {
    return {
      result: {
        productId, asin, status: 'unavailable', catalogPrice,
        reason: `Unavailable on Amazon (${extracted.availability ?? 'no availability text'})`,
        durationMs,
      },
      didOverride: false,
    }
  }

  // No price could be extracted
  if (!extracted.priceUSD) {
    const reason = (extracted.detectedCurrency && extracted.detectedCurrency !== '$')
      ? `Non-USD price detected (${extracted.detectedCurrency}) — rejected`
      : 'No price found on page'
    return {
      result: { productId, asin, status: 'failed', catalogPrice, reason, durationMs },
      didOverride: false,
    }
  }

  const deltaPct = ((extracted.priceUSD - catalogPrice) / catalogPrice) * 100
  const sign     = deltaPct >= 0 ? '+' : ''

  // Suspicious — skip
  if (Math.abs(deltaPct) > SUSPICIOUS_DELTA_PCT) {
    return {
      result: {
        productId, asin, status: 'suspicious', catalogPrice,
        livePrice: extracted.priceUSD, deltaPct,
        reason: `Delta ${sign}${deltaPct.toFixed(1)}% exceeds suspicious threshold (${SUSPICIOUS_DELTA_PCT}%) — skipped`,
        durationMs,
      },
      didOverride: false,
    }
  }

  // Within threshold — no action needed
  if (Math.abs(deltaPct) < DELTA_THRESHOLD_PCT) {
    return {
      result: {
        productId, asin, status: 'ok', catalogPrice,
        livePrice: extracted.priceUSD, deltaPct,
        reason: `Delta ${sign}${deltaPct.toFixed(1)}% within threshold (${DELTA_THRESHOLD_PCT}%)`,
        durationMs,
      },
      didOverride: false,
    }
  }

  // Write override
  setOverride({
    productId,
    asin,
    price:    extracted.priceUSD,
    oldPrice: extracted.oldPriceUSD ?? product.oldPrice,
    reason:   `Amazon live $${extracted.priceUSD} (catalog $${catalogPrice}, Δ ${sign}${deltaPct.toFixed(1)}%)`,
    appliedAt: new Date().toISOString(),
  })

  return {
    result: {
      productId, asin, status: 'overridden', catalogPrice,
      livePrice: extracted.priceUSD, deltaPct,
      reason: `Override written: $${extracted.priceUSD} (Δ ${sign}${deltaPct.toFixed(1)}%)`,
      durationMs,
    },
    didOverride: true,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run a full Amazon price sync across all active catalog products.
 *
 * Processing is sequential to avoid triggering Amazon rate-limiting.
 * Per-product errors are isolated — one failure doesn't stop the job.
 *
 * @param options.productIds - If provided, only sync these product IDs
 */
export async function runAmazonPriceSyncJob(options: {
  productIds?: string[]
} = {}): Promise<AmazonPriceSyncJobResult> {
  const startedAt = new Date().toISOString()
  const jobStart  = Date.now()

  let products = getRawProducts().filter(p => p.status !== 'inactive')

  if (options.productIds && options.productIds.length > 0) {
    const ids = new Set(options.productIds)
    products  = products.filter(p => ids.has(p.id))
  }

  const results: AmazonSyncProductResult[] = []
  let overrides = 0
  let skipped   = 0

  for (const product of products) {
    if (!product.asin) {
      skipped++
      continue
    }

    const t0 = Date.now()

    try {
      const extracted  = await fetchAndParseProduct(product.asin)
      const durationMs = Date.now() - t0

      let syncResult: AmazonSyncProductResult
      let didOverride = false

      if (extracted.httpStatus === 404) {
        syncResult = {
          productId:    product.id,
          asin:         product.asin,
          status:       'invalid_asin',
          catalogPrice: product.price,
          reason:       'HTTP 404 — ASIN not found on Amazon',
          durationMs,
        }
      } else if (extracted.isRobotCheck) {
        syncResult = {
          productId:    product.id,
          asin:         product.asin,
          status:       'blocked',
          catalogPrice: product.price,
          reason:       'Amazon robot-check page detected',
          durationMs,
        }
      } else if (extracted.confidence === 'failed') {
        syncResult = {
          productId:    product.id,
          asin:         product.asin,
          status:       'failed',
          catalogPrice: product.price,
          reason:       `Extraction failed (httpStatus: ${extracted.httpStatus ?? 'N/A'})`,
          durationMs,
        }
      } else {
        ;({ result: syncResult, didOverride } = processLivePrice(product, extracted, durationMs))
      }

      if (didOverride) overrides++
      results.push(syncResult)

      console.log(`[amazon-sync] ${product.id} (${product.asin}): ${syncResult.status} — ${syncResult.reason}`)
    } catch (err) {
      results.push({
        productId:    product.id,
        asin:         product.asin,
        status:       'failed',
        catalogPrice: product.price,
        reason:       `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
        durationMs:   Date.now() - t0,
      })
    }
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs:  Date.now() - jobStart,
    processed:   results.length,
    skipped,
    overrides,
    results,
  }
}
