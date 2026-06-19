/**
 * GOODPRICE Pricing — Future API & Job Infrastructure Planning
 *
 * This file defines the interfaces for:
 *   1. Scheduled price check jobs (Vercel Cron)
 *   2. Ingestion queue (ordered processing of raw data)
 *   3. HTTP API routes for price data (future /api/prices/*)
 *   4. Cache layer (Redis/Upstash for rate limiting + response caching)
 *   5. Rate limiting configuration per retailer
 *   6. Notification dispatch (email/push via Resend)
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Implementation status: DEFERRED (Phase N+2 and beyond)            │
 * │  This file is architecture planning only — no runtime code.        │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Job execution model (target architecture):
 *
 *   Vercel Cron → /api/jobs/price-check
 *        ↓
 *   Price Check Job (select products due for check)
 *        ↓  (for each product × retailer)
 *   Fetch Adapter (provider.fetchProduct)
 *        ↓  RawRetailerData
 *   Normalization Pipeline (runNormalizationPipeline)
 *        ↓  PriceSnapshot
 *   Database Write (insertPriceSnapshot + upsertRetailerOffer)
 *        ↓
 *   Alert Evaluator (check active alerts for this product)
 *        ↓  (if triggered)
 *   Notification Dispatch (Resend email / push / webhook)
 *        ↓
 *   Stats Recompute (upsertProductStats)
 *
 * Rate limiting strategy:
 *   - Per-retailer rate limits enforced via Upstash Redis token bucket
 *   - Job orchestrator respects RETAILER_RATE_LIMITS before each fetch
 *   - Failed fetches are retried with exponential backoff (see FetchConfig)
 *   - Circuit breaker: retailer disabled for 1 hour after 5 consecutive failures
 */

// ── Job types ─────────────────────────────────────────────────────────────────

/**
 * Input to the price check job triggered by Vercel Cron.
 * The job is idempotent — running it twice for the same batch is safe.
 *
 * @deferred Phase N+2
 * Cron schedule: "0 * * * *" (every hour)
 * Route: /api/jobs/price-check
 * Auth: CRON_SECRET header (Vercel Cron auto-injects this)
 */
export interface PriceCheckJobInput {
  /** Override which products to check (empty = all due products) */
  productIds?: string[]
  /** Override which retailers to check (empty = all registered) */
  retailerIds?: string[]
  /** Max products to process in this run (default: 50) */
  batchSize?: number
  /** Run in dry-run mode: normalize but don't persist */
  dryRun?: boolean
}

/**
 * Result returned by the price check job.
 *
 * @deferred Phase N+2
 */
export interface PriceCheckJobResult {
  /** When the job started */
  startedAt: string
  /** When the job finished */
  finishedAt: string
  /** Total duration in milliseconds */
  durationMs: number
  /** Number of products processed */
  productsChecked: number
  /** Number of retailer fetches attempted */
  fetchesAttempted: number
  /** Number of fetches that succeeded */
  fetchesSucceeded: number
  /** Number of new snapshots recorded */
  snapshotsRecorded: number
  /** Number of alerts triggered */
  alertsTriggered: number
  /** Products that had price changes */
  priceChanges: Array<{
    productId:    string
    retailerId:   string
    oldPriceUSD:  number
    newPriceUSD:  number
    changePercent: number
    isAllTimeLow: boolean
  }>
  /** Errors encountered (non-fatal) */
  errors: Array<{
    productId?: string
    retailerId?: string
    stage:      string
    message:    string
  }>
}

/**
 * The daily history compression job.
 * Runs at 00:05 UTC to compress the previous day's snapshots.
 *
 * @deferred Phase N+2
 * Cron schedule: "5 0 * * *"
 * Route: /api/jobs/compress-history
 */
export interface CompressHistoryJobInput {
  /** Date to compress (default: yesterday) */
  date?: string  // YYYY-MM-DD
}

export interface CompressHistoryJobResult {
  date:         string
  rowsInserted: number
  durationMs:   number
}

// ── Ingestion queue ───────────────────────────────────────────────────────────

/**
 * A single item in the ingestion queue.
 * The queue decouples fetching (I/O bound) from normalization (CPU bound).
 *
 * @deferred Phase N+2
 * Implementation options:
 *   - Vercel Queue (if available)
 *   - Upstash QStash (HTTP-based queue)
 *   - In-memory queue (simplest, no persistence, Phase N+2 start)
 */
export interface IngestionQueueItem {
  id:          string   // UUID
  productId:   string
  retailerId:  string
  priority:    'high' | 'normal' | 'low'
  enqueuedAt:  string   // ISO
  attempts:    number
  maxAttempts: number
  /** ISO timestamp after which this item expires without processing */
  expiresAt:   string
}

/** Queue statistics for monitoring */
export interface QueueStats {
  depth:          number   // total items in queue
  processing:     number   // items currently being processed
  failed:         number   // items that exceeded maxAttempts
  throughputPerHour: number // items processed in last hour
}

// ── API route types ───────────────────────────────────────────────────────────

/**
 * GET /api/prices/[productId]
 * Returns current offers + stats for a product.
 *
 * @deferred Phase N+2
 * Cache: 60 seconds (stale-while-revalidate)
 */
