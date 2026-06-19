/**
 * GOODPRICE Pricing Infrastructure — Core Types
 *
 * Architecture overview:
 *
 *   Retailer API / Scraper
 *         ↓  RawRetailerData
 *   Normalization pipeline
 *         ↓  NormalizedRetailerProduct
 *   Deduplication + validation
 *         ↓  RetailerOffer
 *   Price snapshot recording
 *         ↓  PriceSnapshot → PriceHistoryPoint[]
 *   Stats computation
 *         ↓  ProductPriceStats
 *   Alert evaluation
 *         ↓  PriceAlert trigger → notification
 *
 * Data flow is strictly one-directional: raw → normalized → stored → analyzed.
 * Snapshots are immutable once recorded; stats are computed views.
 *
 * Future scaling path:
 *   Phase 1 (current):  Pure TypeScript types — no I/O
 *   Phase 2:            Manual price entry via admin API route
 *   Phase 3:            Scheduled Vercel Cron hitting retailer APIs
 *   Phase 4:            Full scraper workers + Supabase persistence
 *   Phase 5:            Real-time alerts via Resend/push notifications
 */

// ── Primitives ────────────────────────────────────────────────────────────────

/** ISO 4217 currency codes supported by GOODPRICE */
export type Currency = 'USD' | 'COP' | 'EUR'

/**
 * Real-time availability status parsed from retailer data.
 * 'unknown' is the safe default when parsing fails.
 */
export type AvailabilityStatus =
  | 'in_stock'     // confirmed available, can add to cart
  | 'out_of_stock' // listed but not purchasable
  | 'limited'      // low inventory warning from retailer
  | 'preorder'     // available for pre-purchase, not yet shipped
  | 'discontinued' // product no longer sold by this retailer
  | 'unknown'      // could not determine status

/**
 * Price movement direction over a given time window.
 * Computed by trend detection utilities in lib/pricing/utils/trends.ts
 */
export type PriceTrend =
  | 'rising'    // price consistently increasing
  | 'falling'   // price consistently decreasing (buy signal)
  | 'stable'    // minimal variance (< 5% range)
  | 'volatile'  // high variance (> 15% range)
  | 'unknown'   // insufficient data (< 3 data points)

/** Data ingestion source — determines trust level and validation strictness */
export type DataSource =
  | 'manual'          // entered by GOODPRICE team via admin
  | 'scraper'         // fetched by automated scraper (future)
  | 'affiliate_api'   // from Amazon PA-API or similar (future)
  | 'retailer_api'    // from official retailer API (future)
  | 'partner_feed'    // from retailer data feed/CSV (future)

/** Alert trigger conditions for user price notifications */
export type AlertTrigger =
  | 'price_below'        // price drops below a target USD amount
  | 'price_drop_percent' // price drops by X% from current
  | 'back_in_stock'      // availability changes to 'in_stock'
  | 'all_time_low'       // price reaches the recorded minimum
  | 'any_change'         // any price change (high frequency — use sparingly)

/** User notification delivery channels */
export type NotificationChannel = 'email' | 'push' | 'webhook'

/** Product tracking priority — affects check frequency and resource allocation */
export type TrackingPriority = 'high' | 'normal' | 'low'

// ── Retailer ──────────────────────────────────────────────────────────────────

/**
 * A retailer that GOODPRICE can track prices from.
 *
 * Each retailer has a provider implementation in lib/pricing/providers/
 * that handles URL building, normalization, and (future) fetching.
 */
export interface Retailer {
  /** Unique identifier — matches provider file name (e.g. 'amazon', 'alkosto') */
  id: string
  /** Human-readable display name */
  name: string
  /** URL-safe slug for display */
  slug: string
  /** Base domain — used for URL validation */
  baseUrl: string
  /** ISO 3166-1 alpha-2 country codes where this retailer operates */
  countries: string[]
  /** Primary currency for this retailer's pricing */
  currency: Currency
  /** Whether GOODPRICE has an affiliate program with this retailer */
  affiliateSupport: boolean
  /** Affiliate program tag/ID (if affiliateSupport = true) */
  affiliateTag?: string
  /** Retailer logo path for UI display */
  logoUrl?: string
  /** Does this retailer offer direct international shipping to Colombia? */
  shipsToColombiaDirectly: boolean
  /** Estimated delivery time to Colombia (for cost calculation) */
  shippingEstimateDays?: { min: number; max: number }
  /** Estimated shipping cost to Colombia in USD (null = varies) */
  estimatedShippingCostUSD?: number | null
  /** Customs/duty threshold — purchases above this may incur Colombian import fees */
  colombiaCustomsThresholdUSD?: number
}

// ── Offers ────────────────────────────────────────────────────────────────────

