/**
 * lib/catalog/intelligence/discovery-engine.ts
 *
 * Generates discovery suggestions for new products to add to the catalog.
 * Operates purely on existing catalog data — no external API calls.
 *
 * Strategy:
 *   1. Find top-performing brands (high health + engagement) in each category
 *   2. For each top brand, suggest additional products by that brand
 *      and related brands in the same segment
 *   3. Score suggestions by brand momentum (health + engagement combined)
 *   4. Deduplicate brands already well-represented in the catalog
 *
 * This engine generates SUGGESTIONS only. Products are never auto-added.
 * Suggestions feed the admin dashboard "Discovery" section.
 */

import type { Product } from '@/types'
import type { ProductHealthScore, EngagementScore, DiscoverySuggestion } from './types'
import { buildSearchQuery } from '@/lib/catalog/repair/candidate-search'
import { categories as CATEGORIES } from '@/data/categories'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BrandProfile {
  brand: string
  category: string
  productCount: number
  avgHealth: number
  totalClicks: number
  topProductId: string
  topProductTitle: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildBrandProfiles(
  products: Product[],
  healthMap: Map<string, ProductHealthScore>,
  engagementMap: Map<string, EngagementScore>,
): BrandProfile[] {
  // Aggregate per brand-category combination
  const aggMap = new Map<string, {
    brand: string
    category: string
    products: Product[]
    healthSum: number
    totalClicks: number
    topProduct: { id: string; title: string; score: number }
  }>()

  for (const product of products) {
    if (!product.brand) continue
    const key     = `${product.brand.toLowerCase()}::${product.category}`
    const health  = healthMap.get(product.id ?? '')
    const clicks  = engagementMap.get(product.id ?? '')?.totalClicks ?? 0
    const hScore  = health?.total ?? 0

    if (!aggMap.has(key)) {
      aggMap.set(key, {
        brand:    product.brand,
        category: product.category,
        products: [],
        healthSum: 0,
        totalClicks: 0,
        topProduct: { id: product.id ?? '', title: product.title, score: hScore + clicks },
      })
    }
    const agg = aggMap.get(key)!
    agg.products.push(product)
    agg.healthSum   += hScore
    agg.totalClicks += clicks

    const combinedScore = hScore + clicks
    if (combinedScore > agg.topProduct.score) {
      agg.topProduct = { id: product.id ?? '', title: product.title, score: combinedScore }
    }
  }

  return Array.from(aggMap.values()).map(agg => ({
    brand:           agg.brand,
    category:        agg.category,
    productCount:    agg.products.length,
    avgHealth:       agg.products.length > 0 ? Math.round(agg.healthSum / agg.products.length) : 0,
    totalClicks:     agg.totalClicks,
    topProductId:    agg.topProduct.id,
    topProductTitle: agg.topProduct.title,
  }))
}

// ── Main function ──────────────────────────────────────────────────────────────

export function generateDiscoverySuggestions(
  products: Product[],
  healthScores: ProductHealthScore[],
  engagementScores: EngagementScore[],
  options: { maxPerCategory?: number; maxTotal?: number } = {},
): DiscoverySuggestion[] {
  const { maxPerCategory = 3, maxTotal = 20 } = options

  const healthMap     = new Map(healthScores.map(h => [h.productId, h]))
  const engagementMap = new Map(engagementScores.map(e => [e.productId, e]))

  // Build brand profiles and sort by momentum (health × clicks)
  const profiles = buildBrandProfiles(products, healthMap, engagementMap)
    .filter(b => b.avgHealth >= 50)  // only suggest brands with decent health
    .sort((a, b) =>
      (b.avgHealth * Math.log1p(b.totalClicks)) -
      (a.avgHealth * Math.log1p(a.totalClicks)),
    )

  const suggestions: DiscoverySuggestion[] = []
  const perCatCount = new Map<string, number>()

  for (const profile of profiles) {
    if (suggestions.length >= maxTotal) break

    const catCount = perCatCount.get(profile.category) ?? 0
    if (catCount >= maxPerCategory) continue

    // Find the top product in this brand+category to generate a query
    const topProduct = products.find(p => p.id === profile.topProductId)
    if (!topProduct) continue

    // Build a search query (reuse repair candidate search query builder)
    const query = buildSearchQuery(topProduct)
    if (!query || query.length < 3) continue

    const potential: DiscoverySuggestion['potential'] =
      profile.avgHealth >= 75 && profile.totalClicks > 5 ? 'high' :
      profile.avgHealth >= 60 ? 'medium' : 'low'

    const catName = CATEGORIES.find(c => c.slug === profile.category)?.name ?? profile.category

    suggestions.push({
      suggestedQuery:  query,
      category:        profile.category,
      rationale:       `${profile.brand} has ${profile.productCount} product(s) in ${catName} with avg health ${profile.avgHealth}/100 and ${profile.totalClicks} clicks`,
      sourceProductId: profile.topProductId,
      brand:           profile.brand,
      potential,
    })

    perCatCount.set(profile.category, catCount + 1)
  }

  return suggestions
}
