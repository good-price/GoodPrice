/**
 * lib/catalog/stabilization/execution-analyzer.ts
 *
 * Analyzes what's recoverable in the current catalog state and generates
 * a human-readable operational recommendations set.
 *
 * This module ties together all sub-dimensions into actionable insights:
 *   1. Reads current tier distribution + suppression pressure
 *   2. Identifies which automated actions would have the highest impact
 *   3. Returns ranked StabilizationRecommendation[] for the admin dashboard
 *
 * SERVER-ONLY.
 */

import { computeVisibilityRatios } from './visibility-balancer'
import { computeSuppressionPressure }                        from './suppression-balancer'
import { buildPricingHealthReport }                          from './stale-pricing'
import { getTrmStatus }                                      from './trm-engine'
import { generateRecoveryRecommendations }                   from './public-recovery'
import type {
  StabilizationRecommendation,
  VisibilityRatios,
} from './types'

// ── Recommendation deduplication ──────────────────────────────────────────────

function dedupeRecommendations(
  recs: StabilizationRecommendation[],
): StabilizationRecommendation[] {
  const seen = new Set<string>()
  return recs.filter(r => {
    const key = r.type
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Priority sorter ────────────────────────────────────────────────────────────

const PRIORITY_ORDER = { immediate: 0, high: 1, medium: 2, low: 3 } as const

function sortRecommendations(
  recs: StabilizationRecommendation[],
): StabilizationRecommendation[] {
  return [...recs].sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  )
}

// ── Additional signal-based recommendations ────────────────────────────────────

function maybeTrmRecommendation(
  recs: StabilizationRecommendation[],
): StabilizationRecommendation[] {
  const status = getTrmStatus()
  if (status.freshnessLabel !== 'stale' && !status.isFallback) return recs

  const trmRec: StabilizationRecommendation = {
    type:        'update-trm',
    priority:    status.isFallback ? 'high' : 'medium',
    title:       status.isFallback
      ? 'TRM no disponible — actualizar urgente'
      : `TRM desactualizado (${status.ageHours}h) — actualizar`,
    description: 'La tasa representativa del mercado se usa para convertir precios USD a COP. Una TRM obsoleta muestra precios incorrectos.',
    endpoint:    '/api/currency/update',
    method:      'POST',
    body:        {},
    impact:      'Todos los precios COP del catálogo se recalcularán con la TRM correcta.',
  }

  // Only add if not already present
  if (!recs.some(r => r.type === 'update-trm')) {
    return [...recs, trmRec]
  }
  return recs
}

function maybePricingRecommendation(
  recs: StabilizationRecommendation[],
): StabilizationRecommendation[] {
  const report = buildPricingHealthReport()
  if (report.unreliablePct < 20) return recs  // pricing is fine

  const rec: StabilizationRecommendation = {
    type:        'revalidate-pricing',
    priority:    report.unreliablePct >= 50 ? 'high' : 'medium',
    title:       `${report.unreliableCount} productos con precios poco confiables (${report.unreliablePct}%)`,
    description: [
      report.staleCount       > 0 ? `${report.staleCount} sin validar en 7+ días` : '',
      report.fakDiscountCount > 0 ? `${report.fakDiscountCount} con posible descuento falso` : '',
      report.driftedCount     > 0 ? `${report.driftedCount} con deriva de precio >30%` : '',
    ].filter(Boolean).join(' · '),
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'live-truth' },
    impact:      'Mejora la accuracy del catálogo y reduce badge PRICE_UPDATE en productos.',
  }

  if (!recs.some(r => r.type === 'revalidate-pricing')) {
    return [...recs, rec]
  }
  return recs
}

function maybeRevalidateDegraded(
  recs: StabilizationRecommendation[],
  ratios: VisibilityRatios,
): StabilizationRecommendation[] {
  if (ratios.degraded === 0) return recs

  const rec: StabilizationRecommendation = {
    type:        'revalidate-degraded',
    priority:    ratios.degraded >= 10 ? 'medium' : 'low',
    title:       `${ratios.degraded} productos en tier degraded — revalidar`,
    description: 'Los productos degradados son visibles pero con reducción de ranking. Una revalidación exitosa los promueve a tier warning o active.',
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'trust-recompute' },
    impact:      `Puede mejorar el ranking de hasta ${ratios.degraded} productos actualmente penalizados.`,
  }

  if (!recs.some(r => r.type === 'revalidate-degraded')) {
    return [...recs, rec]
  }
  return recs
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Analyzes the full catalog state and returns a prioritized set of
 * recommendations for the admin stabilization dashboard.
 */
export function analyzeAndRecommend(): StabilizationRecommendation[] {
  const ratios   = computeVisibilityRatios()
  const pressure = computeSuppressionPressure(ratios)

  // Start with visibility-based recommendations
  let recs = generateRecoveryRecommendations(ratios, pressure)

  // Augment with signal-specific recommendations
  recs = maybeTrmRecommendation(recs)
  recs = maybePricingRecommendation(recs)
  recs = maybeRevalidateDegraded(recs, ratios)

  // Deduplicate (by type) then sort
  recs = dedupeRecommendations(recs)
  recs = sortRecommendations(recs)

  // Cap at 8 recommendations to keep the dashboard focused
  return recs.slice(0, 8)
}

/**
 * Returns a count of recoverable suppressions across the catalog.
 * Used for the health dashboard summary.
 */
export function getRecoverableSuppressionCount(): number {
  const ratios   = computeVisibilityRatios()
  const pressure = computeSuppressionPressure(ratios)
  return pressure.recoverableCount
}

/**
 * Returns a human-readable severity label for the current catalog state.
 */
export function getCatalogHealthLabel(overallScore: number): string {
  if (overallScore >= 80) return 'Saludable'
  if (overallScore >= 60) return 'Aceptable'
  if (overallScore >= 40) return 'Degradado'
  if (overallScore >= 20) return 'Crítico'
  return 'Emergencia'
}
