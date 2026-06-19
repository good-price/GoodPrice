/**
 * lib/catalog/product-intelligence/builder.ts
 *
 * Pure builder functions — no I/O — Sprint 5A.
 *
 * buildProductBadges(intelligence):
 *   Produces up to 4 badges in priority order:
 *     critical > top-opportunity > recommended > price-drop > high-confidence > best-value
 *
 * Thresholds:
 *   recommended:      recommendationScore >= 80
 *   top-opportunity:  opportunityScore    >= 75
 *   price-drop:       trend === 'falling'
 *   high-confidence:  confidenceScore     >= 80
 *   best-value:       qualityScore        >= 80
 *   critical:         lifecycle           === 'critical'
 *
 * SERVER-ONLY.
 */

import type { ProductBadge, BadgeType } from './types'

const MAX_BADGES = 4

interface BadgeInput {
  recommendationScore: number
  opportunityScore:    number
  confidenceScore:     number
  qualityScore:        number
  trend:               'rising' | 'falling' | 'stable'
  lifecycle:           'healthy' | 'aging' | 'stale' | 'critical'
}

const BADGE_LABELS: Record<BadgeType, string> = {
  'critical':         'Ciclo crítico',
  'top-opportunity':  'Top oportunidad',
  'recommended':      'Recomendado',
  'price-drop':       'Precio bajando',
  'high-confidence':  'Alta confianza',
  'best-value':       'Mejor relación calidad',
}

export function buildProductBadges(input: BadgeInput): ProductBadge[] {
  const candidates: ProductBadge[] = []

  // Priority 1 — critical lifecycle (operator warning)
  if (input.lifecycle === 'critical') {
    candidates.push({ type: 'critical', label: BADGE_LABELS['critical'] })
  }

  // Priority 2 — top-opportunity
  if (input.opportunityScore >= 75) {
    candidates.push({ type: 'top-opportunity', label: BADGE_LABELS['top-opportunity'] })
  }

  // Priority 3 — recommended
  if (input.recommendationScore >= 80) {
    candidates.push({ type: 'recommended', label: BADGE_LABELS['recommended'] })
  }

  // Priority 4 — price-drop
  if (input.trend === 'falling') {
    candidates.push({ type: 'price-drop', label: BADGE_LABELS['price-drop'] })
  }

  // Priority 5 — high-confidence
  if (input.confidenceScore >= 80) {
    candidates.push({ type: 'high-confidence', label: BADGE_LABELS['high-confidence'] })
  }

  // Priority 6 — best-value
  if (input.qualityScore >= 80) {
    candidates.push({ type: 'best-value', label: BADGE_LABELS['best-value'] })
  }

  return candidates.slice(0, MAX_BADGES)
}
