/**
 * lib/catalog/stabilization/public-recovery.ts
 *
 * Progressive recovery system — generates a ranked set of recovery
 * recommendations and executes targeted recovery for specific products.
 *
 * This module does NOT modify trust gate thresholds or suppression rules.
 * It works by triggering existing pipeline operations (link audit,
 * colombia audit, live-truth validation) targeting specific products.
 *
 * Recovery strategy (by tier):
 *   suppressed (gate-7)  → run trust-recompute after fresh audit
 *   suppressed (gate-9)  → run link audit targeting dead-link products
 *   suppressed (gate-11) → run live-truth validation
 *   degraded             → re-validate via colombia audit or live-truth
 *
 * SERVER-ONLY.
 */

import { computeVisibilityRatios, classifyVisibilityHealth } from './visibility-balancer'
import { computeSuppressionPressure }                        from './suppression-balancer'
import type { StabilizationRecommendation, VisibilityRatios, SuppressionPressure } from './types'

// ── Recommendation builders ────────────────────────────────────────────────────

function buildRunRecoveryPipeline(): StabilizationRecommendation {
  return {
    type:        'run-recovery-pipeline',
    priority:    'immediate',
    title:       'Ejecutar pipeline de recuperación completo',
    description: 'Corre trust-recompute → repair → live-truth → link-audit → colombia-audit → self-healing en secuencia.',
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { pipeline: 'recovery' },
    impact:      'Recupera entre 20–60% de productos suprimidos en una ejecución completa.',
  }
}

function buildRunLinkAudit(): StabilizationRecommendation {
  return {
    type:        'run-link-audit',
    priority:    'high',
    title:       'Auditar enlaces Amazon',
    description: 'Re-verifica los enlaces de productos con suppression por gate-9 (enlace muerto). Si el enlace está vivo nuevamente, la supresión se elimina.',
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'link-audit' },
    impact:      'Puede recuperar productos suprimidos por falsos positivos en la detección de enlace muerto.',
  }
}

function buildRunColombiaAudit(): StabilizationRecommendation {
  return {
    type:        'run-colombia-audit',
    priority:    'high',
    title:       'Auditar disponibilidad Colombia',
    description: 'Re-verifica disponibilidad de envío a Colombia. Productos degradados por gate-10 pueden pasar a active.',
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'colombia-audit' },
    impact:      'Puede recuperar productos degradados y mejorar la tasa de visibilidad.',
  }
}

function buildRunLiveTruth(): StabilizationRecommendation {
  return {
    type:        'run-live-truth',
    priority:    'medium',
    title:       'Ejecutar validación de verdad en vivo',
    description: 'Valida precios, títulos y disponibilidad contra Amazon en tiempo real. Elimina supresión por healing para productos recuperados.',
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'live-truth' },
    impact:      'Actualiza truth scores y puede liberar productos de la supresión de healing.',
  }
}

function buildRunTrustRecompute(): StabilizationRecommendation {
  return {
    type:        'run-recovery-pipeline',
    priority:    'medium',
    title:       'Recomputar scores de trust',
    description: 'Recalcula los tiers de visibilidad para todos los productos con los datos de auditoría más recientes.',
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'trust-recompute' },
    impact:      'Actualiza la distribución de tiers sin modificar las reglas de supresión.',
  }
}

function buildUpdateTrm(): StabilizationRecommendation {
  return {
    type:        'update-trm',
    priority:    'medium',
    title:       'Actualizar TRM (Tasa de cambio USD/COP)',
    description: 'Obtiene la tasa representativa del mercado actualizada del Banco de la República de Colombia.',
    endpoint:    '/api/currency/update',
    method:      'POST',
    body:        {},
    impact:      'Actualiza los precios en COP mostrados a usuarios colombianos.',
  }
}

