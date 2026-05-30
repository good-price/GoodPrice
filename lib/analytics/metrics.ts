/**
 * Analytics metrics layer — cross-references live click data with the product catalog.
 *
 * This module is the bridge between:
 *   - lib/analytics/store.ts  (raw event counters — what users actually did)
 *   - data/catalog            (ground truth of what's in the catalog)
 *
 * All functions are async because the underlying store is async (supports KV).
 * Pure reads — no side effects, no writes.
 *
 * Two public report builders:
 *   buildObservabilityReport()  → behavior-focused (events, clicks, category traffic)
 *   buildCatalogMetrics()       → catalog-focused  (every product ranked by clicks)
 */

import { getRawProducts } from '@/data/catalog'
import { getTopProducts, getTopCategories, getAnalyticsSummary } from './store'

// ── Derived metric types ──────────────────────────────────────────────────────

export interface ProductMetric {
  rank: number
  productId: string
  asin: string
  title: string
  category: string
  brand?: string
  price: number
  isOffer: boolean
  isTopSeller: boolean
  catalogStatus?: string   // from RawProduct.status
  clicks: number
  /** Percentage of total product clicks captured by this product.
   *  Proxy for "internal CTR" — the higher, the more engaging the product. */
  clickShare: string       // e.g. "23.8%"
  lastClickAt?: string     // ISO — undefined if never clicked
}

export interface CategoryMetric {
  category: string
  totalProducts: number
  productsWithClicks: number
  totalClicks: number
  avgClicksPerProduct: string  // e.g. "3.6"
}

export interface ObservabilityReport {
  meta: {
    generatedAt: string
    uptime: string        // human-readable: "2h 15m"
    uptimeSince: string   // ISO
  }
  summary: {
    totalEvents: number
    catalogSize: number
    uniqueProductsClicked: number
    uniqueCategoriesVisited: number
    productsWithZeroClicks: number
    deadProductRate: string   // e.g. "55.6%"
  }
  topProducts: ProductMetric[]      // clicked products, sorted by clicks desc (max 10)
  topCategories: Array<{
    rank: number
    category: string
    views: number
    lastViewAt: string
  }>
  insights: {
    topPerformer: { productId: string; title: string; asin: string; clicks: number } | null
    mostActiveCategory: string | null
    leastActiveCategory: string | null
    deadProducts: number
  }
}

