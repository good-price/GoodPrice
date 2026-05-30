/**
 * Analytics store — public async API that delegates to the active adapter.
 *
 * This file is intentionally thin: it owns the public function signatures
 * and composes higher-level helpers (getAnalyticsSummary) from adapter primitives.
 * All storage logic lives in adapter.ts.
 *
 * Callers (metrics.ts, API routes, admin page) import from here — never from adapter.ts directly.
 */

import type { ProductClickStats, CategoryViewStats, AnalyticsSummary } from '@/types'
import { getAdapter, resetAdapter } from './adapter'

// ── Write operations ──────────────────────────────────────────────────────────

export async function recordProductClick(productId: string, asin: string): Promise<void> {
  await getAdapter().recordProductClick(productId, asin)
}

export async function recordCategoryView(category: string): Promise<void> {
  await getAdapter().recordCategoryView(category)
}

// ── Read operations ───────────────────────────────────────────────────────────

/**
 * Top N products by click count.
 * Pass a large number (e.g. 10_000) to retrieve the full set for cross-referencing.
 */
export async function getTopProducts(limit = 10): Promise<ProductClickStats[]> {
  return getAdapter().getProductClicks(limit)
}

export async function getTopCategories(limit = 10): Promise<CategoryViewStats[]> {
  return getAdapter().getCategoryViews(limit)
}

/**
 * Aggregated summary — fetches all sub-metrics in parallel for efficiency.
 * uniqueProducts / uniqueCategories reflect the full count, not just the top-N slice.
 */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const adapter = getAdapter()

  // Fetch everything in parallel — single round-trip for KVAdapter (pipeline)
  const [allProducts, allCategories, totalEvents, uptimeSince] = await Promise.all([
    adapter.getProductClicks(Number.MAX_SAFE_INTEGER),
    adapter.getCategoryViews(Number.MAX_SAFE_INTEGER),
    adapter.getTotalEvents(),
    adapter.getUptimeSince(),
  ])

  return {
    totalEvents,
    uptimeSince,
    uniqueProducts: allProducts.length,
    uniqueCategories: allCategories.length,
    topProducts: allProducts.slice(0, 10),
    topCategories: allCategories.slice(0, 10),
  }
}

// ── Admin operations ──────────────────────────────────────────────────────────

/** Wipe all analytics data from the active adapter. */
export async function resetAnalyticsStore(): Promise<void> {
  await getAdapter().reset()
}

/** Re-export for adapter-level testing (forces a new adapter on next call). */
export { resetAdapter }
