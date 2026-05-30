/**
 * lib/session/storage.ts
 *
 * localStorage abstraction for the GOODPRICE session profile.
 *
 * Design:
 *   - All reads and writes are synchronous (localStorage is sync)
 *   - All operations are guarded for SSR (typeof window check)
 *   - All operations are try/catch wrapped for:
 *       · Firefox private mode (throws on localStorage access)
 *       · iOS Safari storage quota exceeded
 *       · Corrupt JSON from a previous schema version
 *   - Schema versioning: if stored schema ≠ SESSION_SCHEMA_VERSION,
 *     the stored profile is discarded and a fresh one is created
 *
 * Public API:
 *   loadProfile()           → SessionProfile | null
 *   saveProfile(profile)    → void
 *   clearProfile()          → void (for testing / opt-out)
 */

import type { SessionProfile } from './types'
import { SESSION_SCHEMA_VERSION } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const STORAGE_KEY              = 'gp_session_v1'
export const MAX_PRODUCT_HISTORY      = 50
export const MAX_SEARCH_HISTORY       = 20
export const MAX_RECOMMENDATION_HISTORY = 100

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAvailable(): boolean {
  return typeof window !== 'undefined'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads the stored SessionProfile from localStorage.
 * Returns null when:
 *   - Running on the server (SSR/ISR)
 *   - localStorage is unavailable (private mode, security policy)
 *   - No profile has been stored yet
 *   - The stored data is corrupt or from an older schema version
 */
export function loadProfile(): SessionProfile | null {
  if (!isAvailable()) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionProfile>
    // Schema version guard — discard stale profiles cleanly
    if (parsed.schemaVersion !== SESSION_SCHEMA_VERSION) return null
    return parsed as SessionProfile
  } catch {
    return null
  }
}

/**
 * Writes the SessionProfile to localStorage.
 * Silent no-op when localStorage is unavailable or quota exceeded.
 */
export function saveProfile(profile: SessionProfile): void {
  if (!isAvailable()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Storage quota exceeded or private mode — fail silently
  }
}

/**
 * Removes the session profile from localStorage.
 * Can be called to implement a "forget me" / privacy opt-out flow.
 */
export function clearProfile(): void {
  if (!isAvailable()) return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore — if localStorage is unavailable, there's nothing to clear
  }
}
