/**
 * GOODPRICE Audit — Reliability Scoring
 *
 * Combines all four check results into a single 0–100 reliability score.
 *
 * Weight table:
 * ┌───────────────────────────────────┬────────┐
 * │ Check                             │ Points │
 * ├───────────────────────────────────┼────────┤
 * │ ASIN format valid                 │    +25 │
 * │ Amazon page reachable (not 404)   │    +25 │
 * │ Product image accessible          │    +20 │
 * │ Data complete (no missing fields) │    +15 │
 * │ Colombia shippable                │    +10 │
 * │ Catalog status is 'active'        │     +5 │
 * └───────────────────────────────────┴────────┘
 *
 * Grade thresholds:
 *   A ≥ 90   — Excellent, production-ready
 *   B ≥ 70   — Good, minor issues
 *   C ≥ 50   — Acceptable, should be reviewed
 *   D ≥ 30   — Poor, needs attention
 *   F  < 30  — Critical, quarantine candidate
 */

import type {
  AsinCheckResult,
  ImageCheckResult,
  CompletenessCheckResult,
  ColombiaCheckResult,
  ProductReliabilityScore,
  ReliabilityGrade,
} from './types'
import type { RawProduct } from '@/types'

// ── Weight constants ──────────────────────────────────────────────────────────

const W_ASIN_FORMAT  = 25
const W_ASIN_REACH   = 25
const W_IMAGE        = 20
const W_COMPLETE     = 15
const W_COLOMBIA     = 10
const W_STATUS       = 5

// ── Grade thresholds ──────────────────────────────────────────────────────────

export function scoreToGrade(score: number): ReliabilityGrade {
  if (score >= 90) return 'A'
  if (score >= 70) return 'B'
  if (score >= 50) return 'C'
  if (score >= 30) return 'D'
  return 'F'
}

// ── Scoring algorithm ─────────────────────────────────────────────────────────

export function computeScore(
  product:          RawProduct,
  asinCheck:        AsinCheckResult,
  imageCheck:       ImageCheckResult,
  completenessCheck: CompletenessCheckResult,
  colombiaCheck:    ColombiaCheckResult,
  quarantined:      boolean
): ProductReliabilityScore {
  let score = 0

  // ── ASIN format ───────────────────────────────────────────────────────────
  if (asinCheck.formatValid) score += W_ASIN_FORMAT

  // ── Amazon reachability ───────────────────────────────────────────────────
  if (asinCheck.reachable === true) {
    score += W_ASIN_REACH
  } else if (asinCheck.reachable === null) {
    // Unknown (network error) — give partial credit, don't penalize hard
    score += Math.round(W_ASIN_REACH * 0.5)
  }
  // reachable === false → 0 points

  // ── Image ─────────────────────────────────────────────────────────────────
  if (imageCheck.accessible) {
    score += W_IMAGE
  } else if (imageCheck.severity === 'warning') {
    // 403/timeout — may work in browser, partial credit
    score += Math.round(W_IMAGE * 0.4)
  }

  // ── Completeness ──────────────────────────────────────────────────────────
  const missingCount = completenessCheck.missingFields.length
  const suspiciousCount = completenessCheck.suspiciousValues.length

  if (missingCount === 0 && suspiciousCount === 0) {
    score += W_COMPLETE
  } else if (missingCount === 0 && suspiciousCount <= 2) {
    score += Math.round(W_COMPLETE * 0.7)
  } else if (missingCount <= 1) {
    score += Math.round(W_COMPLETE * 0.4)
  }
  // missingCount > 1 → 0 points

  // ── Colombia ──────────────────────────────────────────────────────────────
  if (colombiaCheck.shippable && colombiaCheck.confirmedShipping) {
    score += W_COLOMBIA
  } else if (colombiaCheck.shippable) {
    // Shippable but not confirmed — partial
    score += Math.round(W_COLOMBIA * 0.5)
  }
  // Not shippable → 0 points

  // ── Catalog status bonus ──────────────────────────────────────────────────
  if (product.status === 'active') score += W_STATUS

  // ── Clamp ─────────────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score))

  const grade = scoreToGrade(score)

  return {
    productId:         product.id,
    asin:              product.asin,
    title:             product.title,
    category:          product.category,
    brand:             product.brand,
    catalogStatus:     product.status,
    score,
    grade,
    quarantined,
    asinCheck,
    imageCheck,
    completenessCheck,
    colombiaCheck,
    auditedAt:         new Date().toISOString(),
  }
}

// ── Issue extractor ───────────────────────────────────────────────────────────

/** Extract the top-priority issues across all checks, max 5 strings */
export function extractTopIssues(scored: ProductReliabilityScore): string[] {
  const issues: Array<{ severity: number; text: string }> = []

  const SEVERITY_ORDER = { critical: 3, warning: 2, info: 1, ok: 0 }

  function addIssues(notes: string[], severity: string) {
    const weight = SEVERITY_ORDER[severity as keyof typeof SEVERITY_ORDER] ?? 0
    if (weight === 0) return
    for (const note of notes) {
      issues.push({ severity: weight, text: note })
    }
  }

  addIssues(scored.asinCheck.notes,        scored.asinCheck.severity)
  addIssues(scored.imageCheck.notes,       scored.imageCheck.severity)
  addIssues(scored.completenessCheck.notes, scored.completenessCheck.severity)
  addIssues(scored.colombiaCheck.notes,    scored.colombiaCheck.severity)

  return issues
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5)
    .map(i => i.text)
}

// ── Overall severity ──────────────────────────────────────────────────────────

import type { AuditSeverity } from './types'

/** Worst severity across all four checks */
export function overallSeverity(scored: ProductReliabilityScore): AuditSeverity {
  const severities = [
    scored.asinCheck.severity,
    scored.imageCheck.severity,
    scored.completenessCheck.severity,
    scored.colombiaCheck.severity,
  ]
  if (severities.includes('critical')) return 'critical'
  if (severities.includes('warning'))  return 'warning'
  if (severities.includes('info'))     return 'info'
  return 'ok'
}
