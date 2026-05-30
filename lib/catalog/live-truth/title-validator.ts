/**
 * lib/catalog/live-truth/title-validator.ts
 *
 * Detects product title drift by computing Jaccard similarity between the
 * catalog title and the live title extracted from Amazon.
 *
 * Algorithm:
 *   1. Normalise both titles (lowercase, strip punctuation, remove stopwords)
 *   2. Tokenise into word sets
 *   3. Jaccard = |intersection| / |union|
 *
 * Score thresholds:
 *   similarity ≥ 0.60  → no drift     → 30 points
 *   similarity ≥ 0.35  → minor drift  → 20 points
 *   similarity ≥ 0.15  → major drift  → 8 points
 *   similarity < 0.15  → extreme drift (likely wrong product) → 0 points
 *
 * Confidence guard: if the live title could not be extracted, return a
 * neutral score (15/30) rather than falsely penalising the product.
 */

import type { TitleValidation } from './types'

// ── Normalisation ─────────────────────────────────────────────────────────────

/** Words so common they add no discriminating power */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'by',
  'with', 'from', 'up', 'as', 'is', 'it', 'its', 'be', 'this', 'that',
  'new', 'set', 'use', 'pack',
])

function normalise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // remove punctuation except hyphens between alphanumerics
      .replace(/[^\w\s-]/g, ' ')
      .replace(/-/g, '')          // collapse hyphens into word: "wh-1000xm5" → "wh1000xm5"
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t)),
  )
}

// ── Jaccard similarity ────────────────────────────────────────────────────────

export function jaccardSimilarity(a: string, b: string): number {
  const setA = normalise(a)
  const setB = normalise(b)

  if (setA.size === 0 && setB.size === 0) return 1  // both empty = identical
  if (setA.size === 0 || setB.size === 0) return 0  // one empty = no overlap

  let intersection = 0
  for (const token of Array.from(setA)) {
    if (setB.has(token)) intersection++
  }

  const union = setA.size + setB.size - intersection
  return intersection / union
}

// ── Score mapping ─────────────────────────────────────────────────────────────

const MAX_SCORE = 30

function similarityToScore(sim: number): number {
  if (sim >= 0.60) return MAX_SCORE         // no drift
  if (sim >= 0.35) return 20               // minor drift
  if (sim >= 0.15) return 8                // major drift
  return 0                                  // extreme drift
}

// ── Main export ───────────────────────────────────────────────────────────────

export function validateTitle(
  catalogTitle: string,
  extractedTitle: string | undefined,
): TitleValidation {
  // Extraction failed — return neutral score, do not penalise
  if (!extractedTitle) {
    return {
      score:          Math.round(MAX_SCORE * 0.5),
      similarity:     -1,   // sentinel: unknown
      hasDrift:       false,
      catalogTitle,
      extractedTitle: '',
      reason:         'Título no extraído — sin penalización',
    }
  }

  const similarity = jaccardSimilarity(catalogTitle, extractedTitle)
  const score      = similarityToScore(similarity)
  const hasDrift   = similarity < 0.35

  let reason: string
  if (similarity >= 0.60)      reason = 'Coincidencia de título OK'
  else if (similarity >= 0.35) reason = `Deriva leve (Jaccard ${similarity.toFixed(2)})`
  else if (similarity >= 0.15) reason = `Deriva significativa (Jaccard ${similarity.toFixed(2)})`
  else                         reason = `Deriva extrema — posible producto diferente (Jaccard ${similarity.toFixed(2)})`

  return {
    score,
    similarity,
    hasDrift,
    catalogTitle,
    extractedTitle,
    reason,
  }
}
