/**
 * lib/catalog/trust/public-score.ts
 *
 * Computes a composite public trust score (0–100) for each product.
 *
 * The public score reflects overall product reliability for display:
 *   - 80–100: Excellent — active tier products
 *   - 60–79:  Good      — warning tier products
 *   - 40–59:  Fair      — degraded tier products
 *   - 0–39:   Poor      — suppressed tier or severely degraded
 *
 * Dimension weights:
 *   Image quality    : 20 pts  (image CDN score → reliability of display)
 *   Audit quality    : 25 pts  (catalog audit reliability score)
 *   Link health      : 20 pts  (Amazon product page reachability)
 *   Colombia status  : 20 pts  (shippability to Colombian buyers)
 *   Truth & healing  : 15 pts  (live-truth validation state)
 *
 * Total: 100 pts
 *
 * SERVER-ONLY.
 */

import { scoreImageUrl }              from '@/lib/catalog/image-health'
import { computeLinkHealth }          from '@/lib/catalog/link-health'
import { computeColombiaAvailability } from '@/lib/catalog/colombia-availability'
import type { Product }               from '@/types'
import type { VisibilityContext }     from './types'

// ── Weights ───────────────────────────────────────────────────────────────────

const W_IMAGE    = 20
const W_AUDIT    = 25
const W_LINK     = 20
const W_COLOMBIA = 20
const W_TRUTH    = 15

// ── Dimension scorers ─────────────────────────────────────────────────────────

function scoreImage(product: Product): number {
  const imgResult = scoreImageUrl(product.image)
  // Map image CDN score (0-100) proportionally to dimension weight
  return (imgResult.score / 100) * W_IMAGE
}

function scoreAudit(product: Product, context: VisibilityContext): number {
  if (!product.id) return W_AUDIT * 0.5  // unknown → neutral
  const score = context.latestAuditScores.get(product.id)
  if (score === undefined) return W_AUDIT * 0.6  // unaudited → slightly above neutral
  return (score / 100) * W_AUDIT
}

function scoreLinkHealth(product: Product): number {
  if (!product.id) return W_LINK * 0.5  // unknown
  const entry = computeLinkHealth(product.id)
  if (!entry) return W_LINK * 0.6       // never audited → conservative pass

  switch (entry.status) {
    case 'alive':        return W_LINK            // full score
    case 'rate-limited': return W_LINK * 0.6      // blocked but not confirmed dead
    case 'unknown':      return W_LINK * 0.6      // never checked
    case 'dead': {
      // Penalise proportional to consecutive failures
      const penalty = Math.min(entry.consecutiveFails, 3) / 3
      return W_LINK * (1 - penalty)
    }
  }
}

function scoreColombia(product: Product): number {
  if (!product.id) return W_COLOMBIA * 0.5

  const entry = computeColombiaAvailability(product.id)
  if (!entry) return W_COLOMBIA * 0.6   // never audited → pass by default

  // Prefer catalog-field 'available' signals
  if (product.shipsToColombiaConfirmed === true) return W_COLOMBIA

  switch (entry.status) {
    case 'available':    return W_COLOMBIA
    case 'rate-limited': return W_COLOMBIA * 0.7
    case 'unknown':      return W_COLOMBIA * 0.7
    case 'unavailable':  return W_COLOMBIA * 0.15  // still gets a few pts (product exists)
  }
}

function scoreTruth(product: Product, context: VisibilityContext): number {
  if (!product.id) return W_TRUTH * 0.5

  const healingEntry = context.healingEntries.get(product.id)

  if (!healingEntry) {
    // Not healing-suppressed → good signal
    // Bonus if product has a high truth score from live-truth
    return W_TRUTH
  }

  // In healing suppression
  const age  = Date.now() - new Date(healingEntry.suppressedAt).getTime()
  const days = age / 86_400_000
  const agePenalty = Math.min(days / 14, 1)   // linear penalty over 14 days

  const truthScore  = healingEntry.truthScore ?? 50
  const truthFactor = truthScore / 100

  return W_TRUTH * truthFactor * (1 - agePenalty * 0.8)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes the composite public trust score for a product.
 * Range: 0–100 (rounded to nearest integer).
 */
export function computePublicScore(
  product: Product,
  context: VisibilityContext,
): number {
  const raw =
    scoreImage(product) +
    scoreAudit(product, context) +
    scoreLinkHealth(product) +
    scoreColombia(product) +
    scoreTruth(product, context)

  return Math.max(0, Math.min(100, Math.round(raw)))
}
