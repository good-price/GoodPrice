/**
 * lib/catalog/intelligence/category-health.ts
 *
 * Aggregates per-category health, engagement, and lifecycle stats.
 *
 * Category trend:
 *   'rising'  → above-median total clicks AND below-average at-risk count
 *   'falling' → below-median AND high at-risk count
 *   'stable'  → everything else
 */

import type { Product } from '@/types'
import type { ProductHealthScore, EngagementScore, ProductLifecycleState, CategoryHealth } from './types'
import { categories as CATEGORIES } from '@/data/categories'

// ── Helpers ────────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const AT_RISK_STATES = new Set<ProductLifecycleState>(['unhealthy', 'declining', 'archived'])
const HEALTHY_STATES = new Set<ProductLifecycleState>(['healthy', 'trending'])

// ── Main function ──────────────────────────────────────────────────────────────

export function computeAllCategoryHealth(
  products: Product[],
  healthScores: ProductHealthScore[],
  engagementScores: EngagementScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
): CategoryHealth[] {
  const healthMap     = new Map(healthScores.map(h => [h.productId, h]))
  const engagementMap = new Map(engagementScores.map(e => [e.productId, e]))

  // First pass: collect per-category totals
  const catTotals = new Map<string, {
    products: Product[]
    totalClicks: number
    healthSum: number
    healthyCount: number
    atRiskCount: number
    topProductId: string | null
    topClicks: number
  }>()

  // Initialise all known categories
  for (const cat of CATEGORIES) {
    catTotals.set(cat.slug, {
      products: [],
      totalClicks: 0,
      healthSum: 0,
      healthyCount: 0,
      atRiskCount: 0,
      topProductId: null,
      topClicks: 0,
    })
  }

  for (const product of products) {
    const slug = product.category
    if (!catTotals.has(slug)) {
      catTotals.set(slug, {
        products: [],
        totalClicks: 0,
        healthSum: 0,
        healthyCount: 0,
        atRiskCount: 0,
        topProductId: null,
        topClicks: -1,
      })
    }

    const agg        = catTotals.get(slug)!
    const health     = healthMap.get(product.id ?? '')
    const engagement = engagementMap.get(product.id ?? '')
    const lifecycle  = lifecycleStates[product.id ?? '']

    agg.products.push(product)
    agg.healthSum    += health?.total ?? 0
    agg.totalClicks  += engagement?.totalClicks ?? 0

    if (lifecycle && HEALTHY_STATES.has(lifecycle)) agg.healthyCount++
    if (lifecycle && AT_RISK_STATES.has(lifecycle))  agg.atRiskCount++

    const clicks = engagement?.totalClicks ?? 0
    if (clicks > agg.topClicks) {
      agg.topClicks      = clicks
      agg.topProductId   = product.id ?? null
    }
  }

  // Compute median total clicks to determine category trend
  const allCatClicks = Array.from(catTotals.values()).map(c => c.totalClicks)
  const medianClicks = median(allCatClicks)

  // Build output
  const result: CategoryHealth[] = []

  for (const [slug, agg] of Array.from(catTotals.entries())) {
    const count       = agg.products.length
    const avgHealth   = count > 0 ? Math.round(agg.healthSum / count) : 0
    const atRiskRatio = count > 0 ? agg.atRiskCount / count : 0

    let trend: CategoryHealth['trend']
    if (agg.totalClicks > medianClicks * 1.4 && atRiskRatio < 0.3) {
      trend = 'rising'
    } else if (agg.totalClicks < medianClicks * 0.6 || atRiskRatio > 0.5) {
      trend = 'falling'
    } else {
      trend = 'stable'
    }

    const catMeta = CATEGORIES.find(c => c.slug === slug)

    result.push({
      slug,
      name:          catMeta?.name ?? slug,
      totalProducts: count,
      healthyCount:  agg.healthyCount,
      atRiskCount:   agg.atRiskCount,
      avgHealthScore: avgHealth,
      totalClicks:   agg.totalClicks,
      trend,
      topProductId:  agg.topProductId,
    })
  }

  return result.sort((a, b) => b.totalClicks - a.totalClicks)
}
