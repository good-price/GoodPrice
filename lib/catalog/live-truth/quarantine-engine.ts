/**
 * lib/catalog/live-truth/quarantine-engine.ts
 *
 * Decides whether a product should be recommended for quarantine based on
 * live truth validation results.
 *
 * Conservative design: we prefer false negatives over false positives.
 * Never quarantine based on:
 *   - A single failed extraction (network noise)
 *   - Low availability on a single check (temporary stock issue)
 *   - Minor price discrepancy
 *
 * Quarantine is recommended when:
 *   1. ASIN returns HTTP 404 (product definitively removed)
 *   2. Title similarity < 0.15 with high/medium confidence (different product)
 *   3. Truth score < 35 on 2+ consecutive checks (persistent low quality)
 *   4. Availability 'unavailable' on 2+ consecutive checks (archived listing)
 */

import type { LiveTruthResult } from './types'

// ── Thresholds ────────────────────────────────────────────────────────────────

const EXTREME_DRIFT_THRESHOLD   = 0.15   // Jaccard similarity
const LOW_SCORE_THRESHOLD       = 35     // Truth score below which we flag
const CONSECUTIVE_CHECKS_NEEDED = 2      // How many consecutive bad checks needed

// ── Core logic ────────────────────────────────────────────────────────────────

export interface QuarantineDecision {
  recommend: boolean
  reason:    string
}

/**
 * Returns whether this product should be recommended for quarantine.
 *
 * @param current  - The latest validation result
 * @param history  - Previous results (newest first), may be empty
 */
export function evaluateForQuarantine(
  current: LiveTruthResult,
  history: LiveTruthResult[],
): QuarantineDecision {
  const { extracted, title, availability, truthScore, confidence } = current

  // ── Rule 1: HTTP 404 — product definitively gone ──────────────────────────
  if (extracted.httpStatus === 404 && confidence === 'high') {
    return { recommend: true, reason: 'ASIN devuelve 404 — producto eliminado de Amazon' }
  }

  // ── Rule 2: Extreme title drift with reliable extraction ──────────────────
  if (
    title.similarity !== -1 &&     // -1 = unknown (extraction failed)
    title.similarity < EXTREME_DRIFT_THRESHOLD &&
    (confidence === 'high' || confidence === 'medium')
  ) {
    return {
      recommend: true,
      reason: `Deriva de título extrema (Jaccard ${title.similarity.toFixed(2)}) — posiblemente producto diferente`,
    }
  }

  // ── Rules 3 & 4 require history (need consistent signal) ─────────────────
  if (history.length >= CONSECUTIVE_CHECKS_NEEDED - 1) {
    const recentChecks = [current, ...history].slice(0, CONSECUTIVE_CHECKS_NEEDED)

    // Rule 3: Consecutive low truth score (ignoring failed extractions)
    const reliableChecks = recentChecks.filter(r => r.confidence !== 'failed')
    if (
      reliableChecks.length >= CONSECUTIVE_CHECKS_NEEDED &&
      reliableChecks.every(r => r.truthScore < LOW_SCORE_THRESHOLD)
    ) {
      const avgScore = Math.round(
        reliableChecks.reduce((s, r) => s + r.truthScore, 0) / reliableChecks.length,
      )
      return {
        recommend: true,
        reason: `Score bajo consistente (promedio ${avgScore}/100 en ${CONSECUTIVE_CHECKS_NEEDED} validaciones)`,
      }
    }

    // Rule 4: Consecutive unavailability (non-temporary)
    const unavailChecks = recentChecks.filter(r =>
      r.availability.status === 'unavailable' && r.confidence !== 'failed',
    )
    if (unavailChecks.length >= CONSECUTIVE_CHECKS_NEEDED) {
      return {
        recommend: true,
        reason: `Producto no disponible en ${CONSECUTIVE_CHECKS_NEEDED} validaciones consecutivas`,
      }
    }
  }

  // Single-check rules (high confidence required)
  if (confidence === 'high' && availability.status === 'unavailable' && truthScore < 20) {
    return {
      recommend: true,
      reason: 'No disponible + score muy bajo (< 20) con extracción confiable',
    }
  }

  return { recommend: false, reason: '' }
}
