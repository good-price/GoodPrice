/**
 * GOODPRICE Watchlist — Core Types
 *
 * Two layers of persistence:
 *
 *  1. LocalWatchlistItem   — stored in browser localStorage ('gp_watchlist')
 *                            Instant, requires no network, lost on browser clear.
 *
 *  2. AlertSubscription    — stored server-side in data/watchlist/subscriptions.json
 *                            Created when user provides an email; used for future
 *                            email alert dispatch via Resend (Phase N+1).
 *
 * Anonymous identity: a UUID (gp_uid) stored in localStorage acts as the
 * "user ID" for grouping subscriptions. No auth required.
 *
 * Trigger types (mirrors PriceAlert from lib/pricing/types.ts but scoped here
 * for the lightweight watchlist layer so it stays decoupled from the full pricing
 * alert system):
 *   'any_drop'      — any price decrease from the tracked baseline
 *   'all_time_low'  — price reaches recorded all-time minimum
 *   'price_below'   — price drops below a user-specified USD threshold
 */

// ── Local watchlist (localStorage) ───────────────────────────────────────────

export type AlertTrigger = 'any_drop' | 'all_time_low' | 'price_below'

/**
 * A product being tracked in the user's local watchlist.
 * Stored as a JSON array in localStorage['gp_watchlist'].
 */
export interface LocalWatchlistItem {
  /** Internal catalog ID (e.g. "elec-001") */
  productId:       string
  asin:            string
  title:           string
  /** Thumbnail image URL (from catalog) */
  imageUrl:        string
  category:        string
  /** Amazon catalog price at time of adding */
  catalogPriceUSD: number
  /** ISO timestamp when user added this */
  addedAt:         string
  /** If a server-side alert was created, store its ID here */
  alertSubscriptionId?: string
  /** Alert trigger type (set when user configures an alert) */
  alertTrigger?:   AlertTrigger
  /** Target USD price for 'price_below' trigger */
  alertTargetUSD?: number
}

// ── Server-side subscription (file store) ─────────────────────────────────────

/**
 * An email alert subscription stored server-side.
 * Created via POST /api/watchlist when user provides an email.
 * Future: triggers email dispatch via POST /api/alerts/detect.
 */
export interface AlertSubscription {
  /** Unique subscription ID: "sub_[uuid]" */
  id:              string
  /** Anonymous browser UUID from localStorage['gp_uid'] */
  anonId:          string
  /** User's email for notifications */
  email:           string
  /** Catalog product ID */
  productId:       string
  asin:            string
  productTitle:    string
  trigger:         AlertTrigger
  /** Required when trigger === 'price_below' */
  targetPriceUSD?: number
  /** Amazon catalog price at subscription time (baseline for 'any_drop') */
  catalogPriceUSD: number
  /** ISO creation timestamp */
  createdAt:       string
  /** ISO timestamp of last successful alert dispatch (null = never triggered) */
  lastTriggeredAt: string | null
  /** ISO timestamp of last detection run */
  lastCheckedAt:   string | null
  isActive:        boolean
}

/** Flat map of subscriptionId → subscription (stored as JSON) */
export type SubscriptionStore = Record<string, AlertSubscription>

// ── Detection results ─────────────────────────────────────────────────────────

export interface AlertDetectionResult {
  subscriptionId: string
  productId:      string
  email:          string
  triggered:      boolean
  reason?:        string
  /** Current ML price when checked */
  currentPriceUSD?: number
  targetPriceUSD?:  number
}

// ── Bulk pricing response ─────────────────────────────────────────────────────

/** Condensed offer data for the watchlist grid display */
export interface WatchlistOfferData {
  priceUSD:     number
  priceCOP:     number
  availability: string
  lastCheckedAt: string
  trend?:       string   // 'falling' | 'rising' | 'stable' | 'unknown'
  positionLabel?: string // "Precio mínimo histórico" etc.
  isNearATL:    boolean
}
