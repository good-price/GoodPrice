/**
 * lib/catalog/trust/degradation-engine.ts
 *
 * Evaluates signals that result in DEGRADED or WARNING visibility tiers.
 *
 * Products in these tiers remain publicly visible but receive:
 *   WARNING  — visible with an informational badge, normal-ish ranking
 *   DEGRADED — visible with a stronger badge, reduced ranking priority
 *
 * This module only sees products that already cleared all suppression gates.
 * It evaluates the rebalanced gates:
 *
 *   Gate 5V★  — sub-quality image → WARNING (score 60–79) or DEGRADED (35–59)
 *   Gate 6★   — audit score below threshold → WARNING (50–69) or DEGRADED (<50)
 *   Gate 9★   — first confirmed dead link → WARNING
 *   Gate 10★  — Colombia unavailable → DEGRADED
 *   Gate 11★  — recent healing suppression (< 7d) → DEGRADED
 *
 * SERVER-ONLY.
 */

import { scoreImageUrl }            from '@/lib/catalog/image-health'
import { IMAGE_QUALITY_THRESHOLD }  from '@/lib/catalog/visual-quality'
import { computeLinkHealth }        from '@/lib/catalog/link-health'
import { isColombiaUnavailable }    from '@/lib/catalog/colombia-availability'
import type { Product }             from '@/types'
import type { VisibilitySignal, VisibilityContext, VisibilityTier } from './types'
import {
  CRITICAL_AUDIT_SCORE,
  HEALING_EXTEND_SUPPRESS_DAYS,
} from './suppression-engine'

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Audit scores in [WARN_AUDIT_SCORE, MIN_PUBLIC_SCORE) → WARNING tier */
export const WARN_AUDIT_SCORE = 50

/** Audit scores in [CRITICAL_AUDIT_SCORE, WARN_AUDIT_SCORE) → DEGRADED tier */
// (re-exported for shared use)
export { CRITICAL_AUDIT_SCORE }

/** Image score boundary: >= this → WARNING, below → DEGRADED (before quality gate) */
const IMAGE_WARN_BOUNDARY = 60

const HEALING_EXTEND_SUPPRESS_MS = HEALING_EXTEND_SUPPRESS_DAYS * 86_400_000

// ── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * Returns all degradation / warning signals for a product.
 * Call only after evaluateSuppressionSignals() finds no suppression.
 */
export function evaluateDegradationSignals(
  product: Product,
  context: VisibilityContext,
): VisibilitySignal[] {
  const signals: VisibilitySignal[] = []
  const id = product.id

  // ── Gate 5V★ (rebalanced) — image quality ─────────────────────────────────
  const imgResult = scoreImageUrl(product.image)
  const imgScore  = imgResult.score

  if (imgScore < IMAGE_QUALITY_THRESHOLD && !imgResult.suppressible) {
    const tier: VisibilityTier = imgScore >= IMAGE_WARN_BOUNDARY ? 'warning' : 'degraded'
    signals.push({
      gate:   'gate-5v',
      tier,
      reason: `Image CDN score ${imgScore}/100 below quality threshold ${IMAGE_QUALITY_THRESHOLD} (${imgResult.cdnType})`,
    })
  }

  // ── Gate 6★ (rebalanced) — audit score ────────────────────────────────────
  if (id) {
    const score = context.latestAuditScores.get(id)
    if (score !== undefined) {
      if (score < CRITICAL_AUDIT_SCORE) {
        // Only DEGRADED here; suppression requires consecutive failures (Gate 7 handles that)
        signals.push({
          gate:   'gate-6',
          tier:   'degraded',
          reason: `Audit score ${score} below critical threshold ${CRITICAL_AUDIT_SCORE}`,
        })
      } else if (score < WARN_AUDIT_SCORE) {
        signals.push({
          gate:   'gate-6',
          tier:   'degraded',
          reason: `Audit score ${score} in degraded range [${CRITICAL_AUDIT_SCORE}–${WARN_AUDIT_SCORE})`,
        })
      } else if (score < IMAGE_QUALITY_THRESHOLD) {
        // Score in [50, 80) → WARNING
        signals.push({
          gate:   'gate-6',
          tier:   'warning',
          reason: `Audit score ${score} below passing threshold 70`,
        })
      }
    }
  }

  // ── Gate 9★ (rebalanced) — first dead link ────────────────────────────────
  if (id) {
    const linkEntry = computeLinkHealth(id)
    if (linkEntry && linkEntry.status === 'dead' && linkEntry.consecutiveFails < 2) {
      signals.push({
        gate:   'gate-9',
        tier:   'warning',
        reason: `Dead Amazon link (1st detect, consecutiveFails=${linkEntry.consecutiveFails}) — pending re-audit`,
      })
    }
  }

  // ── Gate 10★ (rebalanced) — Colombia unavailable ──────────────────────────
  if (isColombiaUnavailable(id)) {
    signals.push({
      gate:   'gate-10',
      tier:   'degraded',
      reason: 'Product confirmed unavailable for Colombia shipping (Gate 10)',
    })
  }

  // ── Gate 11★ (rebalanced) — recent healing suppression ───────────────────
  if (id) {
    const healingEntry = context.healingEntries.get(id)
    if (healingEntry) {
      const age = Date.now() - new Date(healingEntry.suppressedAt).getTime()
      if (age < HEALING_EXTEND_SUPPRESS_MS) {
        const days = Math.round(age / 86_400_000)
        signals.push({
          gate:   'gate-11',
          tier:   'degraded',
          reason: `In healing suppression recovery window (${days}d / ${HEALING_EXTEND_SUPPRESS_DAYS}d max) — truth score ${healingEntry.truthScore}`,
        })
      }
    }
  }

  return signals
}
