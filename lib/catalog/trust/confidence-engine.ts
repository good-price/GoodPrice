/**
 * lib/catalog/trust/confidence-engine.ts
 *
 * Computes a confidence level for a product's visibility determination.
 *
 * Confidence reflects how certain we are in the tier assignment:
 *   high   — based on confirmed, hard signals (status, quarantine, intelligence)
 *   medium — based on recoverable or time-limited signals (link, Colombia, healing)
 *   low    — based only on soft signals (image CDN, audit score alone)
 *   failed — contradictory or no usable data (shouldn't occur in practice)
 *
 * SERVER-ONLY.
 */

import type { VisibilitySignal, ConfidenceLevel } from './types'

// ── Hard gates — always high confidence ──────────────────────────────────────

const HIGH_CONFIDENCE_GATES = new Set([
  'gate-1',   // inactive status
  'gate-2',   // Colombia restriction flag
  'gate-3',   // quarantine
  'gate-4',   // invalid ASIN
  'gate-5',   // invalid image URL
  'gate-5e',  // dead-ASIN image
  'gate-7',   // consecutive critical audit failures
  'gate-8',   // intelligence CRITICAL
])

// ── Recoverable gates — medium confidence ─────────────────────────────────────

const MEDIUM_CONFIDENCE_GATES = new Set([
  'gate-9',   // dead link (recoverable after re-audit)
  'gate-10',  // Colombia unavailable (may change with new audit)
  'gate-11',  // healing suppression (temporary by design)
])

// ── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * Computes confidence for a set of visibility signals.
 */
export function computeConfidence(signals: VisibilitySignal[]): ConfidenceLevel {
  if (signals.length === 0) return 'high'  // no issues = confident it's clean

  const suppressedSignals = signals.filter(s => s.tier === 'suppressed')
  const allGates          = signals.map(s => s.gate)

  // Any hard gate → high confidence in suppression decision
  const hasHardGate = allGates.some(g => HIGH_CONFIDENCE_GATES.has(g))
  if (hasHardGate) return 'high'

  // Multiple confirming signals → bump to high
  if (suppressedSignals.length >= 2) return 'high'

  // Recoverable gates only → medium
  const allRecoverable = allGates.every(g => MEDIUM_CONFIDENCE_GATES.has(g))
  if (allRecoverable) return 'medium'

  // Only soft signals (image, audit score) → low
  const softGates = new Set(['gate-5v', 'gate-6'])
  const allSoft   = allGates.every(g => softGates.has(g))
  if (allSoft) return 'low'

  // Mixed signals
  return 'medium'
}