/**
 * A live price offer from a specific retailer for a specific product.
 *
 * RetailerOffer represents the CURRENT state of a product at a retailer.
 * Historical snapshots are stored separately as PriceSnapshot records.
 * This separation allows offers to be updated in-place while history accumulates.
 */
export interface RetailerOffer {
  /** Internal GOODPRICE product ID (matches catalog id field) */
  productId: string
  /** Retailer identifier (matches Retailer.id) */
  retailerId: string
  /** Retailer's own product identifier (ASIN for Amazon, SKU for local retailers, etc.) */
  externalId: string
  /** Direct product URL at the retailer */
  url: string
  /** Affiliate URL with tracking tag (generated by provider.buildAffiliateUrl) */
  affiliateUrl?: string
  /** Current price in the retailer's native currency */
  price: number
  /** Retailer's native currency */
  currency: Currency
  /** Price normalized to USD for cross-retailer comparison */
  priceUSD: number
  /** Original/crossed-out price shown by retailer, if any */
  oldPrice?: number
  /** Calculated savings percentage vs oldPrice (0–100) */
  discountPercent?: number
  /** Real-time availability at time of last check */
  availability: AvailabilityStatus
  /** Confirmed ships to Colombia (may require forwarding service for indirect) */
  shipsToColombiaConfirmed: boolean
  /** Estimated shipping cost to Colombia in USD */
  shippingCostEstimateUSD?: number
  /** Total landed cost in Colombia (price + shipping + estimated customs) */
  totalLandedCostUSD?: number
  /** When this offer was last fetched/verified */
  lastCheckedAt: string // ISO 8601
  /** How this offer data was obtained */
  source: DataSource
  /** Whether this offer has passed validation checks */
  isVerified: boolean
  /** When this data expires and should be re-fetched */
  validUntil?: string // ISO 8601
}

// ── Price history ─────────────────────────────────────────────────────────────

/**
 * An immutable point-in-time price record.
 *
 * PriceSnapshot is the source of truth for all historical analysis.
 * Once recorded, snapshots are never modified — only new ones are added.
 *
 * Storage estimate: ~200 bytes/snapshot.
 * At 5 checks/day × 100 products × 5 retailers = 2,500 snapshots/day.
 * 100k snapshots ≈ 40 days of full tracking data ≈ ~20 MB raw.
 *
 * Future DB table: price_snapshots (indexed on productId + retailerId + recordedAt)
 */
export interface PriceSnapshot {
  /** Unique snapshot ID (UUID v4 or content hash) */
  id: string
  /** Internal product ID */
  productId: string
  /** Retailer ID */
  retailerId: string
  /** Price in retailer's native currency */
  price: number
  /** Currency at time of snapshot */
  currency: Currency
  /** Normalized USD price (exchange rate at snapshot time) */
  priceUSD: number
  /** USD/COP exchange rate used for normalization */
  exchangeRateUsed?: number
  /** Availability at time of snapshot */
  availability: AvailabilityStatus
  /** When this snapshot was recorded */
  recordedAt: string // ISO 8601
  /** Ingestion source */
  source: DataSource
  /** Whether this was an all-time low at time of recording */
  wasAllTimeLow?: boolean
  /** Any additional metadata (scraper version, request ID, etc.) */
  metadata?: Record<string, unknown>
}

/**
 * Aggregated daily price point for time-series charting.
 *
 * PriceSnapshot raw records are compressed into daily aggregates for
 * efficient chart rendering. Multiple snapshots per day → one PriceHistoryPoint.
 */
export interface PriceHistoryPoint {
  /** Date in YYYY-MM-DD format */
  date: string
  /** Lowest price seen this day in USD */
  lowestPriceUSD: number
  /** Highest price seen this day in USD */
  highestPriceUSD: number
  /** Average price across all snapshots this day */
  averagePriceUSD: number
  /** Retailer that had the lowest price this day */
  bestRetailerId: string
  /** Availability status at end of day */
  endOfDayAvailability: AvailabilityStatus
  /** Number of raw snapshots aggregated into this point */
  snapshotCount: number
}

// ── Price statistics ──────────────────────────────────────────────────────────

/**
 * Computed price analysis for a product across all retailers.
 *
 * ProductPriceStats is a derived/computed view — always recalculated
 * from PriceSnapshot records, never edited directly.
 * Think of it as a materialized view in database terms.
 *
 * Recomputed: on each new snapshot ingestion, or lazily on request.
 */
export interface ProductPriceStats {
  /** Internal product ID */
  productId: string
  /** When these stats were last computed */
  computedAt: string // ISO 8601
  /** Number of snapshots used in computation */
  dataPoints: number
  /** Date range covered by available data */
  periodStart: string // ISO date
  periodEnd: string   // ISO date

