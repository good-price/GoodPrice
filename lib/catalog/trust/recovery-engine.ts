/**
 * lib/catalog/trust/recovery-engine.ts
 *
 * Identifies suppressed products that are candidates for visibility recovery.
 *
 * A product is a recovery candidate when:
 *   — It is currently suppressed, AND
 *   — Its suppression could be reversed without manual intervention
 *
 * Recovery pathways:
 *   Gate 9  → Link dead for 1st time only: re-auditing the Amazon link
 *             might confirm the product is alive again.
 *   Gate 10 → Colombia audit re-run might confirm availability.
 *   Gate 11 → Healing suppression within the 7-day window can be resolved
 *             by running a live-truth validation cycle.
 *   Gate 7  → Products with borderline consecutive failures (scores near
 *             the threshold) may recover with a fresh audit run.
 *
 * Products suppressed by hard gates (1-5E, 8) are NOT recovery candidates —
 * those require manual action (edit catalog data, remove quarantine, etc.).
 *
 * SERVER-ONLY.
 */

import { computeLinkHealth }             from '@/lib/catalog/link-health'
import { computeColombiaAvailability }   from '@/lib/catalog/colombia-availability'
import type { Product }                  from '@/types'
import type {
  VisibilityContext,
  VisibilityResult,
  RecoveryCandidate,
  VisibilityTier,
  ConfidenceLevel,
} from './types'
import {
  DEAD_LINK_SUPPRESS_CONSECUTIVE,
  HEALING_EXTEND_SUPPRESS_DAYS,
  CRITICAL_AUDIT_SCORE,
} from './suppression-engine'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Audit score range considered borderline (may recover with fresh audit) */
const BORDERLINE_SCORE_RANGE = 15  // within 15pts of threshold

const HEALING_EXTEND_MS = HEALING_EXTEND_SUPPRESS_DAYS * 86_400_000

// ── Evaluators ────────────────────────────────────────────────────────────────

function analyseLinkRecovery(
  product: Product,
): RecoveryCandidate | null {
  if (!product.id || !product.asin) return null
  const entry = computeLinkHealth(product.id)
  if (!entry || entry.status !== 'dead') return null

  // Only if it was suppressed exactly because of link health (consecutive fails >= threshold)
  if (entry.consecutiveFails < DEAD_LINK_SUPPRESS_CONSECUTIVE) return null

  // If it's been exactly at the threshold (not far beyond), re-audit may recover it
  if (entry.consecutiveFails <= DEAD_LINK_SUPPRESS_CONSECUTIVE + 1) {
    return {
      productId:   product.id,
      asin:        product.asin,
      currentTier: 'suppressed',
      targetTier:  'warning',
      reason:      `Dead link suppression based on ${entry.consecutiveFails} consecutive checks — Amazon link re-audit may restore visibility`,
      confidence:  'medium',
    }
  }
  return null
}

function analyseColombiaRecovery(
  product: Product,
): RecoveryCandidate | null {
  if (!product.id || !product.asin) return null
  const entry = computeColombiaAvailability(product.id)

  // Colombia recovery applies to DEGRADED products (not suppressed) — these can be re-audited
  // But if a product with colombia-unavailable has OTHER suppression signals, it stays suppressed
  if (!entry || entry.status !== 'unavailable') return null

  if (entry.consecutiveFails <= 2) {
    return {
      productId:   product.id,
      asin:        product.asin,
      currentTier: 'degraded',
      targetTier:  'active',
      reason:      `Colombia availability uncertain (${entry.consecutiveFails} consecutive fails) — re-audit may confirm availability`,
      confidence:  'low',
    }
  }
  return null
}

function analyseHealingRecovery(
  product: Product,
  context: VisibilityContext,
): RecoveryCandidate | null {
  if (!product.id || !product.asin) return null
  const healingEntry = context.healingEntries.get(product.id)
  if (!healingEntry) return null

  const age = Date.now() - new Date(healingEntry.suppressedAt).getTime()

  // If extended suppression (> 7d) — hard suppressed, but close to threshold → review
  const isExtended = age >= HEALING_EXTEND_MS
  if (isExtended) {
    const days = Math.round(age / 86_400_000)
    if (days < HEALING_EXTEND_SUPPRESS_DAYS + 14) {
      // Recently crossed the threshold — live-truth run may recover
      return {
        productId:   product.id,
        asin:        product.asin,
        currentTier: 'suppressed',
        targetTier:  'degraded',
        reason:      `Extended healing suppression (${days}d) — running live-truth validation may recover to degraded tier`,
        confidence:  'low',
      }
    }
  } else {
    // Within window — already in degraded tier, but close products to recovery
    if (healingEntry.truthScore >= 50) {
      return {
        productId:   product.id,
        asin:        product.asin,
        currentTier: 'degraded',
        targetTier:  'active',
        reason:      `Healing suppression with truth score ${healingEntry.truthScore} — re-validation likely to recover`,
        confidence:  'medium',
      }
    }
  }
  return null
}

function analyseAuditRecovery(
  product: Product,
  context: VisibilityContext,
): RecoveryCandidate | null {
  if (!product.id || !product.asin) return null
  const history = context.auditHistory.get(product.id)
  if (!history || history.length < 2) return null

  const allCritical = history.every(s => s < CRITICAL_AUDIT_SCORE)
  if (!allCritical) return null

  // Check if scores are borderline (near threshold)
  const worstScore = Math.min(...history)
  if (worstScore >= CRITICAL_AUDIT_SCORE - BORDERLINE_SCORE_RANGE) {
    return {
      productId:   product.id,
      asin:        product.asin,
      currentTier: 'suppressed',
      targetTier:  'warning',
      reason:      `Consecutive audit failures (scores: ${history.join(', ')}) are borderline — fresh audit may recover`,
      confidence:  'low',
    }
  }
  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Finds products that could realistically be recovered from suppression or
 * promoted to a better tier with automated action (re-audit, re-validation).
 */
export function findRecoveryCandidates(
  products: Product[],
  results:  VisibilityResult[],
  context:  VisibilityContext,
): RecoveryCandidate[] {
  const candidates: RecoveryCandidate[] = []
  const resultMap = new Map(results.map(r => [r.productId, r]))

  for (const product of products) {
    if (!product.id) continue
    const result = resultMap.get(product.id)
    if (!result) continue

    // Only analyse suppressed and degraded products
    if (result.tier !== 'suppressed' && result.tier !== 'degraded') continue

    const candidate =
      analyseLinkRecovery(product) ??
      analyseHealingRecovery(product, context) ??
      analyseAuditRecovery(product, context) ??
      analyseColombiaRecovery(product)

    if (candidate) candidates.push(candidate)
  }

  // Sort by confidence (medium first) then by target tier (better tier first)
  const confRank: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2, failed: 3 }
  const tierRank: Record<VisibilityTier, number>  = { active: 0, warning: 1, degraded: 2, suppressed: 3 }

  candidates.sort((a, b) => {
    const confDiff = confRank[a.confidence] - confRank[b.confidence]
    if (confDiff !== 0) return confDiff
    return tierRank[a.targetTier] - tierRank[b.targetTier]
  })

  return candidates
}