export interface CatalogMetricsReport {
  meta: {
    generatedAt: string
    totalProducts: number
    totalClicks: number
    note: string
  }
  allProducts: ProductMetric[]
  byCategory: Record<string, CategoryMetric>
  deadProducts: ProductMetric[]
  insights: {
    productsWithClicks: number
    productsWithZeroClicks: number
    mostActiveCategory: string | null
    leastActiveCategory: string | null
    topPerformerTitle: string | null
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function formatUptime(uptimeSince: string): string {
  const ms = Date.now() - new Date(uptimeSince).getTime()
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function pct(value: number, total: number): string {
  if (total === 0) return '0.0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

/**
 * Core cross-reference: combines RawProduct catalog with live click counts from the store.
 * Returns every catalog product with its click metrics, sorted by clicks desc.
 * Async because the store is async (adapter pattern).
 */
async function buildAllProductMetrics(): Promise<{ metrics: ProductMetric[]; totalClicks: number }> {
  const rawProducts = getRawProducts()
  // Fetch all click data — pass a large limit so we never miss any product
  const storeClicks = await getTopProducts(10_000)

  const totalClicks = storeClicks.reduce((sum, p) => sum + p.clicks, 0)
  const clickMap = new Map(storeClicks.map(p => [p.productId, p]))

  const metrics: ProductMetric[] = rawProducts
    .map(raw => {
      const entry = clickMap.get(raw.id)
      const clicks = entry?.clicks ?? 0
      return {
        rank: 0,
        productId: raw.id,
        asin: raw.asin,
        title: raw.title,
        category: raw.category,
        brand: raw.brand,
        price: raw.price,
        isOffer: raw.isOffer ?? false,
        isTopSeller: raw.isTopSeller ?? false,
        catalogStatus: raw.status,
        clicks,
        clickShare: pct(clicks, totalClicks),
        lastClickAt: entry?.lastClickAt,
      }
    })
    .sort((a, b) => b.clicks - a.clicks)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  return { metrics, totalClicks }
}

function buildCategoryAggregation(metrics: ProductMetric[]): Record<string, CategoryMetric> {
  const byCategory: Record<string, CategoryMetric> = {}

  for (const p of metrics) {
    const cat = p.category
    if (!byCategory[cat]) {
      byCategory[cat] = {
        category: cat,
        totalProducts: 0,
        productsWithClicks: 0,
        totalClicks: 0,
        avgClicksPerProduct: '0.0',
      }
    }
    byCategory[cat].totalProducts++
    byCategory[cat].totalClicks += p.clicks
    if (p.clicks > 0) byCategory[cat].productsWithClicks++
  }

  for (const cat of Object.values(byCategory)) {
    cat.avgClicksPerProduct = cat.totalProducts > 0
      ? (cat.totalClicks / cat.totalProducts).toFixed(1)
      : '0.0'
  }

  return byCategory
}

// ── Public report builders ────────────────────────────────────────────────────

/**
 * buildObservabilityReport — behavior-focused summary.
 * Answers: "What are users actually clicking? Which categories drive traffic?"
 */
export async function buildObservabilityReport(): Promise<ObservabilityReport> {
  // Fetch catalog cross-reference + store data concurrently
  const [{ metrics }, storeCategories, storeSummary] = await Promise.all([
    buildAllProductMetrics(),
    getTopCategories(20),
    getAnalyticsSummary(),
  ])

  const deadProducts = metrics.filter(p => p.clicks === 0)
  const byCategory = buildCategoryAggregation(metrics)
  const categoryRanked = Object.values(byCategory).sort((a, b) => b.totalClicks - a.totalClicks)
  const topPerformer = metrics[0]?.clicks > 0 ? metrics[0] : null

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      uptime: formatUptime(storeSummary.uptimeSince),
      uptimeSince: storeSummary.uptimeSince,
    },
    summary: {
      totalEvents: storeSummary.totalEvents,
      catalogSize: metrics.length,
      uniqueProductsClicked: storeSummary.uniqueProducts,
      uniqueCategoriesVisited: storeSummary.uniqueCategories,
      productsWithZeroClicks: deadProducts.length,
      deadProductRate: pct(deadProducts.length, metrics.length),
    },
    topProducts: metrics.filter(p => p.clicks > 0).slice(0, 10),
    topCategories: storeCategories.map((c, i) => ({
      rank: i + 1,
      category: c.category,
      views: c.views,
      lastViewAt: c.lastViewAt,
    })),
    insights: {
      topPerformer: topPerformer
        ? { productId: topPerformer.productId, title: topPerformer.title, asin: topPerformer.asin, clicks: topPerformer.clicks }
        : null,
      mostActiveCategory: categoryRanked[0]?.category ?? null,
      leastActiveCategory: categoryRanked[categoryRanked.length - 1]?.category ?? null,
      deadProducts: deadProducts.length,
    },
  }
}

/**
 * buildCatalogMetrics — catalog-focused full table.
 * Answers: "Which products are dead weight? What is each product's engagement share?"
 */
export async function buildCatalogMetrics(): Promise<CatalogMetricsReport> {
  const { metrics, totalClicks } = await buildAllProductMetrics()
  const byCategory = buildCategoryAggregation(metrics)

  const deadProducts = metrics.filter(p => p.clicks === 0)
  const productsWithClicks = metrics.filter(p => p.clicks > 0)

  const categoryRanked = Object.values(byCategory).sort((a, b) => b.totalClicks - a.totalClicks)
  const topPerformer = metrics[0]?.clicks > 0 ? metrics[0] : null

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      totalProducts: metrics.length,
      totalClicks,
      note: 'clickShare = product clicks / total clicks. Higher = more engaging. Persists via KV when KV_REST_API_URL is set.',
    },
    allProducts: metrics,
    byCategory,
    deadProducts,
    insights: {
      productsWithClicks: productsWithClicks.length,
      productsWithZeroClicks: deadProducts.length,
      mostActiveCategory: categoryRanked[0]?.category ?? null,
      leastActiveCategory: categoryRanked[categoryRanked.length - 1]?.category ?? null,
      topPerformerTitle: topPerformer?.title ?? null,
    },
  }
}
