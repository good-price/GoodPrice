/**
 * lib/catalog/visual-quality.ts
 *
 * Visual quality scoring for the GOODPRICE public catalog.
 *
 * Core principle: GOODPRICE must never display a product card without
 * a working, trust-building image. Placeholder SVGs are acceptable ONLY
 * in admin, repair pipeline, and internal audit views — never publicly.
 *
 * Scoring:
 *   A product is "visually safe" for public display when its image URL
 *   scores ≥ IMAGE_QUALITY_THRESHOLD (80) on the image-health scale.
 *
 *   Current CDN scores:
 *     100  m.media-amazon.com/*      Current Amazon CDN — passes ✓
 *      70  Other valid HTTPS URL     Unknown CDN — fails ✗  (below 80)
 *      35  images-na.../images/I/*   Deprecated CDN (404) — fails ✗
 *       0  images-na.../images/P/*   Dead product — fails ✗
 *       0  Empty / invalid           No image — fails ✗
 *
 * Additional suppression trigger:
 *   A product with an open repair failure record AND a sub-quality image
 *   is "doubly confirmed" for suppression (the repair system already tried
 *   and could not fix it — it is not repairable without PA-API access).
 *
 * Integration:
 *   - Gate 5V in lib/catalog/public.ts applies isPublicVisualSafe()
 *   - admin page shows visual quality stats
 *   - repair pipeline uses buildVisualSuppressionReason() for admin queue
 */

import { scoreImageUrl, IMAGE_SUPPRESS_THRESHOLD } from './image-health'
import type { Product } from '@/types'

// ── Thresholds ─────────────────────────────────────────────────────────────────

/**
 * Products with an image-health score below this threshold are suppressed
 * from all public surfaces (Gate 5V).
 *
 * Only m.media-amazon.com (score=100) passes by default.
 * Set this to 60 to also allow unknown-HTTPS images if needed.
 */
export const IMAGE_QUALITY_THRESHOLD = 80

/**
 * How many open repair failures make a product "doubly confirmed" for
 * suppression regardless of other signals.
 * (Currently 1 — repair failures are deduplicated per-product in history.ts)
 */
export const FAILURE_SUPPRESS_THRESHOLD = 1

// ── Result shape ───────────────────────────────────────────────────────────────

export interface VisualQualityResult {
  /** Image health score 0–100 */
  imageScore:        number
  /** CDN classification */
  cdnType:           string
  /** True when safe to display publicly */
  isPublicSafe:      boolean
  /** Alias for isPublicSafe */
  hasReliableImage:  boolean
  /**
   * Human-readable suppression reason, or null when the product is safe.
   * Shown in admin dashboard image-repair candidates list.
   */
  suppressionReason: string | null
  /**
   * True when the repair pipeline has already tried and failed to fix this product.
   * These need PA-API access or manual data correction — cannot self-heal.
   */
  repairFailed:      boolean
}

// ── Core functions ─────────────────────────────────────────────────────────────

/**
 * Computes visual quality for a single product.
 *
 * @param product      The product to evaluate
 * @param openFailures Number of open repair failure records for this product (0 or 1)
 */
export function computeVisualQuality(
  product: Product,
  openFailures = 0,
): VisualQualityResult {
  const imageUrl = product.image
  const health   = scoreImageUrl(imageUrl)
  const score    = health.score

  const meetsThreshold = score >= IMAGE_QUALITY_THRESHOLD
  const repairFailed   = openFailures >= FAILURE_SUPPRESS_THRESHOLD

  let isPublicSafe      = meetsThreshold
  let suppressionReason: string | null = null

  if (!meetsThreshold) {
    // Primary suppression — image quality below threshold
    if (score === 0 && health.cdnType === 'images-na-P') {
      suppressionReason = `Imagen no encontrada (patrón P/ de images-na): el ASIN probablemente está inactivo`
    } else if (score === 0 && health.cdnType === 'invalid') {
      suppressionReason = `URL de imagen inválida o vacía — revisar datos del producto`
    } else if (health.cdnType === 'images-na-I') {
      suppressionReason = `CDN Amazon obsoleto (images-na/I/) — imagen muestra placeholder. Reparación: CDN swap a m.media-amazon.com`
    } else if (score < IMAGE_SUPPRESS_THRESHOLD) {
      suppressionReason = `Imagen suprimida: score ${score}/100 — por debajo del umbral mínimo (${IMAGE_SUPPRESS_THRESHOLD})`
    } else {
      suppressionReason = `Calidad visual insuficiente: score ${score}/100 — se requiere imagen del CDN actual de Amazon`
    }
  }

  // Secondary suppression — repair already failed, confirm suppression
  if (repairFailed && !meetsThreshold) {
    isPublicSafe = false
    suppressionReason = `${suppressionReason ?? 'Imagen insuficiente'} · Pipeline de reparación intentó sin éxito — requiere acceso PA-API`
  }

  // Edge case: repair failed but image score somehow passes — still public safe
  // (repair failure is about the ASIN search, not necessarily the image)

  return {
    imageScore:        score,
    cdnType:           health.cdnType,
    isPublicSafe,
    hasReliableImage:  isPublicSafe,
    suppressionReason: isPublicSafe ? null : suppressionReason,
    repairFailed,
  }
}

/**
 * Returns true when a product has a reliable image and can be shown publicly.
 * This is the predicate used by Gate 5V in lib/catalog/public.ts.
 */
export function isPublicVisualSafe(
  product: Product,
  openFailures = 0,
): boolean {
  return computeVisualQuality(product, openFailures).isPublicSafe
}

/**
 * Returns a human-readable suppression reason for admin display,
 * or null when the product is visually safe.
 */
export function buildVisualSuppressionReason(
  product: Product,
  openFailures = 0,
): string | null {
  return computeVisualQuality(product, openFailures).suppressionReason
}

// ── Catalog-wide visual quality report ────────────────────────────────────────

export interface CatalogVisualQualityReport {
  /** Products passing the visual quality gate */
  passCount:     number
  /** Products suppressed by the visual quality gate */
  suppressCount: number
  /** Products whose repair already failed (need PA-API or manual fix) */
  repairFailedCount: number
  /** Products with images-na/I/ CDN (repairable via CDN swap) */
  cdnSwapCandidates: number
  /** Total products analysed */
  total:         number
  /** Percentage passing visual quality */
  qualityPct:    number
}

/**
 * Analyses visual quality across all products.
 * Pass `failureCounts` from the repair history for accurate failure tracking.
 *
 * @param products      Products to analyse (all, not just public)
 * @param failureCounts Map<productId, openFailureCount> from repair history
 */
export function analyseCatalogVisualQuality(
  products: Product[],
  failureCounts: Map<string, number>,
): CatalogVisualQualityReport {
  let passCount = 0, suppressCount = 0, repairFailedCount = 0, cdnSwapCandidates = 0

  for (const product of products) {
    const id           = product.id ?? ''
    const openFailures = failureCounts.get(id) ?? 0
    const result       = computeVisualQuality(product, openFailures)

    if (result.isPublicSafe) {
      passCount++
    } else {
      suppressCount++
      if (result.repairFailed)          repairFailedCount++
      if (result.cdnType === 'images-na-I') cdnSwapCandidates++
    }
  }

  const total = products.length
  return {
    passCount,
    suppressCount,
    repairFailedCount,
    cdnSwapCandidates,
    total,
    qualityPct: total > 0 ? Math.round((passCount / total) * 100) : 0,
  }
}
