/**
 * lib/catalog/intelligence/suppression-engine.ts
 *
 * Identifies products that should be suppressed (hidden from public catalog).
 *
 * Suppression candidates are products that fail multiple quality signals
 * simultaneously. This engine produces a QUEUE — it does NOT auto-apply.
 * Actions require admin confirmation or a scheduled job call to
 * POST /api/catalog/repair/run with the relevant product IDs.
 *
 * Suppression rules (checked in priority order):
 *   CRITICAL:
 *     - Open repair failure + health < 40
 *     - Quarantined state (already in quarantine; this is just informational)
 *     - Invalid image (P/ format) + invalid ASIN + health < 35
 *   HIGH:
 *     - Archived lifecycle (inactive + no engagement)
 *     - Health < 25 (deeply unhealthy)
 *     - Colombia restricted + status not inactive (leaking through filter)
 *   MEDIUM:
 *     - Stale lifecycle + health < 50 + old lastValidated (>90 days)
 *     - Declining + zero engagement + health < 45
 */

import type { Product } from '@/types'
import type { FailureEntry } from '@/lib/catalog/repair/types'
import type { ProductHealthScore, ProductLifecycleState, SuppressionCandidate } from './types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function ageDays(iso: string | undefined): number {
  if (!iso) return 999
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

// ── Main function ──────────────────────────────────────────────────────────────

export function computeSuppressionQueue(
  products: Product[],
  healthScores: ProductHealthScore[],
  lifecycleStates: Record<string, ProductLifecycleState>,
  openFailures: FailureEntry[],
): SuppressionCandidate[] {
  const healthMap  = new Map(healthScores.map(h => [h.productId, h]))
  const failureSet = new Set(openFailures.map(f => f.productId))

  const queue: SuppressionCandidate[] = []
  const seen = new Set<string>()

  function addCandidate(
    product: Product,
    health: ProductHealthScore,
    lifecycle: ProductLifecycleState,
    reason: string,
    severity: SuppressionCandidate['severity'],
  ) {
    const id = product.id ?? ''
    if (seen.has(id)) return  // already queued at higher severity
    seen.add(id)
    queue.push({
      productId:      id,
      asin:           product.asin ?? '',
      title:          product.title,
      category:       product.category,
      reason,
      healthScore:    health.total,
      lifecycleState: lifecycle,
      severity,
    })
  }

  for (const product of products) {
    const id       = product.id ?? ''
    const health   = healthMap.get(id)
    const lifecycle = lifecycleStates[id]

    if (!health) continue
    // Skip already quarantined — handled by audit system
    if (lifecycle === 'quarantined') continue

    // ── CRITICAL rules ──────────────────────────────────────────────────────
    if (failureSet.has(id) && health.total < 40) {
      addCandidate(product, health, lifecycle, 'Repair failure + health < 40', 'critical')
      continue
    }

    if (
      health.breakdown.imageScore === 0 &&
      health.breakdown.asinScore === 0 &&
      health.total < 35
    ) {
      addCandidate(product, health, lifecycle, 'Invalid image + invalid ASIN + critically low health', 'critical')
      continue
    }

    // ── HIGH rules ──────────────────────────────────────────────────────────
    if (lifecycle === 'archived') {
      addCandidate(product, health, lifecycle, 'Archived: inactive status + zero engagement', 'high')
      continue
    }

    if (health.total < 25) {
      addCandidate(product, health, lifecycle, `Health score critically low (${health.total}/100)`, 'high')
      continue
    }

    if (product.colombiaRestriction && product.status !== 'inactive') {
      addCandidate(product, health, lifecycle, `Colombia restriction: ${product.colombiaRestriction}`, 'high')
      continue
    }

    // ── MEDIUM rules ────────────────────────────────────────────────────────
    if (
      lifecycle === 'stale' &&
      health.total < 50 &&
      ageDays(product.lastValidated) > 90
    ) {
      addCandidate(product, health, lifecycle, 'Stale + low health + not validated in >90 days', 'medium')
      continue
    }

    if (
      lifecycle === 'declining' &&
      health.breakdown.engagementScore === 0 &&
      health.total < 45
    ) {
      addCandidate(product, health, lifecycle, 'Declining lifecycle + zero engagement + low health', 'medium')
    }
  }

  // Sort: critical → high → medium, then by health asc (worst first)
  const severityOrder = { critical: 0, high: 1, medium: 2 }
  return queue.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      a.healthScore - b.healthScore,
  )
}
