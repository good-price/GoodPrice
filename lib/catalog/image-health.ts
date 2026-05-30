/**
 * lib/catalog/image-health.ts
 *
 * Image validity scoring and suppression logic for the GOODPRICE catalog.
 *
 * Scoring rubric (0–100):
 *   100  m.media-amazon.com/images/I/*   Current Amazon CDN — reliable
 *    70  Other valid HTTPS URL            Unknown CDN — might work
 *    35  images-na…/images/I/*           Deprecated CDN — returns 404, shows placeholder
 *     0  images-na…/images/P/*           "Product not found" pattern — ASIN is dead
 *     0  Empty / invalid URL             No image at all
 *
 * Suppression thresholds:
 *   score < IMAGE_SUPPRESS_THRESHOLD (30)  → auto-suppress from public catalog
 *   score < IMAGE_WARN_THRESHOLD     (60)  → flag for admin review
 *   score ≥ 60                             → acceptable (placeholder OK)
 *
 * Suppression criteria (any of these triggers suppression):
 *   1. images-na…/images/P/* (score = 0) — ASIN is dead
 *   2. Structurally invalid URL (score = 0) — misconfigured product
 *   3. REPEATED broken images: images-na/I/ AND repeated audit failures
 *      (handled by image-health + intelligence integration, not here directly)
 *
 * Integration:
 *   - Used by lib/catalog/public.ts Gate 5E (enhanced image gate)
 *   - Used by lib/catalog/intelligence/product-health.ts for image sub-score
 *   - Feeds into the intelligence suppression queue (critical / high severity)
 */

import { isInvalidImageUrl } from './placeholders'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Products with score below this are auto-suppressed (Gate 5E). */
export const IMAGE_SUPPRESS_THRESHOLD = 30

/** Products with score below this are flagged in the admin suppression queue. */
export const IMAGE_WARN_THRESHOLD = 60

// ── Image URL classifier ───────────────────────────────────────────────────────

export type ImageCdnType =
  | 'media-amazon'       // m.media-amazon.com — current CDN
  | 'images-na-I'        // deprecated CDN, /images/I/ — 404s but ASIN might be valid
  | 'images-na-P'        // deprecated CDN, /images/P/ — product-not-found, ASIN dead
  | 'https-other'        // any other HTTPS URL — unknown reliability
  | 'invalid'            // empty, null, or not a URL

export type ImageHealthStatus = 'premium' | 'valid' | 'degraded' | 'broken' | 'invalid'

export interface ImageHealthScore {
  /** Numeric score 0–100 */
  score:       number
  /** Human-readable status */
  status:      ImageHealthStatus
  /** CDN classification */
  cdnType:     ImageCdnType
  /** True if this product should be suppressed from public catalog */
  suppressible: boolean
  /** Short explanation for admin dashboard */
  reason:      string
}

/**
 * Classifies an image URL by its CDN type.
 */
export function classifyImageCdn(url: string | undefined): ImageCdnType {
  if (!url || isInvalidImageUrl(url)) return 'invalid'
  if (url.includes('m.media-amazon.com'))                           return 'media-amazon'
  if (url.includes('images-na.ssl-images-amazon.com/images/P/'))   return 'images-na-P'
  if (url.includes('images-na.ssl-images-amazon.com/images/I/'))   return 'images-na-I'
  return 'https-other'
}

/**
 * Scores an image URL for health and suppression eligibility.
 *
 * This is the single source of truth for image quality in the catalog.
 * Both public.ts and product-health.ts should use this function.
 */
export function scoreImageUrl(url: string | undefined): ImageHealthScore {
  const cdnType = classifyImageCdn(url)

  switch (cdnType) {
    case 'media-amazon':
      return {
        score:        100,
        status:       'premium',
        cdnType,
        suppressible: false,
        reason:       'Current Amazon CDN — high reliability',
      }

    case 'https-other':
      return {
        score:        70,
        status:       'valid',
        cdnType,
        suppressible: false,
        reason:       'Valid HTTPS URL — external CDN, may require monitoring',
      }

    case 'images-na-I':
      // Deprecated CDN — consistently 404s, but ASIN itself may be valid.
      // Shows placeholder; not suppressed (admin can repair via CDN swap).
      return {
        score:        35,
        status:       'degraded',
        cdnType,
        suppressible: false,
        reason:       'Deprecated images-na CDN — returns 404, shows placeholder until repaired',
      }

    case 'images-na-P':
      // "Product not found" pattern — the ASIN is likely dead or miscatalogued.
      // Suppressed from public catalog.
      return {
        score:        0,
        status:       'broken',
        cdnType,
        suppressible: true,
        reason:       'Product-not-found image pattern — ASIN likely inactive',
      }

    case 'invalid':
      return {
        score:        0,
        status:       'invalid',
        cdnType,
        suppressible: true,
        reason:       'Invalid or empty image URL',
      }
  }
}

// ── Catalog-wide analysis ──────────────────────────────────────────────────────

export interface CatalogImageHealth {
  /** Products with score = 100 (current CDN) */
  premiumCount: number
  /** Products with score ≥ 60 (acceptable quality) */
  healthyCount: number
  /** Products with score 30–59 (degraded — placeholder shown) */
  degradedCount: number
  /** Products with score < 30 (suppressed from public catalog) */
  suppressedCount: number
  /** Total products analysed */
  total: number
  /** Percentage with score ≥ 60 */
  healthPct: number
  /** Percentage suppressed */
  suppressPct: number
}

/**
 * Analyses image health across all products.
 * Used by the admin dashboard for image health stats.
 */
export function analyseImageHealth(
  products: Array<{ image?: string | null }>,
): CatalogImageHealth {
  let premium = 0, healthy = 0, degraded = 0, suppressed = 0

  for (const p of products) {
    const h = scoreImageUrl(p.image ?? undefined)
    if (h.score === 100)                              premium++
    if (h.score >= 60)                               healthy++
    else if (h.score >= IMAGE_SUPPRESS_THRESHOLD)    degraded++
    else                                             suppressed++
  }

  const total = products.length
  return {
    premiumCount:    premium,
    healthyCount:    healthy,
    degradedCount:   degraded,
    suppressedCount: suppressed,
    total,
    healthPct:    total > 0 ? Math.round((healthy  / total) * 100) : 0,
    suppressPct:  total > 0 ? Math.round((suppressed / total) * 100) : 0,
  }
}

/**
 * Convenience predicate — true if the product should be suppressed
 * based on image health alone.
 */
export function isImageSuppressible(url: string | undefined): boolean {
  return scoreImageUrl(url).suppressible
}

/**
 * @deprecated Use scoreImageUrl(url).score for the image sub-score.
 * This shim keeps backward compatibility with product-health.ts which
 * previously used isKnownBrokenImageUrl / isInvalidImageUrl inline.
 */
export function legacyImageScore(url: string | undefined): number {
  const h = scoreImageUrl(url)
  // Map to the 0-20 scale used by the health scoring sub-component
  if (h.score >= 100) return 20
  if (h.score >=  70) return 15
  if (h.score >=  35) return 10
  return 0
}