  // ── Current state ────────────────────────────────────────────────────────────
  /** Best (lowest) current price across all retailers in USD */
  currentBestPriceUSD: number
  /** Retailer offering the best current price */
  currentBestRetailerId: string
  /** Total landed cost at current best price (inc. shipping, customs) */
  currentBestLandedCostUSD?: number

  // ── Historical bounds ────────────────────────────────────────────────────────
  /** All-time lowest price in USD (may not be currently available) */
  allTimeLowestUSD: number
  /** When the all-time low was recorded */
  allTimeLowestAt: string // ISO 8601
  /** Retailer that had the all-time low */
  allTimeLowestRetailerId: string
  /** All-time highest price in USD */
  allTimeHighestUSD: number

  // ── Averages ─────────────────────────────────────────────────────────────────
  /** Mean price across all snapshots in USD */
  averagePriceUSD: number
  /** Median price (more robust to outliers than mean) */
  medianPriceUSD: number
  /** Average price over last 30 days */
  avg30dPriceUSD?: number
  /** Average price over last 90 days */
  avg90dPriceUSD?: number

  // ── Trend analysis ───────────────────────────────────────────────────────────
  /** Detected price movement direction */
  trend: PriceTrend
  /** Price volatility score 0–1 (std deviation / mean). 0=stable, 1=very volatile */
  volatilityScore: number
  /** Price change over last 7 days in USD (negative = price dropped) */
  priceChange7dUSD?: number
  /** Price change over last 30 days as percentage */
  priceChange30dPercent?: number

  // ── Savings signals ──────────────────────────────────────────────────────────
  /** How much cheaper current best price is vs all-time high (percentage) */
  savingsVsHighPercent: number
  /** How much cheaper current best price is vs 90-day average (percentage) */
  savingsVsAvg90dPercent?: number
  /** Whether current price is at or near all-time low (within 5%) */
  isNearAllTimeLow: boolean
  /** Buy signal strength: 'strong' | 'moderate' | 'neutral' | 'wait' */
  buySignal: 'strong' | 'moderate' | 'neutral' | 'wait'
}

// ── Price drop events ─────────────────────────────────────────────────────────

/**
 * A significant price change event worth surfacing to users.
 *
 * Events are generated by the trend detection pipeline when a price
 * crosses a meaningful threshold. Stored for alert evaluation and
 * for powering "price drop" feeds on the frontend.
 */
export interface PriceDropEvent {
  id: string
  productId: string
  retailerId: string
  /** Price before the drop */
  previousPriceUSD: number
  /** Price after the drop */
  newPriceUSD: number
  /** Absolute drop in USD */
  dropAmountUSD: number
  /** Drop as percentage of previous price */
  dropPercent: number
  /** Whether this is a new all-time low */
  isAllTimeLow: boolean
  /** When the drop was detected */
  detectedAt: string // ISO 8601
  /** Whether alerts have been sent for this event */
  alertsDispatched: boolean
}

// ── Alerts ────────────────────────────────────────────────────────────────────

/**
 * A user-configured price alert subscription.
 *
 * Alerts are evaluated after each new PriceSnapshot is ingested.
 * When trigger conditions are met, a notification is dispatched
 * via the configured channel and lastTriggeredAt is updated.
 *
 * Future: stored in DB table 'price_alerts', linked to users table.
 */
export interface PriceAlert {
  id: string
  /** User ID — links to future users table */
  userId: string
  /** Internal product ID */
  productId: string
  /** Limit alert to a specific retailer (null = any retailer) */
  retailerId?: string
  /** What condition triggers this alert */
  trigger: AlertTrigger
  /** Target price in USD — required when trigger = 'price_below' */
  targetPriceUSD?: number
  /** Target drop percentage — required when trigger = 'price_drop_percent' */
  targetDropPercent?: number
  /** Whether this alert is currently active */
  isActive: boolean
  /** When this alert was created */
  createdAt: string // ISO 8601
  /** When this alert was last triggered */
  lastTriggeredAt?: string // ISO 8601
  /** Number of times this alert has triggered */
  triggerCount: number
  /** Delivery channel */
  notificationChannel: NotificationChannel
  /** Email address, push token, or webhook URL */
  notificationTarget: string
}

// ── Tracked products ──────────────────────────────────────────────────────────

/**
 * A product actively monitored by the GOODPRICE price tracker.
 *
 * TrackedProduct is the central entity linking the static catalog
 * (existing Product type) to the dynamic pricing layer.
 *
 * Relationship to existing catalog:
 *   Product (catalog) ─── 1:1 ───> TrackedProduct (pricing layer)
 *   TrackedProduct ──── 1:N ───> RetailerOffer[]
 *   TrackedProduct ──── 1:N ───> PriceSnapshot[]
 *   TrackedProduct ──── 1:1 ───> ProductPriceStats (computed view)
 */
