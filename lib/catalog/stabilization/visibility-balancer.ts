/**
 * lib/catalog/stabilization/visibility-balancer.ts
 *
 * Analyzes the current tier distribution to detect over-suppression and
 * compute visibility health status.
 *
 * Thresholds (all based on visible product percentage):
 *   healthy        — ≥60% visible
 *   degraded       — 30–59% visible
 *   critical       — 10–29% visible
 *   over-suppressed — <10% visible
 *
 * SERVER-ONLY.
 */

import { getAllProducts }            from '@/data/catalog'
import { computeCatalogVisibility } from '@/lib/catalog/trust/visibility-engine'
import type { VisibilityHealthStatus, VisibilityRatios } from './types'

// ── Thresholds ─────────────────────────────────────────────────────────────────

const HEALTHY_VISIBLE_PCT      = 60
const DEGRADED_VISIBLE_PCT     = 30
const CRITICAL_VISIBLE_PCT     = 10

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Computes the current visibility ratios across all tier levels.
 * Returns counts, percentages, and health status.
 */
export function computeVisibilityRatios(): VisibilityRatios {
  const products = getAllProducts()
  const results  = computeCatalogVisibility(products)

  const total      = results.length
  let active = 0, warning = 0, degraded = 0, suppressed = 0

  for (const r of results) {
    switch (r.tier) {
      case 'active':    active++;    break
      case 'warning':   warning++;   break
      case 'degraded':  degraded++;  break
      case 'suppressed': suppressed++; break
    }
  }

  const visible = active + warning + degraded

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100 * 10) / 10 : 0

  return {
    total,
    visible,
    suppressed,
    active,
    warning,
    degraded,
    visiblePct:    pct(visible),
    suppressedPct: pct(suppressed),
    activePct:     pct(active),
    warningPct:    pct(warning),
    degradedPct:   pct(degraded),
  }
}

/**
 * Classifies the catalog's visibility health based on current ratios.
 */
export function classifyVisibilityHealth(ratios: VisibilityRatios): VisibilityHealthStatus {
  if (ratios.visiblePct < CRITICAL_VISIBLE_PCT)  return 'over-suppressed'
  if (ratios.visiblePct < DEGRADED_VISIBLE_PCT)  return 'critical'
  if (ratios.visiblePct < HEALTHY_VISIBLE_PCT)   return 'degraded'
  return 'healthy'
}

/**
 * Computes a visibility health score (0–100) for use in the composite
 * CatalogHealthScore. Full credit at ≥60% visible.
 */
export function computeVisibilityHealth(ratios: VisibilityRatios): number {
  // Linear interpolation: 0% visible → score 0, 60%+ visible → score 100
  return Math.min(100, Math.round((ratios.visiblePct / HEALTHY_VISIBLE_PCT) * 100))
}
