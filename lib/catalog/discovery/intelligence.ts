/**
 * lib/catalog/discovery/intelligence.ts
 *
 * Quality Engine — Sprint 4C.
 *
 * computeQualityScore():
 *   Rates a candidate's intrinsic product quality based on rating, reviews,
 *   image, price, brand, and validation history. Returns 0-100.
 *
 * computeConfidenceScore():
 *   Rates how much we trust a candidate based on how often it has been
 *   discovered, validated, rejected, and admitted. Returns 0-100.
 *
 * Both functions are pure (no I/O). Never throw.
 * SERVER-ONLY.
 */

import type { DiscoveryCandidate } from './types'

// ── Quality Score (0-100) ─────────────────────────────────────────────────────

/**
 * Rates a candidate's intrinsic product quality.
 *
 * Weight breakdown:
 *   rating     (0–5)   → 0–30 pts   (6 pts per star)
 *   reviews    (0–∞)   → 0–25 pts   (log₁₀ scale, max at 10 000 reviews)
 *   image      present → +15 pts
 *   price      > 0     → +10 pts
 *   brand      present → +5 pts
 *   validated  ≥ 1     → +15 pts    (has passed quality checks before)
 *
 * Max: 30 + 25 + 15 + 10 + 5 + 15 = 100
 */
export function computeQualityScore(candidate: DiscoveryCandidate): number {
  try {
    let score = 0

    // Rating: 0-5 → 0-30 points
    const rating = candidate.rating ?? 0
    score += (rating / 5) * 30

    // Reviews: logarithmic scale → 0-25 points (100% at 10 000 reviews)
    const reviews = candidate.reviewCount ?? 0
    if (reviews > 0) {
      score += Math.min((Math.log10(reviews + 1) / Math.log10(10_001)) * 25, 25)
    }

    // Image present: +15 points
    if (candidate.imageUrl) score += 15

    // Price present: +10 points
    if ((candidate.tilePrice ?? 0) > 0) score += 10

    // Brand present: +5 points
    if (candidate.brand) score += 5

    // Validated at least once: +15 points (has survived quality checks)
    if ((candidate.timesValidated ?? 0) > 0) score += 15

    return Math.round(Math.max(0, Math.min(100, score)))
  } catch {
    return 0
  }
}

// ── Confidence Score (0-100) ──────────────────────────────────────────────────

/**
 * Rates how much we trust a candidate based on its discovery history.
 *
 * Weight breakdown:
 *   timesDiscovered → 0–40 pts   (log₁₀ scale, saturates at 10 discoveries)
 *   validation ratio (validated / (validated + rejected)) → 0–40 pts
 *   timesAdmitted ≥ 1 → +20 pts  (proof it was ever good enough to admit)
 *
 * Max: 40 + 40 + 20 = 100
 */
export function computeConfidenceScore(candidate: DiscoveryCandidate): number {
  try {
    const discovered = candidate.timesDiscovered ?? 0
    const validated  = candidate.timesValidated  ?? 0
    const rejected   = candidate.timesRejected   ?? 0
    const admitted   = candidate.timesAdmitted   ?? 0

    if (discovered === 0) return 0

    // Discovery frequency: 0-40 (log scale, 10+ discoveries = max)
    const discoverScore = Math.min(
      (Math.log10(discovered + 1) / Math.log10(11)) * 40,
      40,
    )

    // Validation ratio: proportion that passed vs. all quality checks seen
    const quality = validated + rejected
    const validationRatio = quality > 0 ? validated / quality : 0
    const validationScore = validationRatio * 40

    // Admission bonus: product was admitted to the runtime catalog before
    const admissionBonus = admitted > 0 ? 20 : 0

    return Math.round(Math.max(0, Math.min(100, discoverScore + validationScore + admissionBonus)))
  } catch {
    return 0
  }
}