export interface TrackedProduct {
  /** Internal GOODPRICE ID — matches existing catalog product.id */
  id: string
  /** ASIN for Amazon (primary retailer) */
  asin?: string
  /** Canonical product title (normalized, not retailer-specific) */
  title: string
  /** Brand name */
  brand?: string
  /** Category slug (matches existing catalog categories) */
  category: string
  /** Image URL from catalog */
  imageUrl: string
  /** Whether this product is currently being tracked */
  isActive: boolean
  /** Check interval in minutes (affects cron frequency) */
  checkFrequencyMinutes: number
  /** Priority determines resource allocation in the scheduler */
  priority: TrackingPriority
  /** Current offers across all tracked retailers */
  offers: RetailerOffer[]
  /** Computed price statistics (null if insufficient data) */
  priceStats?: ProductPriceStats
  /** Daily aggregated price history (up to 365 days) */
  history: PriceHistoryPoint[]
  /** When this product was added to the tracker */
  createdAt: string // ISO 8601
  /** When any offer or stat was last updated */
  updatedAt: string // ISO 8601
  /** When the next price check is scheduled */
  nextCheckAt?: string // ISO 8601
}

// ── Raw / intermediate pipeline types ────────────────────────────────────────

/**
 * Raw data returned by a fetcher (scraper or API) before normalization.
 *
 * RawRetailerData is the untrusted boundary input.
 * Nothing downstream should use this directly — always normalize first.
 *
 * Future: stored temporarily in an ingestion queue (Redis/SQS/Vercel Queue)
 * before the normalization worker processes it.
 */
export interface RawRetailerData {
  /** Retailer this data came from */
  retailerId: string
  /** URL that was fetched */
  url: string
  /** When the fetch completed */
  fetchedAt: string // ISO 8601
  /** HTTP status code from the fetch */
  httpStatus?: number
  /** Raw HTML content (future scraper output) */
  rawHtml?: string
  /** Raw JSON response (future API response) */
  rawJson?: unknown
  /** Any fetch error message */
  error?: string
  /** Whether the fetch succeeded */
  success: boolean
  /** Time taken to fetch in milliseconds */
  fetchDurationMs?: number
  /** Scraper/fetcher version that produced this data */
  scraperVersion?: string
}

/**
 * Normalized product data after running through the normalization pipeline.
 *
 * All retailer-specific quirks (currency symbols, availability strings,
 * price formats like "1.299.000" vs "$1,299,000") are resolved here.
 * Downstream code works exclusively with NormalizedRetailerProduct.
 */
export interface NormalizedRetailerProduct {
  /** Retailer's own product identifier */
  externalId: string
  /** Retailer source */
  retailerId: string
  /** Normalized product title (trimmed, no HTML entities) */
  title: string
  /** Price in retailer's native currency */
  price: number
  /** Native currency (detected or known from retailer config) */
  currency: Currency
  /** Price in USD (converted using exchange rate at normalization time) */
  priceUSD: number
  /** Exchange rate applied (USD per 1 unit of native currency) */
  exchangeRate: number
  /** Crossed-out/original price if shown by retailer */
  oldPrice?: number
  /** Parsed availability status */
  availability: AvailabilityStatus
  /** Normalized image URL */
  imageUrl: string
  /** Canonical product URL */
  url: string
  /** Whether shipping to Colombia was detected */
  shipsToColombiaConfirmed: boolean
  /** When normalization ran */
  normalizedAt: string // ISO 8601
  /** Validation warnings (non-fatal issues found during normalization) */
  warnings: string[]
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Result of validating a normalized product or offer */
export interface ValidationResult {
  isValid: boolean
  errors: string[]    // Fatal — discard record
  warnings: string[]  // Non-fatal — record but flag for review
}

// ── Exchange rates ────────────────────────────────────────────────────────────

/**
 * Currency exchange rate snapshot for USD normalization.
 *
 * Future: fetched from exchangerate-api.com or similar on a daily schedule.
 * Current: hardcoded reference rates for infrastructure testing.
 */
export interface ExchangeRateSnapshot {
  /** Base currency (always USD in our system) */
  baseCurrency: 'USD'
  /** Target currency */
  targetCurrency: Currency
  /** Rate: how many target currency units = 1 USD */
  rate: number
  /** When this rate was fetched */
  fetchedAt: string // ISO 8601
  /** Rate source */
  source: 'manual' | 'api' | 'fallback'
}
