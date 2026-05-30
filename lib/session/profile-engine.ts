/**
 * lib/session/profile-engine.ts
 *
 * Core logic for creating and updating SessionProfile objects.
 *
 * All functions are pure (take profile, return new profile) except
 * getOrCreateProfile() which performs a single localStorage read.
 *
 * Public API:
 *   createProfile()                     → fresh SessionProfile
 *   getOrCreateProfile()                → loaded or freshly created profile
 *   touchVisit(profile)                 → profile with updated visitCount + lastActiveAt
 *   applyEvent(profile, event)          → profile with event applied (immutable)
 */

import type { SessionProfile, SessionEvent } from './types'
import { SESSION_SCHEMA_VERSION } from './types'
import {
  loadProfile,
  saveProfile,
  MAX_PRODUCT_HISTORY,
  MAX_SEARCH_HISTORY,
  MAX_RECOMMENDATION_HISTORY,
} from './storage'

// ── ID generation ──────────────────────────────────────────────────────────────

/**
 * Generates a random session ID.
 * Uses crypto.randomUUID() when available (all modern browsers + Node ≥ 19).
 * Falls back to a Math.random()-based UUID v4 for older environments.
 */
function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback UUID v4 — not cryptographically strong but sufficient for anonymous IDs
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Profile creation ──────────────────────────────────────────────────────────

/** Returns a brand-new, zeroed session profile. */
export function createProfile(): SessionProfile {
  const now = new Date().toISOString()
  return {
    sessionId:           generateSessionId(),
    schemaVersion:       SESSION_SCHEMA_VERSION,
    createdAt:           now,
    lastActiveAt:        now,
    visitCount:          1,
    viewedCategories:    {},
    clickedCategories:   {},
    viewedProducts:      [],
    clickedProducts:     [],
    watchlistProducts:   [],
    searchTerms:         [],
    seenRecommendations: [],
  }
}

/**
 * Loads the profile from localStorage, or creates a new one if absent.
 * Does NOT automatically persist the result — callers must call saveProfile()
 * after applying events to avoid redundant writes.
 */
export function getOrCreateProfile(): SessionProfile {
  return loadProfile() ?? createProfile()
}

// ── Visit tracking ────────────────────────────────────────────────────────────

/**
 * Increments visitCount and refreshes lastActiveAt.
 * Call this once per page load / session init.
 * Returns a new profile (immutable update) and persists it to localStorage.
 */
export function touchVisit(profile: SessionProfile): SessionProfile {
  const updated: SessionProfile = {
    ...profile,
    visitCount:   profile.visitCount + 1,
    lastActiveAt: new Date().toISOString(),
  }
  saveProfile(updated)
  return updated
}

// ── Event application ─────────────────────────────────────────────────────────

/**
 * Applies a SessionEvent to a profile and returns the updated copy.
 * Does NOT write to localStorage — caller is responsible for saveProfile().
 *
 * Array caps are enforced here (most-recent-first for all lists).
 */
export function applyEvent(profile: SessionProfile, event: SessionEvent): SessionProfile {
  const next: SessionProfile = {
    ...profile,
    lastActiveAt: new Date().toISOString(),
  }

  switch (event.type) {
    case 'category_view': {
      if (!event.category) break
      next.viewedCategories = {
        ...next.viewedCategories,
        [event.category]: (next.viewedCategories[event.category] ?? 0) + 1,
      }
      break
    }

    case 'product_view': {
      if (!event.productId) break
      if (!next.viewedProducts.includes(event.productId)) {
        next.viewedProducts = [event.productId, ...next.viewedProducts]
          .slice(0, MAX_PRODUCT_HISTORY)
      }
      break
    }

    case 'product_click': {
      if (!event.productId) break
      // Record in clicked products (most-recent first, deduped)
      if (!next.clickedProducts.includes(event.productId)) {
        next.clickedProducts = [event.productId, ...next.clickedProducts]
          .slice(0, MAX_PRODUCT_HISTORY)
      }
      // Also credit the category with a click signal
      if (event.category) {
        next.clickedCategories = {
          ...next.clickedCategories,
          [event.category]: (next.clickedCategories[event.category] ?? 0) + 1,
        }
      }
      break
    }

    case 'search': {
      if (!event.query) break
      const q = event.query.trim().toLowerCase()
      if (!q) break
      if (!next.searchTerms.includes(q)) {
        next.searchTerms = [q, ...next.searchTerms].slice(0, MAX_SEARCH_HISTORY)
      }
      break
    }

    case 'watchlist_add': {
      if (!event.productId) break
      if (!next.watchlistProducts.includes(event.productId)) {
        next.watchlistProducts = [...next.watchlistProducts, event.productId]
      }
      break
    }

    case 'watchlist_remove': {
      if (!event.productId) break
      next.watchlistProducts = next.watchlistProducts.filter(id => id !== event.productId)
      break
    }

    case 'recommendation_click': {
      if (!event.productId) break
      if (!next.seenRecommendations.includes(event.productId)) {
        next.seenRecommendations = [event.productId, ...next.seenRecommendations]
          .slice(0, MAX_RECOMMENDATION_HISTORY)
      }
      break
    }
  }

  return next
}
