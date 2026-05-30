/**
 * lib/catalog/intelligence/product-health.ts
 *
 * Computes a dynamic 0–100 health score for each product.
 *
 * Score breakdown:
 *   auditScore     0-25  reliability from latest audit (scaled)
 *   imageScore     0-20  CDN quality — m.media > images-na/I > P/ > invalid
 *   asinScore      0-15  ASIN format × catalog status
 *   freshnessScore 0-15  age of lastValidated field
 *   engagementScore 0-15 click percentile rank within catalog
 *   repairScore    0-10  failure history penalty
 *
 * Total maximum: 100
 */

import type { Product } from '@/types'
import type { CatalogAuditReport } from '@/lib/audit/types'
import type { FailureEntry, ReplacementEntry } from '@/lib/catalog/repair/types'
import { isKnownBrokenImageUrl, isInvalidImageUrl } from '@/lib/catalog/placeholders'
import { isValidAsinFormat } from '@/lib/catalog/validator'
import type { ProductHealthScore, HealthScoreBreakdown } from './types'

// ── Image scoring ──────────────────────────────────────────────────────────────

function computeImageScore(image: string | undefined): number {
  if (!image || isInvalidImageUrl(image)) return 0
  // P/ format — needs PA-API, unfixable without credentials
  if (image.includes('/images/P/')) return 0
  // Deprecated images-na CDN (I/ path) — fixable via CDN swap but currently 404
  if (isKnownBrokenImageUrl(image)) return 10
  // Valid modern CDN URL
  return 20
}

// ── ASIN + status scoring ──────────────────────────────────────────────────────

function computeAsinScore(product: Product): number {
  if (!product.asin || !isValidAsinFormat(product.asin)) return 0
  switch (product.status) {
    case 'active':      return 15
    case 'unverified':  return 10
    case 'stale':       return 6
    case 'inactive':    return 0
    default:            return 8  // undefined status — partial credit
  }
}

// ── Freshness scoring ──────────────────────────────────────────────────────────

function computeFreshnessScore(lastValidated: string | undefined): number {
  if (!lastValidated) return 0
  const ageDays = (Date.now() - new Date(lastValidated).getTime()) / 86_400_000
  if (ageDays <= 7)   return 15
  if (ageDays <= 30)  return 12
  if (ageDays <= 90)  return 8
  if (ageDays <= 180) return 4
  return 1  // very old but at least exists
}

// ── Engagement scoring ─────────────────────────────────────────────────────────

/**
 * Scores a product's engagement as a percentile rank in the catalog.
 * clickRank = position when all products sorted by clicks desc (1 = most clicked)
 * totalProducts = full catalog size
 */
export function computeEngagementScoreFromRank(
  clicks: number,
  clickRank: number,
  totalProducts: number,
): number {
  if (clicks === 0) return 0
  const percentile = 1 - (clickRank - 1) / Math.max(totalProducts - 1, 1)
  // percentile = 1.0 → best, 0.0 → worst among products with clicks
  if (percentile >= 0.95) return 15
  if (percentile >= 0.80) return 12
  if (percentile >= 0.60) return 9
  if (percentile >= 0.40) return 6
  if (percentile >= 0.20) return 3
  return 1
}

// ── Repair history scoring ─────────────────────────────────────────────────────

function computeRepairScore(
  productId: string,
  failures: FailureEntry[],
  replacements: ReplacementEntry[],
): number {
  const openFailure = failures.some(f => f.productId === productId)
  if (openFailure) return 0

  const repairAttempts = replacements.filter(r => r.productId === productId)
  if (repairAttempts.length === 0) return 10  // never needed repair — ideal

  const lastAttempt = repairAttempts[repairAttempts.length - 1]
  if (lastAttempt.status === 'auto_replaced')          return 7  // was repaired
  if (lastAttempt.status === 'manual_review_required') return 4  // pending fix
  return 2  // failed attempts
}

// ── Audit score ────────────────────────────────────────────────────────────────

function computeAuditScore(
  productId: string,
  auditReport: CatalogAuditReport | null,
): number {
  if (!auditReport) return 12  // no audit → neutral mid-score

  const entry = auditReport.products.find(p => p.productId === productId)
  if (!entry) return 12

  // Scale audit score (0-100) to 0-25
  return Math.round((entry.score / 100) * 25)
}

// ── Main function ──────────────────────────────────────────────────────────────

export function computeProductHealth(
  product: Product,
  auditReport: CatalogAuditReport | null,
  failures: FailureEntry[],
  replacements: ReplacementEntry[],
  clickRank: number,
  clicks: number,
  totalProducts: number,
): ProductHealthScore {
  const auditScore      = computeAuditScore(product.id ?? '', auditReport)
  const imageScore      = computeImageScore(product.image)
  const asinScore       = computeAsinScore(product)
  const freshnessScore  = computeFreshnessScore(product.lastValidated)
  const engagementScore = computeEngagementScoreFromRank(clicks, clickRank, totalProducts)
  const repairScore     = computeRepairScore(product.id ?? '', failures, replacements)

  const breakdown: HealthScoreBreakdown = {
    auditScore,
    imageScore,
    asinScore,
    freshnessScore,
    engagementScore,
    repairScore,
  }

  return {
    productId: product.id ?? '',
    asin:      product.asin ?? '',
    title:     product.title,
    category:  product.category,
    total:     auditScore + imageScore + asinScore + freshnessScore + engagementScore + repairScore,
    breakdown,
  }
}

/**
 * Computes health scores for all products.
 * Click rank map: productId → { clicks, rank }
 */
export function computeAllHealthScores(
  products: Product[],
  auditReport: CatalogAuditReport | null,
  failures: FailureEntry[],
  replacements: ReplacementEntry[],
  clickData: Map<string, { clicks: number; rank: number }>,
): ProductHealthScore[] {
  return products.map(p => {
    const cd = clickData.get(p.id ?? '') ?? { clicks: 0, rank: products.length }
    return computeProductHealth(
      p,
      auditReport,
      failures,
      replacements,
      cd.rank,
      cd.clicks,
      products.length,
    )
  })
}