export interface GetProductPricesResponse {
  productId:   string
  updatedAt:   string
  offers:      Array<{
    retailerId:      string
    retailerName:    string
    priceUSD:        number
    landedCostUSD:   number
    availability:    string
    affiliateUrl:    string
    lastCheckedAt:   string
  }>
  stats: {
    currentBestPriceUSD:  number
    allTimeLowestUSD:     number
    trend:                string
    buySignal:            string
    isNearAllTimeLow:     boolean
  } | null
}

/**
 * GET /api/prices/[productId]/history
 * Returns daily price history for chart rendering.
 *
 * @deferred Phase N+2
 * Cache: 10 minutes (history changes slowly)
 */
export interface GetPriceHistoryResponse {
  productId:  string
  retailerId: string | 'best'  // 'best' = minimum across all retailers per day
  days:       number
  history:    Array<{
    date:          string   // YYYY-MM-DD
    lowestPriceUSD: number
    averagePriceUSD: number
  }>
}

/**
 * POST /api/alerts
 * Create a new price alert subscription.
 *
 * @deferred Phase N+2
 * Auth: Supabase session token required
 */
export interface CreateAlertRequest {
  productId:           string
  retailerId?:         string
  trigger:             string
  targetPriceUSD?:     number
  targetDropPercent?:  number
  notificationChannel: string
  notificationTarget:  string
}

export interface CreateAlertResponse {
  alertId:   string
  createdAt: string
  message:   string
}

// ── Cache layer ───────────────────────────────────────────────────────────────

/**
 * Cache entry for price data.
 * Phase N+2: implement with Upstash Redis (KV on Vercel Edge).
 *
 * Cache key patterns:
 *   prices:{productId}           → GetProductPricesResponse (TTL: 60s)
 *   history:{productId}:{days}   → GetPriceHistoryResponse  (TTL: 600s)
 *   stats:{productId}            → DbProductPriceStats       (TTL: 300s)
 *   exchange_rates               → ExchangeRateSnapshot[]    (TTL: 3600s)
 */
export interface CacheEntry<T> {
  data:      T
  cachedAt:  string  // ISO
  expiresAt: string  // ISO
  hitCount:  number  // incremented on cache hit (for analytics)
}

/** Cache operation result */
export type CacheResult<T> =
  | { hit: true;  entry: CacheEntry<T> }
  | { hit: false; reason: 'miss' | 'expired' | 'error' }

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Per-retailer rate limit configuration.
 * Enforced by the job orchestrator before each fetch.
 *
 * @deferred Phase N+2
 * Implementation: Upstash Redis token bucket algorithm
 */
export interface RateLimitConfig {
  /** Retailer ID this config applies to */
  retailerId:         string
  /** Maximum requests per minute */
  requestsPerMinute:  number
  /** Maximum requests per hour */
  requestsPerHour:    number
  /** Minimum delay between consecutive requests (ms) */
  minDelayBetweenMs:  number
  /** Whether the circuit breaker is currently open (retailer is paused) */
  circuitOpen:        boolean
  /** When circuit opens — retry after this time */
  circuitRetryAfter?: string  // ISO
}

/** Per-retailer rate limit defaults (conservative — adjust based on observed behavior) */
export const RETAILER_RATE_LIMITS: Record<string, RateLimitConfig> = {
  amazon: {
    retailerId:          'amazon',
    requestsPerMinute:   10,
    requestsPerHour:     500,  // PA-API limit: 8,640/day
    minDelayBetweenMs:   2_000,
    circuitOpen:         false,
  },
  alkosto: {
    retailerId:          'alkosto',
    requestsPerMinute:   5,    // scraper — very conservative
    requestsPerHour:     100,
    minDelayBetweenMs:   5_000,
    circuitOpen:         false,
  },
  falabella: {
    retailerId:          'falabella',
    requestsPerMinute:   5,
    requestsPerHour:     100,
    minDelayBetweenMs:   5_000,
    circuitOpen:         false,
  },
  exito: {
    retailerId:          'exito',
    requestsPerMinute:   5,
    requestsPerHour:     100,
    minDelayBetweenMs:   5_000,
    circuitOpen:         false,
  },
}

// ── Notification dispatch ─────────────────────────────────────────────────────

/**
 * Payload for dispatching a price alert notification.
 * Phase N+2: send via Resend (email) or Web Push API.
 *
 * Resend integration pattern:
 *   import { Resend } from 'resend'
 *   const resend = new Resend(process.env.RESEND_API_KEY)
 *   await resend.emails.send({ from, to, subject, react: <AlertEmail {...payload} /> })
 */
export interface AlertNotificationPayload {
  alertId:         string
  userId:          string
  channel:         'email' | 'push' | 'webhook'
  target:          string  // email, push token, or webhook URL
  productTitle:    string
  productImageUrl: string
  productUrl:      string  // affiliate URL
  triggerType:     string
  currentPriceUSD: number
  previousPriceUSD?: number
  allTimeLowestUSD?: number
  dropPercent?:    number
  retailerName:    string
  sentAt:          string  // ISO
}

/** Result of a notification dispatch attempt */
export interface NotificationDispatchResult {
  alertId:   string
  success:   boolean
  channel:   string
  messageId?: string   // provider message ID (Resend email ID, etc.)
  error?:    string
  sentAt:    string
}
