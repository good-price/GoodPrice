/**
 * lib/session/affinity-engine.ts
 *
 * Category affinity scoring from anonymous session behaviour.
 *
 * Scoring formula:
 *   raw = (viewCount × 1) + (clickCount × 3)
 *   score = raw / (raw + 12)     ← asymptotic: ~0.09 at 1 view, ~0.79 at 10 clicks
 *
 * The +12 divisor offset means small signals don't immediately dominate,
 * but strong engagement (3+ clicks) quickly reaches a high score.
 *
 * Click events carry 3× the weight of views because a CTA click is a
 * direct purchase-intent signal — much stronger than a passive page view.
 *
 * Public API:
 *   computeCategoryAffinity(profile)   → AffinityScore[] sorted desc by score
 *   getTopCategories(profile, limit?)  → top category slugs (string[])
 */

import type { SessionProfile, AffinityScore } from './types'

// ── Scoring weights ───────────────────────────────────────────────────────────

const VIEW_WEIGHT  = 1
const CLICK_WEIGHT = 3
/** Normalisation offset — see formula above */
const NORM_OFFSET  = 12

// ── Core scoring ──────────────────────────────────────────────────────────────

/**
 * Returns an AffinityScore for every category the user has interacted with,
 * sorted by composite score descending (highest affinity first).
 */
export function computeCategoryAffinity(profile: SessionProfile): AffinityScore[] {
  // Collect all categories mentioned in either signal type (deduplicated)
  const allCategories = Array.from(new Set([
    ...Object.keys(profile.viewedCategories),
    ...Object.keys(profile.clickedCategories),
  ]))

  const scores: AffinityScore[] = []

  for (const category of allCategories) {
    const viewCount  = profile.viewedCategories[category]  ?? 0
    const clickCount = profile.clickedCategories[category] ?? 0
    const raw        = viewCount * VIEW_WEIGHT + clickCount * CLICK_WEIGHT

    // Asymptotic normalisation — never reaches 1.0, grows with engagement
    const score = raw / (raw + NORM_OFFSET)

    scores.push({ category, score, viewCount, clickCount })
  }

  return scores.sort((a, b) => b.score - a.score)
}

/**
 * Returns the top N category slugs sorted by affinity score.
 * Returns an empty array when the user has no behavioural signal yet.
 */
export function getTopCategories(profile: SessionProfile, limit = 5): string[] {
  return computeCategoryAffinity(profile)
    .slice(0, limit)
    .map(s => s.category)
}

/**
 * Returns true when the user has meaningfully engaged with a specific category
 * (at least one view or one click).
 */
export function hasAffinityFor(profile: SessionProfile, category: string): boolean {
  return (
    (profile.viewedCategories[category]  ?? 0) > 0 ||
    (profile.clickedCategories[category] ?? 0) > 0
  )
}

/**
 * Returns the dominant category (highest affinity score), or null when
 * the user has no behavioural signal.
 */
export function getDominantCategory(profile: SessionProfile): string | null {
  const top = computeCategoryAffinity(profile)
  return top[0]?.category ?? null
}
