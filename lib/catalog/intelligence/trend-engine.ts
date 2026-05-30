/**
 * lib/catalog/intelligence/trend-engine.ts
 *
 * Computes trend signals: rising, falling, dead products and categories.
 *
 * Since click data is in-memory (no historical time series), trends are
 * derived from cross-sectional signals:
 *
 * Product trends:
 *   RISING  → engagement trend = 'rising' + lifecycle = 'trending' or 'healthy'
 *   FALLING → engagement trend = 'falling' + lifecycle = 'declining' or 'stale'
 *   DEAD    → zero clicks + lifecycle = 'stale', 'declining', or 'archived'
 *
 * Category trends:
 *   RISING  → above-median engagement + below-average at-risk products
 *   FALLING → below-median engagement + high at-risk ratio
 *
 * Returns TrendData — a read-only snapshot of trend signals.
 */

import type { Product } from '@/types'
import type {
  ProductHealthScore,
  EngagementScore,
  ProductLifecycleState,
  CategoryHealth,
  TrendData,
  TrendEntry,
} from './types'

// ── Constants ──────────────────────────────────────────────────────────────────

const RISING_LIFECYCLES  = new Set<ProductLifecycleState>(['trending', 'healthy'])
const FALLING_LIFECYCLES = new Set<ProductLifecycleState>(['declining', 'stale'])
const DEAD_LIFECYCLES    = new Set<ProductLifecycleState>(['stale', 'declining', 'archived'])
const MAX_TREND_ENTRIES  = 10

// ── Main function ──────────────────────────────────────────────────────────────

export function computeTrends(
  products: Product[],
  healthScores: ProductHealthScore[],
  engagementScores: EngagementScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
  categoryHealth: CategoryHealth[],
): TrendData {
  const healthMap     = new Map(healthScores.map(h => [h.productId, h]))
  const engagementMap = new Map(engagementScores.map(e => [e.productId, e]))

  const rising:  TrendEntry[] = []
  const falling: TrendEntry[] = []
  const dead:    TrendEntry[] = []

  for (const product of products) {
    const id         = product.id ?? ''
    const health     = healthMap.get(id)
    const engagement = engagementMap.get(id)
    const lifecycle  = lifecycleStates[id]

    if (!health || !lifecycle) continue

    const engTrend = engagement?.trend ?? 'dead'

    // Rising: engagement trend = rising AND lifecycle = trending/healthy
    if (engTrend === 'rising' && RISING_LIFECYCLES.has(lifecycle)) {
      rising.push({
        productId: id,
        title:     product.title,
        category:  product.category,
        score:     health.total,
      })
      continue
    }

    // Dead: zero clicks + lifecycle = stale/declining/archived
    if (engTrend === 'dead' && DEAD_LIFECYCLES.has(lifecycle)) {
      dead.push({
        productId: id,
        title:     product.title,
        category:  product.category,
        score:     health.total,
      })
      continue
    }

    // Falling: engagement trend = falling + lifecycle = declining/stale
    if (engTrend === 'falling' && FALLING_LIFECYCLES.has(lifecycle)) {
      falling.push({
        productId: id,
        title:     product.title,
        category:  product.category,
        score:     health.total,
      })
    }
  }

  // Sort and cap
  const sortByScore = (a: TrendEntry, b: TrendEntry) => b.score - a.score

  // Rising categories: above-median totalClicks AND trend='rising'
  const risingCategories = categoryHealth
    .filter(c => c.trend === 'rising')
    .sort((a, b) => b.totalClicks - a.totalClicks)
    .map(c => c.slug)

  const fallingCategories = categoryHealth
    .filter(c => c.trend === 'falling')
    .sort((a, b) => a.totalClicks - b.totalClicks)
    .map(c => c.slug)

  return {
    rising:            rising.sort(sortByScore).slice(0, MAX_TREND_ENTRIES),
    falling:           falling.sort((a, b) => a.score - b.score).slice(0, MAX_TREND_ENTRIES),
    dead:              dead.sort((a, b) => a.score - b.score).slice(0, MAX_TREND_ENTRIES),
    risingCategories,
    fallingCategories,
  }
}
