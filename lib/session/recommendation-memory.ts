/**
 * lib/session/recommendation-memory.ts
 *
 * Anti-repetition layer for personalised product recommendations.
 *
 * Problem: Without memory, the same products would appear in every
 * "Basado en tus intereses" section on every visit, making it feel
 * stale and robotic.
 *
 * Solution: Maintain a rolling `seenRecommendations` list in the profile.
 * When the PersonalizedSection renders products, it:
 *   1. Passes `seenRecommendations` to the API as excluded IDs
 *   2. After receiving new products, calls addToSeen() to record them
 *   3. Saves the updated profile to localStorage
 *
 * The list rolls at MAX_RECOMMENDATION_HISTORY — oldest entries are dropped
 * so products re-appear after enough fresher recommendations have been shown.
 *
 * Public API:
 *   filterUnseenProducts(productIds, profile)  → IDs not yet recommended
 *   addToSeen(profile, productIds)             → profile with updated seen list
 *   hasBeenSeen(productId, profile)            → boolean predicate
 *   getSeenIds(profile)                        → ReadonlySet<string>
 */

import type { SessionProfile } from './types'
import { MAX_RECOMMENDATION_HISTORY } from './storage'

// ── Predicates ────────────────────────────────────────────────────────────────

/** Returns true when a product has already been recommended. */
export function hasBeenSeen(productId: string, profile: SessionProfile): boolean {
  return profile.seenRecommendations.includes(productId)
}

/** Returns a read-only Set of seen product IDs for O(1) lookups. */
export function getSeenIds(profile: SessionProfile): ReadonlySet<string> {
  return new Set(profile.seenRecommendations)
}

// ── Filtering ─────────────────────────────────────────────────────────────────

/**
 * Filters out product IDs that have already been recommended.
 * Preserves input order for the unseen products.
 */
export function filterUnseenProducts(
  productIds: string[],
  profile:    SessionProfile,
): string[] {
  const seen = getSeenIds(profile)
  return productIds.filter(id => !seen.has(id))
}

// ── State updates (immutable) ─────────────────────────────────────────────────

/**
 * Returns a new profile with `productIds` prepended to seenRecommendations.
 * Caps the list at MAX_RECOMMENDATION_HISTORY (oldest entries are dropped).
 * Deduplicates before adding.
 */
export function addToSeen(
  profile:    SessionProfile,
  productIds: string[],
): SessionProfile {
  if (productIds.length === 0) return profile

  const existing = new Set(profile.seenRecommendations)
  const newIds   = productIds.filter(id => !existing.has(id))
  if (newIds.length === 0) return profile

  const updated = [
    ...newIds,
    ...profile.seenRecommendations,
  ].slice(0, MAX_RECOMMENDATION_HISTORY)

  return { ...profile, seenRecommendations: updated }
}
