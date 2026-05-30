/**
 * lib/catalog/intelligence/reports.ts
 *
 * Main orchestrator for the catalog intelligence system.
 *
 * Assembles the full IntelligenceReport by:
 *   1. Fetching all data sources (analytics, audit, repair, catalog, quarantine)
 *   2. Computing health scores for every product
 *   3. Computing engagement scores from analytics
 *   4. Assigning lifecycle states
 *   5. Aggregating category health
 *   6. Computing trends, suppression queue, promotion queue
 *   7. Generating discovery suggestions
 *   8. Computing category rankings
 *
 * This function is async because it needs to fetch analytics data.
 * For best performance, pass pre-fetched analytics data via `context`.
 */

import { getAllProducts } from '@/data/catalog'
import { loadLatestReport } from '@/lib/audit/report'
import { getQuarantine }    from '@/lib/audit/quarantine'
import { getReplacementHistory, getFailures } from '@/lib/catalog/repair/history'
import { buildCatalogMetrics }                from '@/lib/analytics/metrics'
import type { CatalogMetricsReport }          from '@/lib/analytics/metrics'

import { computeAllHealthScores }     from './product-health'
import { computeAllEngagementScores } from './engagement-score'
import { computeAllLifecycleStates }  from './product-lifecycle'
import { computeAllCategoryHealth }   from './category-health'
import { computeTrends }              from './trend-engine'
import { computeSuppressionQueue }    from './suppression-engine'
import { computePromotionQueue }      from './promotion-engine'
import { computeCategoryRankings }    from './ranking-engine'
import { generateDiscoverySuggestions } from './discovery-engine'

import type { IntelligenceReport, ProductHealthScore } from './types'

// ── Options ────────────────────────────────────────────────────────────────────

export interface GenerateIntelligenceReportOptions {
  /** Pre-fetched analytics data (avoids a duplicate fetch if admin page already has it) */
  analyticsData?: CatalogMetricsReport
  /** Generate discovery suggestions (default: true) */
  includeDiscovery?: boolean
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function generateIntelligenceReport(
  options: GenerateIntelligenceReportOptions = {},
): Promise<IntelligenceReport> {
  const start     = Date.now()
  const { includeDiscovery = true } = options

  // ── 1. Gather data ─────────────────────────────────────────────────────────
  const products     = getAllProducts()
  const auditReport  = loadLatestReport()
  const quarantine   = getQuarantine()
  const replacements = getReplacementHistory()
  const failures     = getFailures()

  // Analytics: use pre-fetched data or fetch fresh
  let analyticsData: CatalogMetricsReport
  if (options.analyticsData) {
    analyticsData = options.analyticsData
  } else {
    analyticsData = await buildCatalogMetrics()
  }

  // Build click lookup: productId → { clicks, rank }
  const clickData = new Map<string, { clicks: number; rank: number }>(
    analyticsData.allProducts.map((m, idx) => [
      m.productId,
      { clicks: m.clicks, rank: idx + 1 },
    ]),
  )

  // ── 2. Health scores ───────────────────────────────────────────────────────
  const healthScores = computeAllHealthScores(
    products,
    auditReport,
    failures,
    replacements,
    clickData,
  )

  // ── 3. Engagement scores ──────────────────────────────────────────────────
  const engagementScores = computeAllEngagementScores(
    analyticsData.allProducts,
    analyticsData.byCategory,
  )

  // ── 4. Lifecycle states ───────────────────────────────────────────────────
  const lifecycleStates = computeAllLifecycleStates(
    products,
    healthScores,
    engagementScores,
    quarantine,
    replacements,
  )

  // ── 5. Category health ────────────────────────────────────────────────────
  const categoryHealth = computeAllCategoryHealth(
    products,
    healthScores,
    engagementScores,
    lifecycleStates,
  )

  // ── 6. Trends ─────────────────────────────────────────────────────────────
  const trends = computeTrends(
    products,
    healthScores,
    engagementScores,
    lifecycleStates,
    categoryHealth,
  )

  // ── 7. Suppression + promotion queues ────────────────────────────────────
  const suppressionQueue = computeSuppressionQueue(
    products,
    healthScores,
    lifecycleStates,
    failures,
  )

  const promotionQueue = computePromotionQueue(
    products,
    healthScores,
    engagementScores,
    lifecycleStates,
  )

  // ── 8. Rankings ───────────────────────────────────────────────────────────
  const categoryRankings = computeCategoryRankings(
    products,
    healthScores,
    engagementScores,
    lifecycleStates,
  )

  // ── 9. Discovery ──────────────────────────────────────────────────────────
  const discoverySuggestions = includeDiscovery
    ? generateDiscoverySuggestions(products, healthScores, engagementScores)
    : []

  // ── 10. Admin shortcuts ───────────────────────────────────────────────────
  const sortedHealth = [...healthScores].sort((a, b) => b.total - a.total)

  const topHealthy = sortedHealth
    .filter(h => h.total >= 70)
    .slice(0, 10)

  const atRisk: Array<ProductHealthScore & { reason: string }> = suppressionQueue
    .slice(0, 10)
    .map(s => {
      const h = healthScores.find(h => h.productId === s.productId) ?? {
        productId: s.productId,
        asin:      s.asin,
        title:     s.title,
        category:  s.category,
        total:     s.healthScore,
        breakdown: { auditScore: 0, imageScore: 0, asinScore: 0, freshnessScore: 0, engagementScore: 0, repairScore: 0 },
      }
      return { ...h, reason: s.reason }
    })

  const topEngaged = [...engagementScores]
    .filter(e => e.totalClicks > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return {
    generatedAt:       new Date().toISOString(),
    durationMs:        Date.now() - start,
    totalProducts:     products.length,
    healthScores,
    lifecycleStates,
    engagementScores,
    categoryHealth,
    trends,
    suppressionQueue,
    promotionQueue,
    categoryRankings,
    discoverySuggestions,
    topHealthy,
    atRisk,
    topEngaged,
  }
}
