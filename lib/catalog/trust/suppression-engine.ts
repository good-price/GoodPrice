/**
 * lib/catalog/trust/suppression-engine.ts
 *
 * Evaluates signals that result in the SUPPRESSED visibility tier.
 *
 * SUPPRESSED means completely hidden from all public surfaces.
 * Only confirmed, high-confidence failures warrant suppression.
 *
 * Suppression criteria (any one is sufficient):
 *   Gate 1  — product status is 'inactive'
 *   Gate 2  — explicit Colombia restriction flag
 *   Gate 3  — in human-curated quarantine list
 *   Gate 4  — ASIN format invalid or missing
 *   Gate 5  — image URL structurally invalid / missing
 *   Gate 5E — image URL is the 'P/' dead-ASIN pattern
 *   Gate 7  — 2+ consecutive audit scores below CRITICAL_AUDIT_SCORE
 *   Gate 8  — in intelligence CRITICAL suppression queue
 *   Gate 9★ — dead Amazon link with ≥ DEAD_LINK_SUPPRESS_CONSECUTIVE confirms
 *   Gate 11★— healing-suppressed for ≥ HEALING_EXTEND_SUPPRESS_DAYS (7d)
 *
 * (★) = rebalanced from original binary gate
 *
 * SERVER-ONLY.
 */

import { isInvalidImageUrl }        from '@/lib/catalog/placeholders'
import { isImageSuppressible }      from '@/lib/catalog/image-health'
import { isValidAsinFormat }        from '@/lib/catalog/validator'
import { computeLinkHealth }        from '@/lib/catalog/link-health'
import type { Product }             from '@/types'
import type { VisibilitySignal, VisibilityContext } from './types'

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Audit score below which consecutive failures trigger suppression */
export const CRITICAL_AUDIT_SCORE = 40

/** Number of consecutive dead-link checks before link suppression */
export const DEAD_LINK_SUPPRESS_CONSECUTIVE = 2

/** Days of healing suppression before transitioning to hard-suppressed */
export const HEALING_EXTEND_SUPPRESS_DAYS = 7
const HEALING_EXTEND_SUPPRESS_MS = HEALING_EXTEND_SUPPRESS_DAYS * 86_400_000

// ── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * Returns all suppression signals for a product.
 * An empty array means the product passes all suppression gates.
 */
export function evaluateSuppressionSignals(
  product: Product,
  context: VisibilityContext,
): VisibilitySignal[] {
  const signals: VisibilitySignal[] = []
  const id = product.id

  // Gate 1 — product status
  if (product.status === 'inactive') {
    signals.push({
      gate:   'gate-1',
      tier:   'suppressed',
      reason: 'Product status is inactive',
    })
  }

  // Gate 2 — Colombia restriction flag
  if (product.colombiaRestriction) {
    signals.push({
      gate:   'gate-2',
      tier:   'suppressed',
      reason: 'Explicit Colombia restriction on product',
    })
  }

  // Gate 3 — quarantine
  if (id && context.quarantinedIds.has(id)) {
    signals.push({
      gate:   'gate-3',
      tier:   'suppressed',
      reason: 'Product is in human-curated quarantine',
    })
  }

  // Gate 4 — ASIN format
  if (!product.asin || !isValidAsinFormat(product.asin)) {
    signals.push({
      gate:   'gate-4',
      tier:   'suppressed',
      reason: `Invalid or missing ASIN: "${product.asin ?? ''}"`,
    })
  }

  // Gate 5 — image URL structurally invalid
  if (isInvalidImageUrl(product.image)) {
    signals.push({
      gate:   'gate-5',
      tier:   'suppressed',
      reason: 'Image URL is structurally invalid or empty',
    })
  } else if (isImageSuppressible(product.image)) {
    // Gate 5E — P/ dead-ASIN pattern (only checked when URL is structurally valid)
    signals.push({
      gate:   'gate-5e',
      tier:   'suppressed',
      reason: 'Image URL indicates dead ASIN (images-na P/ pattern)',
    })
  }

  // Gate 7 — consecutive critical audit failures
  if (id) {
    const history = context.auditHistory.get(id)
    if (history && history.length >= 2) {
      const allCritical = history.every(s => s < CRITICAL_AUDIT_SCORE)
      if (allCritical) {
        signals.push({
          gate:   'gate-7',
          tier:   'suppressed',
          reason: `${history.length} consecutive audit scores below ${CRITICAL_AUDIT_SCORE} (latest: ${history[0]})`,
        })
      }
    }
  }

  // Gate 8 — intelligence CRITICAL suppression
  if (id && context.intelligenceSuppressedIds.has(id)) {
    signals.push({
      gate:   'gate-8',
      tier:   'suppressed',
      reason: 'Product flagged CRITICAL in intelligence suppression queue',
    })
  }

  // Gate 9★ — confirmed dead Amazon link (multiple checks)
  if (id) {
    const linkEntry = computeLinkHealth(id)
    if (linkEntry && linkEntry.status === 'dead' &&
        linkEntry.consecutiveFails >= DEAD_LINK_SUPPRESS_CONSECUTIVE) {
      signals.push({
        gate:   'gate-9',
        tier:   'suppressed',
        reason: `Dead Amazon link confirmed ${linkEntry.consecutiveFails}× (threshold: ${DEAD_LINK_SUPPRESS_CONSECUTIVE})`,
      })
    }
  }

  // Gate 11★ — extended healing suppression
  if (id) {
    const healingEntry = context.healingEntries.get(id)
    if (healingEntry) {
      const age = Date.now() - new Date(healingEntry.suppressedAt).getTime()
      if (age >= HEALING_EXTEND_SUPPRESS_MS) {
        const days = Math.round(age / 86_400_000)
        signals.push({
          gate:   'gate-11',
          tier:   'suppressed',
          reason: `Healing-suppressed for ${days}d (threshold: ${HEALING_EXTEND_SUPPRESS_DAYS}d) — truth score ${healingEntry.truthScore}`,
        })
      }
    }
  }

  return signals
}
