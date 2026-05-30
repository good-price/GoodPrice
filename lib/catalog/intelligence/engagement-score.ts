/**
 * lib/catalog/intelligence/engagement-score.ts
 *
 * Maps raw analytics click data to normalised EngagementScore per product.
 *
 * All engagement signals come from the in-memory analytics adapter.
 * Click share is computed relative to global total so it's comparable across
 * different traffic volumes.
 *
 * Trend direction is determined by comparing a product's click share to the
 * median click share for its category:
 *   > 1.5× category median → 'rising'
 *   0.5–1.5× → 'stable'
 *   < 0.5× (but > 0) → 'falling'
 *   0 clicks → 'dead'
 */

import type { ProductMetric, CategoryMetric } from '@/lib/analytics/metrics'
import type { EngagementScore } from './types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseClickShare(share: string): number {
  return parseFloat(share.replace('%', '')) || 0
}

/**
 * Computes the median click share for products in a category.
 * Returns 0 if no products in category.
 */
function categoryMedianClickShare(
  categorySlug: string,
  allMetrics: ProductMetric[],
): number {
  const inCat = allMetrics
    .filter(m => m.category === categorySlug)
    .map(m => parseClickShare(m.clickShare))
    .sort((a, b) => a - b)

  if (inCat.length === 0) return 0
  const mid = Math.floor(inCat.length / 2)
  return inCat.length % 2 === 0
    ? (inCat[mid - 1] + inCat[mid]) / 2
    : inCat[mid]
}

/**
 * Computes the category rank (1 = most clicked) for a product within its category.
 */
function computeCategoryRank(
  productId: string,
  categorySlug: string,
  allMetrics: ProductMetric[],
): number {
  const inCat = allMetrics
    .filter(m => m.category === categorySlug)
    .sort((a, b) => b.clicks - a.clicks)

  const pos = inCat.findIndex(m => m.productId === productId)
  return pos === -1 ? inCat.length : pos + 1
}

/**
 * Normalises click count to 0–100 engagement score.
 * Uses a log scale so high-click products don't completely dominate.
 */
function normaliseClicks(clicks: number, maxClicks: number): number {
  if (clicks === 0 || maxClicks === 0) return 0
  // log(1 + clicks) / log(1 + maxClicks) → 0..1
  const norm = Math.log1p(clicks) / Math.log1p(maxClicks)
  return Math.round(norm * 100)
}

// ── Main function ──────────────────────────────────────────────────────────────

export function computeAllEngagementScores(
  allMetrics: ProductMetric[],
  categoryMetrics: Record<string, CategoryMetric>, // eslint-disable-line @typescript-eslint/no-unused-vars
): EngagementScore[] {
  const maxClicks = allMetrics.reduce((m, p) => Math.max(m, p.clicks), 0)

  // Cache category medians (computed once per category)
  const medianCache = new Map<string, number>()
  function getCategoryMedian(slug: string): number {
    if (!medianCache.has(slug)) {
      medianCache.set(slug, categoryMedianClickShare(slug, allMetrics))
    }
    return medianCache.get(slug)!
  }

  return allMetrics.map((metric, idx) => {
    const clickShare = parseClickShare(metric.clickShare)
    const catMedian  = getCategoryMedian(metric.category)
    const catRank    = computeCategoryRank(metric.productId, metric.category, allMetrics)
    const score      = normaliseClicks(metric.clicks, maxClicks)

    let trend: EngagementScore['trend']
    if (metric.clicks === 0) {
      trend = 'dead'
    } else if (catMedian === 0 || clickShare > catMedian * 1.5) {
      trend = 'rising'
    } else if (clickShare < catMedian * 0.5) {
      trend = 'falling'
    } else {
      trend = 'stable'
    }

    return {
      productId:     metric.productId,
      totalClicks:   metric.clicks,
      clickSharePct: clickShare,
      categoryRank:  catRank,
      globalRank:    idx + 1,  // allMetrics already sorted by clicks desc
      score,
      trend,
    }
  })
}

/**
 * Build a Map<productId, EngagementScore> for fast lookups.
 */
export function buildEngagementMap(
  scores: EngagementScore[],
): Map<string, EngagementScore> {
  return new Map(scores.map(s => [s.productId, s]))
}
