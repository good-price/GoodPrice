/**
 * Gate 8: image_not_placeholder
 *
 * LOCAL gate — no HTTP requests. Runs before any network call.
 *
 * Reuses the two existing catalog helpers:
 *   isInvalidImageUrl()     — structurally invalid (empty, non-URL, etc.)
 *   isKnownBrokenImageUrl() — URLs proven to return 404:
 *       images-na.ssl-images-amazon.com/images/I/   (deprecated CDN, 404)
 *       images-na.ssl-images-amazon.com/images/P/   (ASIN proxy, 404)
 *
 * Both patterns on `images-na.ssl-images-amazon.com` are flagged because
 * Amazon migrated product images to m.media-amazon.com. The old CDN
 * consistently returns 404 — verified by isKnownBrokenImageUrl().
 *
 * Products with broken image URLs must be updated (via PA-API or manual
 * CDN swap) before they can enter the Trusted Catalog.
 */

import { isInvalidImageUrl, isKnownBrokenImageUrl } from '@/lib/catalog/placeholders'
import type { CandidateRecord, GateResult } from '@/types'

export function runImageNotPlaceholder(candidate: CandidateRecord, now: string): GateResult {
  const start = Date.now()
  const { image } = candidate

  if (isInvalidImageUrl(image)) {
    return {
      gateId:    'image_not_placeholder',
      passed:    false,
      checkedAt: now,
      detail:    `structurally invalid image URL: "${(image ?? '').slice(0, 80)}"`,
      durationMs: Date.now() - start,
    }
  }

  if (isKnownBrokenImageUrl(image)) {
    const isCdn = image.includes('images-na.ssl-images-amazon.com')
    const isP   = image.includes('/images/P/')
    const detail = isCdn
      ? isP
        ? `deprecated /P/ ASIN proxy (images-na CDN) — requires PA-API to resolve`
        : `deprecated /I/ images-na CDN — migrated to m.media-amazon.com; URL returns 404`
      : `URL is in the known-broken CDN list`

    return {
      gateId:    'image_not_placeholder',
      passed:    false,
      checkedAt: now,
      detail,
      durationMs: Date.now() - start,
    }
  }

  return {
    gateId:    'image_not_placeholder',
    passed:    true,
    checkedAt: now,
    durationMs: Date.now() - start,
  }
}
