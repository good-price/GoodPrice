/**
 * lib/catalog/live-truth/truth-score.ts
 *
 * Composite truth score (0–100) from per-dimension validation results.
 *
 * Component maxima:
 *   title        → 30 pts  (product identity)
 *   pricing      → 25 pts  (price accuracy)
 *   availability → 25 pts  (can users buy it?)
 *   image        → 10 pts  (visual identity)
 *   freshness    → 10 pts  (how recently was this validated?)
 *
 * Total: 100 pts
 *
 * Freshness scoring:
 *   < 6 h    → 10 pts
 *   < 24 h   → 8 pts
 *   < 3 d    → 5 pts
 *   < 7 d    → 3 pts
 *   ≥ 7 d    → 0 pts  (stale)
 *   never    → 5 pts  (neutral for first check)
 *
 * Status thresholds:
 *   ≥ 70 pts → valid
 *   40–69    → suspect
 *   < 40     → drifted / unavailable (depends on availability score)
 *   confidence:'failed' → failed (score is still computed but status is 'failed')
 */

import type {
  TitleValidation,
  PricingValidation,
  AvailabilityValidation,
  ImageValidation,
  ValidationStatus,
  ExtractionConfidence,
} from './types'

// ── Freshness scoring ─────────────────────────────────────────────────────────

const MAX_FRESHNESS = 10

export function freshnessScore(lastCheckedAt: string | null): number {
  if (!lastCheckedAt) return 5   // First-ever check: neutral
  const ageMs   = Date.now() - new Date(lastCheckedAt).getTime()
  const ageHrs  = ageMs / (1_000 * 60 * 60)
  if (ageHrs <   6) return MAX_FRESHNESS
  if (ageHrs <  24) return 8
  if (ageHrs <  72) return 5
  if (ageHrs < 168) return 3
  return 0
}

// ── Status classification ─────────────────────────────────────────────────────

export function classifyStatus(
  score:        number,
  avValidation: AvailabilityValidation,
  confidence:   ExtractionConfidence,
  titleValid:   TitleValidation,
): ValidationStatus {
  if (confidence === 'failed') return 'failed'
  if (avValidation.status === 'unavailable') return 'unavailable'
  if (titleValid.hasDrift && titleValid.similarity < 0.15) return 'drifted'
  if (score >= 70) return 'valid'
  if (score >= 40) return 'suspect'
  if (avValidation.status === 'out_of_stock') return 'unavailable'
  return 'suspect'
}

// ── Composite score ───────────────────────────────────────────────────────────

export function computeTruthScore(
  title:        TitleValidation,
  pricing:      PricingValidation,
  availability: AvailabilityValidation,
  image:        ImageValidation,
  lastCheckedAt: string | null = null,
): number {
  return (
    title.score +
    pricing.score +
    availability.score +
    image.score +
    freshnessScore(lastCheckedAt)
  )
}