function buildReduceSuppressionPressure(primaryGate: string): StabilizationRecommendation {
  const gateDescriptions: Record<string, string> = {
    'gate-7':  'Ejecuta una auditoría de producto para refrescar scores y potencialmente sacar productos de la supresión por gate-7.',
    'gate-9':  'Corre un link-audit para re-verificar los enlaces marcados como muertos.',
    'gate-11': 'Ejecuta live-truth validation para liberar productos de la supresión de healing.',
    'gate-10': 'Corre un colombia-audit para re-verificar disponibilidad.',
  }
  const desc = gateDescriptions[primaryGate] ?? `Investiga y trata la causa raíz de ${primaryGate}.`

  return {
    type:        'reduce-suppression-pressure',
    priority:    'high',
    title:       `Reducir presión de supresión (${primaryGate})`,
    description: desc,
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'trust-recompute' },
    impact:      `${primaryGate} es el gate con mayor número de supresiones — atacarlo primero maximiza la recuperación.`,
  }
}

function buildRevalidatePricing(): StabilizationRecommendation {
  return {
    type:        'revalidate-pricing',
    priority:    'medium',
    title:       'Revalidar precios del catálogo',
    description: 'Detecta precios obsoletos, descuentos falsos y deriva extrema. Actualiza los truth scores de pricing.',
    endpoint:    '/api/ops/run',
    method:      'POST',
    body:        { type: 'live-truth' },
    impact:      'Mejora la confiabilidad del catálogo para los usuarios y reduce productos con badge PRICE_UPDATE.',
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Generates a prioritized list of recovery recommendations based on current
 * catalog health state.
 */
export function generateRecoveryRecommendations(
  ratios:   VisibilityRatios,
  pressure: SuppressionPressure,
): StabilizationRecommendation[] {
  const recommendations: StabilizationRecommendation[] = []
  const status = classifyVisibilityHealth(ratios)

  // Critical / over-suppressed: always recommend the full pipeline first
  if (status === 'critical' || status === 'over-suppressed') {
    recommendations.push(buildRunRecoveryPipeline())
  }

  // High suppression pressure: target the primary gate
  if (pressure.level === 'critical' || pressure.level === 'high') {
    recommendations.push(buildReduceSuppressionPressure(pressure.primaryGate))
  }

  // Recoverable suppressions: targeted audits
  if (pressure.recoverableCount > 0) {
    const gateActions = new Set(
      pressure.breakdown
        .filter(b => b.recoverable)
        .map(b => b.reason)
    )
    if (gateActions.has('gate-9'))  recommendations.push(buildRunLinkAudit())
    if (gateActions.has('gate-10')) recommendations.push(buildRunColombiaAudit())
    if (gateActions.has('gate-11')) recommendations.push(buildRunLiveTruth())
    if (gateActions.has('gate-7'))  recommendations.push(buildRunTrustRecompute())
  }

  // Degraded catalog: healing or light recovery
  if (status === 'degraded') {
    if (!recommendations.some(r => r.type === 'run-recovery-pipeline')) {
      recommendations.push(buildRunRecoveryPipeline())
    }
  }

  // Always include pricing revalidation if not already too many recommendations
  if (recommendations.length < 4) {
    recommendations.push(buildRevalidatePricing())
  }

  // Always include TRM update as a low-cost maintenance action
  if (recommendations.length < 5) {
    recommendations.push(buildUpdateTrm())
  }

  // Deduplicate by type (keep first occurrence = highest priority)
  const seen = new Set<string>()
  return recommendations.filter(r => {
    const key = r.type + (r.body ? JSON.stringify(r.body) : '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Quick helper: re-computes ratios + pressure and builds recommendations.
 * Convenience for callers that don't already have the computed values.
 */
export function buildRecoveryRecommendations(): StabilizationRecommendation[] {
  const ratios   = computeVisibilityRatios()
  const pressure = computeSuppressionPressure(ratios)
  return generateRecoveryRecommendations(ratios, pressure)
}
