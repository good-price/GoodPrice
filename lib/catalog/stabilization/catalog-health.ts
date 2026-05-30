/**
 * lib/catalog/stabilization/catalog-health.ts
 *
 * Computes the composite CatalogHealthScore (0–100) from all sub-dimensions.
 *
 * Score dimensions (weights):
 *   visibilityHealth   20%  — % products visible
 *   suppressionHealth  20%  — inverse suppression pressure
 *   pricingHealth      20%  — inverse unreliable pricing %
 *   linkHealth         15%  — % links alive
 *   colombiaHealth     15%  — % confirmed shippable to Colombia
 *   trmHealth          10%  — TRM exchange rate freshness
 *
 * All sub-scores are 0–100 before weighting.
 * The composite score is a weighted sum rounded to the nearest integer.
 *
 * SERVER-ONLY.
 */

import { getAllProducts }                from '@/data/catalog'
import { analyseCatalogLinkHealth }     from '@/lib/catalog/link-health'
import { analyseCatalogColombiaAvailability } from '@/lib/catalog/colombia-availability'
import { computeVisibilityRatios, computeVisibilityHealth } from './visibility-balancer'
import { computeSuppressionPressure, computeSuppressionHealth } from './suppression-balancer'
import { buildPricingHealthReport, computePricingHealth }   from './stale-pricing'
import { computeTrmHealth }             from './trm-engine'
import type { CatalogHealthScore }      from './types'

// ── Weights ────────────────────────────────────────────────────────────────────

const WEIGHT_VISIBILITY   = 0.20
const WEIGHT_SUPPRESSION  = 0.20
const WEIGHT_PRICING      = 0.20
const WEIGHT_LINK         = 0.15
const WEIGHT_COLOMBIA     = 0.15
const WEIGHT_TRM          = 0.10

// ── Link & Colombia sub-scores ────────────────────────────────────────────────

function computeLinkHealth(products: ReturnType<typeof getAllProducts>): number {
  try {
    const report = analyseCatalogLinkHealth(products)
    if (report.total === 0) return 50
    return Math.round(report.livePct)
  } catch {
    return 50  // unavailable — neutral score
  }
}

function computeColombiaHealth(products: ReturnType<typeof getAllProducts>): number {
  try {
    const report = analyseCatalogColombiaAvailability(products)
    if (report.total === 0) return 50
    return Math.round(report.compatiblePct)
  } catch {
    return 50  // unavailable — neutral score
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes the full catalog health score from all dimensions.
 * This is the single source of truth for the health composite.
 */
export function computeCatalogHealthScore(): CatalogHealthScore {
  const products = getAllProducts()

  const ratios          = computeVisibilityRatios()
  const pressure        = computeSuppressionPressure(ratios)
  const pricingReport   = buildPricingHealthReport()

  const visibilityHealth  = computeVisibilityHealth(ratios)
  const suppressionHealth = computeSuppressionHealth(pressure)
  const pricingHealth     = computePricingHealth(pricingReport)
  const linkHealth        = computeLinkHealth(products)
  const colombiaHealth    = computeColombiaHealth(products)
  const trmHealth         = computeTrmHealth()

  const overall = Math.round(
    visibilityHealth  * WEIGHT_VISIBILITY  +
    suppressionHealth * WEIGHT_SUPPRESSION +
    pricingHealth     * WEIGHT_PRICING     +
    linkHealth        * WEIGHT_LINK        +
    colombiaHealth    * WEIGHT_COLOMBIA    +
    trmHealth         * WEIGHT_TRM,
  )

  return {
    overall:           Math.min(100, Math.max(0, overall)),
    visibilityHealth,
    suppressionHealth,
    pricingHealth,
    linkHealth,
    colombiaHealth,
    trmHealth,
    computedAt:        new Date().toISOString(),
  }
}
