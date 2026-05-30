/**
 * GOODPRICE Pricing — Future Database Query Shapes
 *
 * This file defines the planned query interfaces and parameter shapes
 * for Supabase/Postgres. NO real queries are executed yet.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Implementation status: DEFERRED (Phase N+2)                        │
 * │  When ready: implement with Supabase client or Drizzle ORM.         │
 * │  The function signatures below are the target API surface.          │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Query design principles:
 *   1. All queries return typed results (no `any`)
 *   2. Pagination via cursor-based (keyset) pagination — not OFFSET
 *   3. Read queries are optimized for Supabase's PostgREST API
 *   4. Write queries use upserts where possible (idempotent ingestion)
 *   5. Heavy aggregations run as Postgres functions (not in app code)
 *
 * Supabase client pattern (Phase N+2):
 *   import { createClient } from '@supabase/supabase-js'
 *   const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
 *
 * Drizzle ORM pattern (alternative Phase N+2):
 *   import { db } from '@/lib/db'
 *   import { priceSnapshots } from '@/lib/db/schema'
 */

import type {
  DbProduct,
  DbRetailerOffer,
  DbPriceSnapshot,
  DbPriceHistoryDaily,
  DbProductPriceStats,
  DbPriceAlert,
} from './schemas'

// ── Query parameter types ─────────────────────────────────────────────────────

/** Cursor-based pagination parameters */
export interface PaginationParams {
  /** Maximum number of records to return */
  limit: number
  /** Cursor value from the previous page (ISO timestamp or ID) */
  cursor?: string
  /** Sort direction */
  order?: 'asc' | 'desc'
}

/** Result wrapper for paginated queries */
export interface PaginatedResult<T> {
  data: T[]
  /** Cursor to pass for the next page (null = no more pages) */
  nextCursor: string | null
  /** Total count (may be null if expensive to compute) */
  totalCount?: number
}

// ── Product queries ───────────────────────────────────────────────────────────

/**
 * Get all active tracked products for the price check scheduler.
 *
 * @deferred Phase N+2
 * Future implementation:
 *   SELECT * FROM products
 *   WHERE is_active = true
 *   AND (next_check_at IS NULL OR next_check_at <= NOW())
 *   ORDER BY priority DESC, next_check_at ASC
 *   LIMIT $limit
 */
