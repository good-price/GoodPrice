/**
 * lib/catalog/alerts/engine.ts
 *
 * Alert generation rules — pure logic, no I/O — Sprint 4F.
 *
 * Alert conditions (evaluated per ASIN):
 *   price-drop        — trend === 'falling'
 *                       severity: opportunity >= 70 → high, else medium
 *   high-opportunity  — opportunityScore >= 70
 *                       severity: high
 *   critical-lifecycle — lifecycleHealth === 'critical'
 *                       severity: high
 *   low-confidence    — confidenceScore < 35
 *                       severity: medium
 *   replacement-needed — needsReplacement === true
 *                       severity: high
 *
 * A product can trigger multiple alerts simultaneously (one per type).
 *
 * SERVER-ONLY.
 */

import type { AlertType, AlertSeverity, ProductAlert } from './types'
import type { LifecycleHealth } from '@/lib/catalog/lifecycle/types'

export interface AlertInput {
  asin:             string
  category:         string
  trend:            'rising' | 'falling' | 'stable'
  opportunityScore: number
  confidenceScore:  number
  lifecycleHealth:  LifecycleHealth
  needsReplacement: boolean
}

export interface PendingAlert {
  type:     AlertType
  severity: AlertSeverity
  message:  string
}

/**
 * Evaluates all alert conditions for one product.
 * Returns a list of pending alerts (may be empty, may be several).
 * Does NOT check for duplicates — dedup is done by the caller.
 */
export function evaluateAlertConditions(input: AlertInput): PendingAlert[] {
  const {
    trend, opportunityScore, confidenceScore,
    lifecycleHealth, needsReplacement,
  } = input

  const pending: PendingAlert[] = []

  // price-drop
  if (trend === 'falling') {
    const severity: AlertSeverity = opportunityScore >= 70 ? 'high' : 'medium'
    pending.push({
      type:     'price-drop',
      severity,
      message:  `Precio bajando${opportunityScore >= 70 ? ' — excelente oportunidad de compra' : ''} (oportunidad: ${opportunityScore})`,
    })
  }

  // high-opportunity
  if (opportunityScore >= 70) {
    pending.push({
      type:     'high-opportunity',
      severity: 'high',
      message:  `Precio cerca de mínimo histórico (oportunidad: ${opportunityScore})`,
    })
  }

  // critical-lifecycle
  if (lifecycleHealth === 'critical') {
    pending.push({
      type:     'critical-lifecycle',
      severity: 'high',
      message:  'Ciclo de vida crítico — el producto necesita reemplazo o revalidación urgente',
    })
  }

  // low-confidence
  if (confidenceScore < 35) {
    pending.push({
      type:     'low-confidence',
      severity: 'medium',
      message:  `Confianza baja (${confidenceScore}) — verificar datos del producto`,
    })
  }

  // replacement-needed
  if (needsReplacement) {
    pending.push({
      type:     'replacement-needed',
      severity: 'high',
      message:  'Producto marcado para reemplazo — buscar candidato alternativo',
    })
  }

  return pending
}

/**
 * Builds a dedup key that uniquely identifies an active alert for a product+type.
 * Used to prevent duplicate unresolved alerts.
 */
export function alertDedupKey(asin: string, type: AlertType): string {
  return `${asin}:${type}`
}

/**
 * Builds a new ProductAlert from pending data.
 * id is generated from asin + type + timestamp for uniqueness.
 */
export function buildAlert(
  asin:    string,
  category: string,
  pending: PendingAlert,
  now:     string,
): ProductAlert {
  return {
    id:         `alert-${asin}-${pending.type}-${Date.now()}`,
    asin,
    category,
    type:       pending.type,
    severity:   pending.severity,
    message:    pending.message,
    createdAt:  now,
    resolvedAt: null,
  }
}
