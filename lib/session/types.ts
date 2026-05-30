/**
 * lib/session/types.ts
 *
 * All types for the GOODPRICE session intelligence system.
 *
 * Design principles:
 *   - No PII of any kind — categories, slugs, and product IDs only
 *   - Client-side storage (localStorage) — profile never sent to server
 *   - Server receives only anonymised aggregate signals for admin analytics
 *   - No third-party identifiers, fingerprinting, or external services
 */

// ── Current schema version ─────────────────────────────────────────────────────
// Bump when SessionProfile shape changes — triggers a graceful profile reset
// rather than attempting a migration that could leave stale data.
export const SESSION_SCHEMA_VERSION = 1 as const

// ── Session profile (stored in localStorage) ──────────────────────────────────

/**
 * Anonymous session profile — the complete behavioural picture for one browser.
 * Stored as JSON under the key `gp_session_v1` in localStorage.
 *
 * All arrays are capped (see storage.ts constants) to keep the payload lean.
 * Never contains names, emails, IP addresses, or any identifying strings.
 */
export interface SessionProfile {
  /** Opaque random ID — generated once, stored only in localStorage */
  sessionId:     string
  schemaVersion: typeof SESSION_SCHEMA_VERSION
  createdAt:     string   // ISO timestamp of first visit
  lastActiveAt:  string   // ISO timestamp of last event

  /** How many times this browser has visited the site */
  visitCount: number

  // ── Category-level signals ───────────────────────────────────────────────────
  /** category slug → view count (incremented on category page visit) */
  viewedCategories:  Record<string, number>
  /** category slug → click count (incremented on Amazon CTA click) */
  clickedCategories: Record<string, number>

  // ── Product-level signals (capped to MAX_PRODUCT_HISTORY) ───────────────────
  /** Product IDs viewed (most-recent first) */
  viewedProducts:  string[]
  /** Product IDs where the Amazon CTA was clicked (most-recent first) */
  clickedProducts: string[]

  // ── Other signals ─────────────────────────────────────────────────────────────
  /** Product IDs currently in the watchlist */
  watchlistProducts: string[]
  /** Search terms entered (most-recent first, capped to MAX_SEARCH_HISTORY) */
  searchTerms: string[]

  // ── Recommendation memory (anti-repetition) ───────────────────────────────────
  /**
   * Product IDs that have been surfaced as personalised recommendations.
   * The API excludes these IDs to prevent the same products appearing repeatedly.
   * Capped to MAX_RECOMMENDATION_HISTORY — oldest entries are dropped.
   */
  seenRecommendations: string[]
}

// ── Session events (fired client-side) ───────────────────────────────────────

export type SessionEventType =
  | 'category_view'
  | 'product_view'
  | 'product_click'
  | 'search'
  | 'watchlist_add'
  | 'watchlist_remove'
  | 'recommendation_click'

export interface SessionEvent {
  type:       SessionEventType
  /** Category slug — set for category_view and product_click */
  category?:  string
  /** Product ID (not ASIN) — set for product_view, product_click, watchlist_*, recommendation_click */
  productId?: string
  /** Search query — set for search events */
  query?:     string
  /** Date.now() when the event occurred */
  ts:         number
}

// ── Affinity scores (computed in-browser from SessionProfile) ─────────────────

export interface AffinityScore {
  category:   string
  /** Composite score (0–1): views weighted + clicks weighted, normalised */
  score:      number
  viewCount:  number
  clickCount: number
}

// ── Server-side aggregate signals ─────────────────────────────────────────────
// Posted anonymously to /api/session/events — no session ID or PII included.

export interface SessionSignal {
  /** Top 3 category slugs from the session's affinity ranking */
  topCategories:  string[]
  /** Whether this is a return visit (visitCount > 1) */
  isReturn:        boolean
  /** Whether the user has any watchlist items */
  hasWatchlist:    boolean
  /** Date.now() at signal time */
  ts:              number
}

export interface SessionSignalFile {
  updatedAt: string
  /** Rolling array, capped at MAX_SIGNALS_STORED */
  signals:   SessionSignal[]
}

// ── Admin analytics (derived server-side from SignalFile) ─────────────────────

export interface CategoryInterestStat {
  category: string
  /** Number of sessions that expressed interest in this category */
  count:    number
  /** Percentage of total signals that included this category */
  pct:      number
}

export interface SessionAnalytics {
  /** Analysis window in days */
  windowDays:             number
  /** Total session signals in the window (≈ unique sessions) */
  totalSessions:          number
  /** Fraction of sessions that are return visits (0–1) */
  returnRate:             number
  /** Fraction of sessions with at least one watchlist item (0–1) */
  watchlistAdoptionRate:  number
  /** Top categories ranked by interest signal count */
  topCategories:          CategoryInterestStat[]
  /** ISO timestamp of the most recent signal received, or null */
  lastSignalAt:           string | null
  /** Whether any data exists for the window */
  hasData:                boolean
}
