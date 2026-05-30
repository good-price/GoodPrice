/**
 * lib/catalog/self-healing/drift-repair.ts
 *
 * Detects and repairs safe metadata drift (price and image) for public catalog
 * products that are still valid but have drifted from Amazon's live data.
 *
 * "Safe" drift repairs:
 *   - Price override: live price diverges >15% from catalog and confidence is
 *     medium or high. Applies a correction via metadata-overrides.json.
 *   - Image override: image URL changed (urlChanged = true) with high confidence.
 *     Updates to the live image URL via metadata-overrides.json.
 *
 * Title drift is NOT repaired automatically — changes are logged for admin review.
 *
 * Conservative rules:
 *   - Never repair on failed or low-confidence checks
 *   - Never repair unavailable products (archive-engine handles those)
 *   - Never create a false discount (only correct prices that moved up OR
 *     where the delta is confirmed by the live extraction)
 *
 * SERVER-ONLY.
 */

import { loadAllResults, setOverride, removeOverride } from '@/lib/catalog/live-truth'
import type { Product } from '@/types'
import type { DriftRepair } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

/** Price delta % that triggers a repair. */
const PRICE_DRIFT_THRESHOLD = 0.15
/** Price delta % beyond which we DON'T auto-repair (too large — flag for admin instead). */
const PRICE_DRIFT_MAX       = 0.60

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctDiff(a: number, b: number): number {
  if (a === 0) return 0
  return (b - a) / a
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DriftRepairOptions {
  dryRun?:         boolean
  maxRepairs?:     number
}

/**
 * Apply safe metadata corrections for drifted-but-valid products.
 * Returns the list of repairs performed (or that would be performed if dryRun).
 */
export function runDriftRepair(
  publicProducts: Product[],
  opts: DriftRepairOptions = {},
): DriftRepair[] {
  const { dryRun = false, maxRepairs = 20 } = opts

  const allResults = loadAllResults()
  const repairs: DriftRepair[] = []

  for (const p of publicProducts) {
    if (repairs.length >= maxRepairs) break
    if (!p.id || !p.asin) continue

    const result = allResults[p.id]
    if (!result) continue

    // Only repair products with reliable checks
    if (result.confidence === 'failed') continue
    if (result.status     === 'unavailable') continue

    // ── Price drift repair ──────────────────────────────────────────────────
    const livePrice = result.pricing?.livePrice
    if (
      livePrice &&
      livePrice > 0 &&
      (result.confidence === 'medium' || result.confidence === 'high')
    ) {
      const delta = pctDiff(p.price, livePrice)
      const absDelta = Math.abs(delta)

      if (absDelta > PRICE_DRIFT_THRESHOLD && absDelta <= PRICE_DRIFT_MAX) {
        const repair: DriftRepair = {
          productId:  p.id,
          asin:       p.asin,
          type:       'price',
          oldValue:   p.price,
          newValue:   livePrice,
          deltaPct:   Math.round(delta * 100),
          confidence: result.confidence,
          reason:     `Live price $${livePrice.toFixed(2)} differs from catalog $${p.price.toFixed(2)} by ${Math.round(delta * 100)}%`,
          appliedAt:  new Date().toISOString(),
        }

        if (!dryRun) {
          setOverride({
            productId: p.id,
            asin:      p.asin,
            price:     livePrice,
            reason:    repair.reason,
            appliedAt: repair.appliedAt,
          })
        }

        repairs.push(repair)
        continue  // one repair per product per cycle
      } else if (absDelta <= PRICE_DRIFT_THRESHOLD) {
        // Price is close enough — remove any stale price override
        if (!dryRun) removeOverride(p.id)
      }
    }

    // ── Image drift repair ──────────────────────────────────────────────────
    const liveImage = result.extracted?.imageUrl
    if (
      liveImage &&
      result.image?.urlChanged &&
      result.confidence === 'high'
    ) {
      const repair: DriftRepair = {
        productId:  p.id,
        asin:       p.asin,
        type:       'image',
        oldValue:   p.image,
        newValue:   liveImage,
        confidence: result.confidence,
        reason:     `Image URL changed — updated to live Amazon CDN URL`,
        appliedAt:  new Date().toISOString(),
      }

      if (!dryRun) {
        setOverride({
          productId: p.id,
          asin:      p.asin,
          image:     liveImage,
          reason:    repair.reason,
          appliedAt: repair.appliedAt,
        })
      }

      repairs.push(repair)
    }
  }

  return repairs
}
