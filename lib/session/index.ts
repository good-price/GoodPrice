/**
 * lib/session/index.ts
 *
 * Public API for the GOODPRICE session intelligence system.
 *
 * This module re-exports all client-compatible session functions and adds
 * a module-level `trackSessionEvent()` convenience function that can be
 * called from any client-side code without instantiating the React hook.
 *
 * ⚠ Do NOT add imports from `reports.ts` here — that module uses Node.js fs
 * and must only be imported from server components and API routes directly.
 *
 * Usage in client components (without hook):
 *   import { trackSessionEvent } from '@/lib/session'
 *   trackSessionEvent({ type: 'product_click', productId, category, ts: Date.now() })
 *
 * Usage in React components (with reactive state):
 *   import { useSessionProfile } from '@/hooks/useSessionProfile'
 */

// ── Types ──────────────────────────────────────────────────────────────────────
export type { SessionProfile, SessionEvent, SessionEventType, AffinityScore } from './types'
export { SESSION_SCHEMA_VERSION } from './types'

// ── Storage ───────────────────────────────────────────────────────────────────
export { loadProfile, saveProfile, clearProfile } from './storage'

// ── Profile engine ────────────────────────────────────────────────────────────
export {
  createProfile,
  getOrCreateProfile,
  touchVisit,
  applyEvent,
} from './profile-engine'

// ── Affinity engine ───────────────────────────────────────────────────────────
export {
  computeCategoryAffinity,
  getTopCategories,
  hasAffinityFor,
  getDominantCategory,
} from './affinity-engine'

// ── Interest engine ───────────────────────────────────────────────────────────
export {
  isHighIntent,
  isReturnVisitor,
  hasSearchedBefore,
  hasWatchlistItems,
  hasPersonalizationSignal,
  getInterestLabels,
} from './interest-engine'

// ── Recommendation memory ─────────────────────────────────────────────────────
export {
  filterUnseenProducts,
  addToSeen,
  hasBeenSeen,
  getSeenIds,
} from './recommendation-memory'

// ── Scoring ───────────────────────────────────────────────────────────────────
export { personalizeProductList } from './scoring'

// ── Convenience function ──────────────────────────────────────────────────────

import type { SessionEvent } from './types'
import { getOrCreateProfile, applyEvent } from './profile-engine'
import { saveProfile } from './storage'

/**
 * Fire-and-forget session event tracker.
 * Safe to call from any client-side code (components, hooks, event handlers).
 * No-op when called on the server (SSR/build time).
 *
 * Reads the profile from localStorage, applies the event, and persists.
 * Total cost: 2 localStorage reads + 1 write + negligible CPU.
 */
export function trackSessionEvent(event: SessionEvent): void {
  if (typeof window === 'undefined') return
  try {
    const profile = getOrCreateProfile()
    const updated = applyEvent(profile, event)
    saveProfile(updated)
  } catch {
    // Never surface tracking errors to users
  }
}
