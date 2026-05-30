/**
 * lib/session/interest-engine.ts
 *
 * High-level interest and intent inference from a SessionProfile.
 *
 * These flags are derived from raw behavioural signals and used by:
 *   - PersonalizedSection to tailor section copy / product selection
 *   - Scoring engine to boost affinity-aligned products
 *   - Admin analytics to bucket visitor types
 *
 * All thresholds are conservative — we prefer false negatives over
 * false positives to avoid over-personalising on thin signal.
 *
 * Public API:
 *   isHighIntent(profile)       → user has clicked Amazon CTAs multiple times
 *   isReturnVisitor(profile)    → user has visited more than once
 *   hasSearchedBefore(profile)  → user has at least one saved search term
 *   hasWatchlistItems(profile)  → user has added products to watchlist
 *   getInterestLabels(profile)  → human-readable string[] of inferred interests
 */

import type { SessionProfile } from './types'

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Min Amazon CTA clicks to be considered high-intent */
const HIGH_INTENT_CLICK_THRESHOLD = 3
/** Min visits to be considered a returning visitor */
const RETURN_VISITOR_THRESHOLD    = 2

// ── Predicates ────────────────────────────────────────────────────────────────

/**
 * Returns true when the user has clicked through to Amazon at least
 * HIGH_INTENT_CLICK_THRESHOLD times — a strong purchase-intent signal.
 */
export function isHighIntent(profile: SessionProfile): boolean {
  return profile.clickedProducts.length >= HIGH_INTENT_CLICK_THRESHOLD
}

/**
 * Returns true when the user has visited the site more than once.
 */
export function isReturnVisitor(profile: SessionProfile): boolean {
  return profile.visitCount >= RETURN_VISITOR_THRESHOLD
}

/**
 * Returns true when the user has typed at least one search query.
 */
export function hasSearchedBefore(profile: SessionProfile): boolean {
  return profile.searchTerms.length > 0
}

/**
 * Returns true when the user has at least one item in their watchlist.
 */
export function hasWatchlistItems(profile: SessionProfile): boolean {
  return profile.watchlistProducts.length > 0
}

/**
 * Returns true when the profile has enough signal to personalise content.
 * Requires at least one category interaction (view or click).
 */
export function hasPersonalizationSignal(profile: SessionProfile): boolean {
  return (
    Object.keys(profile.viewedCategories).length > 0 ||
    Object.keys(profile.clickedCategories).length > 0
  )
}

// ── Interest label builder ────────────────────────────────────────────────────

/**
 * Returns a list of human-readable interest labels for admin/debug display.
 * Empty when the user has no meaningful signal.
 */
export function getInterestLabels(profile: SessionProfile): string[] {
  const labels: string[] = []
  if (isReturnVisitor(profile))  labels.push('visitante recurrente')
  if (isHighIntent(profile))     labels.push('alta intención')
  if (hasWatchlistItems(profile)) labels.push('usa lista de seguimiento')
  if (hasSearchedBefore(profile)) labels.push('usa búsqueda')
  return labels
}
