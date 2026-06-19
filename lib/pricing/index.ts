/**
 * GOODPRICE Pricing Infrastructure — Public API
 *
 * Single import point for all pricing functionality.
 * Internal modules can import from each other directly;
 * external code (app routes, components, admin) imports from here.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PHASE 15 STATUS — What's done and what's deferred                      │
 * ├──────────────────────────────────────────────────────────────────────────┤
 * │  ✅ DONE (Phase 15 — Pure TypeScript architecture)                       │
 * │     • All core types (types.ts)                                          │
 * │     • Provider interfaces + 5 retailer implementations                  │
 * │     • Normalization pipeline (price, availability, product)              │
 * │     • Utility modules (currency, savings, trends, comparison, ranking)  │
 * │     • Database schema definitions (no connection)                        │
 * │     • Future query type signatures (no implementation)                   │
 * │     • API + job + cache + rate limit type planning                       │
 * │                                                                          │
 * │  ⏳ DEFERRED (Phase N+2 — First real integration)                        │
 * │     • Supabase client + database migrations                              │
 * │     • Amazon PA-API for image refresh and ASIN verification    │
 * │     • Admin UI for manual price entry                                    │
 * │     • /api/prices/[productId] route                                      │
 * │     • /api/jobs/price-check Vercel Cron route                           │
 * │     • PriceHistoryChart component                                        │
 * │                                                                          │
 * │  ⏳ DEFERRED (Phase N+3 — Scraper workers)                               │
 * │     • HTML scrapers for Alkosto, Falabella, Éxito                       │
 * │     • Upstash Redis rate limiting + circuit breaker                      │
 * │     • Ingestion queue (Vercel Queue or QStash)                           │
 * │                                                                          │
 * │  ⏳ DEFERRED (Phase N+4 — Alerts + user features)                        │
 * │     • Supabase Auth integration                                          │
 * │     • Price alert subscriptions                                          │
 * │     • Email notifications via Resend                                     │
 * │     • Price history charts on product pages                              │
 * │     • "Price drop" feed on homepage                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Module dependency graph (no circular deps):
 *
 *   types.ts
 *     ↑
 *   providers/types.ts ← providers/[retailer].ts → providers/index.ts
 *     ↑
 *   normalizers/price.ts
 *   normalizers/availability.ts
 *   normalizers/product.ts ← uses normalizers/price.ts + normalizers/availability.ts
 *   normalizers/index.ts
 *     ↑
 *   utils/currency.ts
 *   utils/savings.ts
 *   utils/trends.ts
 *   utils/comparison.ts ← uses utils/savings.ts
 *   utils/ranking.ts
 *   utils/index.ts
 *     ↑
 *   database/schemas.ts
 *   database/queries.ts ← uses database/schemas.ts
 *     ↑
 *   api/types.ts
 *     ↑
 *   index.ts (this file)
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  Currency,
  AvailabilityStatus,
  PriceTrend,
  DataSource,
  AlertTrigger,
  NotificationChannel,
  TrackingPriority,
  Retailer,
  RetailerOffer,
  PriceSnapshot,
  PriceHistoryPoint,
  ProductPriceStats,
  PriceDropEvent,
  PriceAlert,
  TrackedProduct,
  RawRetailerData,
  NormalizedRetailerProduct,
  ValidationResult,
  ExchangeRateSnapshot,
} from './types'

// ── Provider registry ─────────────────────────────────────────────────────────
export {
  PROVIDER_REGISTRY,
  getProvider,
  requireProvider,
  getAllProviders,
  getAllRetailerIds,
  getAllRetailers,
  // Named providers (for direct access when retailer is known at compile time)
  amazonProvider,
  alkostoProvider,
  falabellaProvider,
  exitoProvider,
} from './providers'

export type { RetailerProvider, ProviderRegistry, ProviderLookupResult } from './providers'

// ── Normalizers ───────────────────────────────────────────────────────────────
export {
  // Price
  getReferenceRate,
  toUSD,
  fromUSD,
  parseUSDPrice,
  parseCOPPrice,
  parsePrice,
  isPriceReasonable,
  detectPriceAnomaly,
  // Availability
  normalizeAvailabilityString,
  normalizeAvailabilityFromQuantity,
  normalizeAvailabilityFromBoolean,
  combineAvailabilitySignals,
  AVAILABILITY_LABELS,
  AVAILABILITY_COLORS,
  isAvailableToBuy,
  isUnavailable,
  // Product pipeline
  enrichNormalizedProduct,
  validateNormalizedProduct,
  checkDuplicate,
  createSnapshot,
  runNormalizationPipeline,
  DEDUPE_CONFIG,
} from './normalizers'

export type { NormalizeResult, DedupeResult, IngestionResult } from './normalizers'

// ── Utilities ─────────────────────────────────────────────────────────────────
export {
  // Currency
  formatUSD,
  formatCOP,
  formatPrice,
  formatDualCurrency,
  formatPriceRange,
  formatUSDCompact,
  formatSavingsAmount,
  calculateLandedCostUSD,
  formatLandedCostBreakdown,
  // Savings
  savingsPercent,
  savingsAmount,
  offerDiscountPercent,
  offerDiscountAmount,
  savingsVsLocal,
  savingsVsAllTimeHigh,
  savingsVs90dAverage,
  priceProximityToATL,
  computeBuySignal,
  selectBestOffer,
  selectRunnerUpOffer,
  savingsBadgeLabel,
  // Trends
  detectTrend,
  computeVolatility,
  detectPriceDropEvents,
  priceChangeOverDays,
  isNearAllTimeLow,
  rollingAverage,
  computeRollingAverages,
  // Comparison
  sortOffersByLandedCost,
  sortOffersByPrice,
  buildOfferComparisonTable,
  pricePositionInRange,
  pricePositionLabel,
  generateSnapshotId,
  isAmazonCheaperThanLocal,
  averageAmazonSavingsVsLocal,
  computeProductPriceStats,
  // Ranking
  rankRetailers,
  getRecommendedRetailer,
  assignContextualBadges,
  getRetailerBadges,
  isLocalRetailer,
  estimatedDeliveryDays,
} from './utils'

export type { OfferComparisonRow, RetailerScore } from './utils'

// ── Database schemas (planning only) ─────────────────────────────────────────
export type {
  DbProduct,
  DbRetailer,
  DbRetailerOffer,
  DbPriceSnapshot,
  DbPriceHistoryDaily,
  DbProductPriceStats,
  DbPriceAlert,
  DbUser,
} from './database/schemas'

export type {
  PaginationParams,
  PaginatedResult,
  ProductDisplayData,
  ProductCardData,
} from './database/queries'

// ── API planning (deferred) ───────────────────────────────────────────────────
export type {
  PriceCheckJobInput,
  PriceCheckJobResult,
  CompressHistoryJobInput,
  CompressHistoryJobResult,
  IngestionQueueItem,
  QueueStats,
  GetProductPricesResponse,
  GetPriceHistoryResponse,
  CreateAlertRequest,
  CreateAlertResponse,
  CacheEntry,
  CacheResult,
  RateLimitConfig,
  AlertNotificationPayload,
  NotificationDispatchResult,
} from './api/types'

export { RETAILER_RATE_LIMITS } from './api/types'
