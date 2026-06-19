/**
 * lib/catalog/discovery/ranking.ts
 *
 * Catalog Pipeline — Ranking phase (Sprint 3F).
 *
 * Scores each CatalogCandidate and sorts highest-first.
 *
 * Scoring factors (max 100):
 *   Colombia confirmed   +25
 *   Rating               0–25   (rating / 5.0 * 25, rounded)
 *   Reviews              0–20   (log10 scale, max at 10 000 reviews)
 *   Image present        +15
 *   Price > 0            +10
 *   Category match       +5     (product already belongs to the target category)
 *
 * SERVER-ONLY.
 */

import type { CatalogCandidate, DiscoveryContext } from './types'

// ── Internal scorer ───────────────────────────────────────────────────────────

function scoreCandidate(c: CatalogCandidate, context: DiscoveryContext): CatalogCandidate {
  let score = 0
  const reasons: string[] = []

  if (c.shipsToColombiaConfirmed) {
    score += 25
    reasons.push('Colombia confirmado (+25)')
  }

  const ratingPts = Math.round((Math.min(5, Math.max(0, c.rating)) / 5.0) * 25)
  if (ratingPts > 0) {
    score += ratingPts
    reasons.push(`Rating ${c.rating.toFixed(1)} (+${ratingPts})`)
  }

  const reviewPts =
    c.reviews > 0
      ? Math.min(20, Math.round((Math.log10(c.reviews + 1) / Math.log10(10001)) * 20))
      : 0
  if (reviewPts > 0) {
    score += reviewPts
    reasons.push(`Reviews ${c.reviews} (+${reviewPts})`)
  }

  if (c.image) {
    score += 15
    reasons.push('Imagen presente (+15)')
  }

  if (c.price > 0) {
    score += 10
    reasons.push(`Precio $${c.price.toFixed(2)} (+10)`)
  }

  if (c.category === context.category) {
    score += 5
    reasons.push('Categoría objetivo (+5)')
  }

  return { ...c, discoveryScore: Math.min(100, score), reasons }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scores and sorts candidates by discoveryScore (highest first).
 * Mutates no input — returns a new array.
 * Never throws.
 */
export function rankCatalogCandidates(
  candidates: CatalogCandidate[],
  context: DiscoveryContext,
): CatalogCandidate[] {
  try {
    return candidates
      .map(c => scoreCandidate(c, context))
      .sort((a, b) => b.discoveryScore - a.discoveryScore)
  } catch {
    return candidates
  }
}