export interface GetProductsForCheckParams {
  limit?: number
  priority?: 'high' | 'normal' | 'low'
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetProductsForCheck = (params?: GetProductsForCheckParams) => Promise<DbProduct[]>

/**
 * Get a single product with its current offers and stats.
 *
 * @deferred Phase N+2
 * Future implementation: JOIN products + retailer_offers + product_price_stats
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetProductWithOffers = (productId: string) => Promise<{
  product: DbProduct
  offers: DbRetailerOffer[]
  stats: DbProductPriceStats | null
} | null>

// ── Offer queries ─────────────────────────────────────────────────────────────

/**
 * Upsert a retailer offer (insert or update on conflict).
 * Key: (product_id, retailer_id)
 *
 * @deferred Phase N+2
 * Future implementation:
 *   INSERT INTO retailer_offers (...) VALUES (...)
 *   ON CONFLICT (product_id, retailer_id) DO UPDATE SET ...
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type UpsertRetailerOffer = (offer: DbRetailerOffer) => Promise<DbRetailerOffer>

/**
 * Get all current offers for a product across retailers.
 *
 * @deferred Phase N+2
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetOffersForProduct = (productId: string) => Promise<DbRetailerOffer[]>

// ── Snapshot queries ──────────────────────────────────────────────────────────

/**
 * Insert a new price snapshot (append-only — never update).
 *
 * @deferred Phase N+2
 * Future implementation:
 *   INSERT INTO price_snapshots (...) VALUES (...)
 *   ON CONFLICT (id) DO NOTHING  -- idempotent: skip duplicates
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type InsertPriceSnapshot = (snapshot: DbPriceSnapshot) => Promise<void>

/**
 * Get recent snapshots for a product (for trend analysis and chart data).
 *
 * @deferred Phase N+2
 * Future implementation:
 *   SELECT * FROM price_snapshots
 *   WHERE product_id = $productId
 *   AND recorded_at > NOW() - INTERVAL '$days days'
 *   ORDER BY recorded_at DESC
 *   LIMIT $limit
 */
export interface GetSnapshotsParams extends PaginationParams {
  productId: string
  retailerId?: string
  days?: number         // look-back window (default: 90)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetSnapshots = (params: GetSnapshotsParams) => Promise<PaginatedResult<DbPriceSnapshot>>

/**
 * Count snapshots for a product (used to gate alert evaluation).
 *
 * @deferred Phase N+2
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type CountSnapshots = (productId: string) => Promise<number>

// ── Historical aggregation queries ────────────────────────────────────────────

/**
 * Get daily aggregated history for chart rendering.
 *
 * @deferred Phase N+2
 * Future implementation:
 *   SELECT * FROM price_history_daily
 *   WHERE product_id = $productId
 *   AND date >= NOW() - INTERVAL '$days days'
 *   ORDER BY date ASC
 */
export interface GetHistoryParams {
  productId: string
  retailerId?: string
  days?: number       // 30, 90, 365
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetPriceHistory = (params: GetHistoryParams) => Promise<DbPriceHistoryDaily[]>

/**
 * Aggregate yesterday's snapshots into daily history records.
 * Called by the scheduled compression job (daily cron).
 *
 * @deferred Phase N+2
 * Future implementation: Supabase Database Function (PL/pgSQL)
 *   CREATE OR REPLACE FUNCTION compress_daily_history(target_date DATE)
 *   RETURNS void AS $$
 *     INSERT INTO price_history_daily (product_id, retailer_id, date, ...)
 *     SELECT product_id, retailer_id, $target_date,
 *            MIN(price_usd), MAX(price_usd), AVG(price_usd), ...
 *     FROM price_snapshots
 *     WHERE DATE(recorded_at) = $target_date
 *     GROUP BY product_id, retailer_id
 *     ON CONFLICT (product_id, retailer_id, date) DO UPDATE SET ...
 *   $$ LANGUAGE sql;
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type CompressDailyHistory = (targetDate: string) => Promise<{ rowsInserted: number }>

// ── Stats queries ─────────────────────────────────────────────────────────────

/**
 * Upsert computed stats for a product.
 * Called after each ingestion batch.
 *
 * @deferred Phase N+2
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type UpsertProductStats = (stats: DbProductPriceStats) => Promise<void>

/**
 * Get stats for multiple products (for index/listing pages).
 *
 * @deferred Phase N+2
 * Future implementation: single SELECT WHERE product_id = ANY($ids)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetStatsForProducts = (productIds: string[]) => Promise<Map<string, DbProductPriceStats>>

// ── Alert queries ─────────────────────────────────────────────────────────────

/**
 * Get all active alerts for a product (for alert evaluation after ingestion).
 *
 * @deferred Phase N+2
 * Future implementation:
 *   SELECT * FROM price_alerts
 *   WHERE product_id = $productId AND is_active = true
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetActiveAlertsForProduct = (productId: string) => Promise<DbPriceAlert[]>

/**
 * Mark an alert as triggered (update last_triggered_at and increment count).
 *
 * @deferred Phase N+2
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type MarkAlertTriggered = (alertId: string) => Promise<void>

/**
 * Get alerts due for evaluation (alerts where the product has a new snapshot
 * since the last trigger check).
 *
 * @deferred Phase N+2
 * Future implementation: JOIN with recent price_snapshots
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GetAlertsDueForEvaluation = (
  since: string,  // ISO timestamp — evaluate alerts with products updated after this
) => Promise<DbPriceAlert[]>

// ── Query result summary types ────────────────────────────────────────────────

/** Rich product data for display (product + offers + stats + recent history) */
export interface ProductDisplayData {
  product:      DbProduct
  offers:       DbRetailerOffer[]
  stats:        DbProductPriceStats | null
  history30d:   DbPriceHistoryDaily[]
}

/** Lightweight product card data (no full history needed) */
export interface ProductCardData {
  product:      Pick<DbProduct, 'id' | 'title' | 'brand' | 'image_url' | 'category'>
  bestOffer:    DbRetailerOffer | null
  stats:        Pick<DbProductPriceStats, 'is_near_all_time_low' | 'buy_signal' | 'trend'> | null
}
