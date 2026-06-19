/**
 * lib/catalog/product-intelligence/reader.ts
 *
 * getProductIntelligence(asin) — Sprint 5A.
 *
 * Reads from four existing stores and assembles a ProductIntelligence profile:
 *   1. recommendations store  → recommendationScore, reasons, opportunity/confidence/quality
 *   2. lifecycle store        → lifecycle health, confidenceScore, qualityScore
 *   3. pricing-memory intel.  → trend, opportunityScore
 *   4. alerts store           → active (unresolved) alerts for this ASIN
 *
 * Never throws. Returns emptyIntelligence(asin) on any error.
 * All reads are fault-tolerant (the underlying stores never throw).
 *
 * SERVER-ONLY.
 */

import { readRecommendations }      from '@/lib/catalog/recommendations/state'
import { readLifecycleStore }       from '@/lib/catalog/lifecycle/state'
import { readProductIntelligence }  from '@/lib/catalog/pricing-memory/state'
import { readAlerts }               from '@/lib/catalog/alerts/state'
import { buildProductBadges }       from './builder'
import { emptyIntelligence }        from './types'
import type { ProductIntelligence } from './types'

export function getProductIntelligence(asin: string): ProductIntelligence {
  try {
    // ── Read all stores ────────────────────────────────────────────────────────
    const recStore      = readRecommendations()
    const lcStore       = readLifecycleStore()
    const intelStore    = readProductIntelligence()
    const alertStore    = readAlerts()

    // ── Extract per-product data ───────────────────────────────────────────────
    const rec   = recStore.products[asin]
    const lc    = lcStore.products[asin]
    const intel = intelStore.products[asin]

    // Active (unresolved) alerts for this ASIN
    const alerts = Object.values(alertStore.alerts).filter(
      a => a.asin === asin && a.resolvedAt === null,
    )

    // ── Compose scores with safe fallbacks ────────────────────────────────────
    const recommendationScore = rec?.recommendationScore ?? 0
    const opportunityScore    = rec?.opportunityScore    ?? intel?.opportunityScore ?? 0
    const confidenceScore     = rec?.confidenceScore     ?? lc?.confidenceScore    ?? 0
    const qualityScore        = rec?.qualityScore        ?? lc?.qualityScore       ?? 0
    const trend               = rec?.trend               ?? intel?.trend           ?? 'stable'
    const lifecycle           = lc?.health                                         ?? 'stale'

    const reasons = rec?.reasons ?? []

    // ── Build badges ──────────────────────────────────────────────────────────
    const badges = buildProductBadges({
      recommendationScore,
      opportunityScore,
      confidenceScore,
      qualityScore,
      trend,
      lifecycle,
    })

    return {
      asin,
      recommendationScore,
      opportunityScore,
      confidenceScore,
      qualityScore,
      trend,
      lifecycle,
      activeAlerts:          alerts.length,
      badges,
      recommendationReasons: reasons,
      alerts,
    }
  } catch {
    return emptyIntelligence(asin)
  }
}
