/**
 * lib/catalog/self-healing/archive-engine.ts
 *
 * Identifies products that should be auto-suppressed based on consistently
 * failing live truth checks, then writes them to suppressed.json via
 * the suppression module (Gate 11).
 *
 * Archive criteria (conservative — requires multiple failed checks):
 *   Rule A: last 2+ consecutive checks with status === 'unavailable'
 *            AND confidence !== 'failed' (not just bot-blocked)
 *   Rule B: last 2+ consecutive checks with truthScore < archiveScoreThreshold
 *            AND confidence !== 'failed'
 *   Rule C: single check with status === 'unavailable' + confidence === 'high'
 *            AND truthScore < 20
 *
 * NEVER archives on extraction failures alone (confidence === 'failed').
 * SERVER-ONLY.
 */

import { loadAllResults, loadProductHistory, suppressProduct, isHealingSuppressed } from '@/lib/catalog/live-truth'
import type { Product } from '@/types'
import type { HealingEvent } from './types'

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_CONSECUTIVE  = 2
const DEFAULT_SCORE_THRESH = 30
const RULE_C_SCORE         = 20

// ── Public API ────────────────────────────────────────────────────────────────

export interface ArchiveEngineOptions {
  dryRun?:              boolean
  maxArchive?:          number
  consecutiveChecks?:   number
  scoreThreshold?:      number
}

/**
 * Evaluate all public products and suppress those that consistently fail.
 * Returns the list of newly suppressed products (not counting already-suppressed).
 */
export function runArchiveEngine(
  products: Product[],
  opts: ArchiveEngineOptions = {},
): HealingEvent[] {
  const {
    dryRun            = false,
    maxArchive        = 10,
    consecutiveChecks = DEFAULT_CONSECUTIVE,
    scoreThreshold    = DEFAULT_SCORE_THRESH,
  } = opts

  const allResults = loadAllResults()
  const archived:  HealingEvent[] = []

  for (const p of products) {
    if (archived.length >= maxArchive) break
    if (!p.id || !p.asin) continue
    // Already suppressed — skip
    if (isHealingSuppressed(p.id)) continue

    const latest  = allResults[p.id]
    if (!latest) continue                    // never checked — let stale-engine handle it

    const history = loadProductHistory(p.id) // newest first
    if (history.length === 0) continue

    // Only consider checks where we actually got data (not bot-check failures)
    const reliable = history.filter(r => r.confidence !== 'failed')
    if (reliable.length === 0) continue

    const latestReliable = reliable[0]
    let   shouldArchive  = false
    let   reason         = ''

    // Rule C — immediate: single high-confidence unavailable with very low score
    if (
      latestReliable.confidence === 'high' &&
      latestReliable.status     === 'unavailable' &&
      latestReliable.truthScore  < RULE_C_SCORE
    ) {
      shouldArchive = true
      reason = `High-confidence unavailable + score ${latestReliable.truthScore} < ${RULE_C_SCORE}`
    }

    // Rules A & B — require consecutive checks
    if (!shouldArchive && reliable.length >= consecutiveChecks) {
      const window = reliable.slice(0, consecutiveChecks)

      // Rule A — consecutive unavailable
      if (window.every(r => r.status === 'unavailable')) {
        shouldArchive = true
        reason = `${consecutiveChecks} consecutive unavailable checks`
      }

      // Rule B — consecutive low score
      if (!shouldArchive && window.every(r => r.truthScore < scoreThreshold)) {
        shouldArchive = true
        reason = `${consecutiveChecks} consecutive checks below score ${scoreThreshold} (scores: ${window.map(r => r.truthScore).join(', ')})`
      }
    }

    if (!shouldArchive) continue

    const event: HealingEvent = {
      productId:  p.id,
      asin:       p.asin,
      action:     'suppress',
      reason,
      truthScore: latestReliable.truthScore,
      ts:         new Date().toISOString(),
    }

    if (!dryRun) {
      suppressProduct({
        productId:    p.id,
        asin:         p.asin,
        suppressedAt: event.ts,
        reason,
        truthScore:   latestReliable.truthScore,
      })
    }

    archived.push(event)
  }

  return archived
}
