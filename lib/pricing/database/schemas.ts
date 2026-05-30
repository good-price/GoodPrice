/**
 * GOODPRICE Pricing — Future Database Schema Definitions
 *
 * This file defines the target database schema for Supabase/Postgres.
 * NO real database connection exists yet — this is pure TypeScript planning.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Implementation status: DEFERRED (Phase N+2)                        │
 * │  When ready: create these as Supabase migrations using the SQL      │
 * │  comments below each interface as the migration source of truth.    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Target database: Supabase (Postgres 15)
 * ORM: Drizzle ORM (planned) — type-safe, no Prisma overhead
 * Migration tool: Drizzle Kit or Supabase migrations
 *
 * Entity relationship overview:
 *
 *   users
 *     └── price_alerts (N) → products (1)
 *
 *   retailers (1) ←── retailer_offers (N) ──→ products (1)
 *                                ↓
 *                         price_snapshots (N)
 *                                ↓
 *                      price_history_daily (N)  ← aggregated from snapshots
 *
 *   products (1) ──→ product_price_stats (1)  ← computed/materialized view
 *
 * Indexing strategy:
 *   - price_snapshots: (product_id, retailer_id, recorded_at DESC)
 *   - price_snapshots: (product_id, recorded_at DESC) for history queries
 *   - retailer_offers: (product_id, retailer_id) UNIQUE
 *   - price_alerts: (user_id, is_active) for alert evaluation
 *   - price_alerts: (product_id, is_active) for sweep queries
 *
 * Row volume estimates (100k snapshot target):
 *   products:            ~500 rows
 *   retailers:           ~10 rows
 *   retailer_offers:     ~2,500 rows (500 products × 5 retailers)
 *   price_snapshots:     ~100,000 rows (primary tracking table)
 *   price_history_daily: ~50,000 rows (compressed daily aggregates)
 *   product_price_stats: ~500 rows (1:1 with products)
 *   price_alerts:        ~10,000 rows (user subscriptions)
 *   users:               ~5,000 rows
 */

// ── Database row types ────────────────────────────────────────────────────────
// These match the Postgres table shapes row-for-row.
// Snake_case follows Postgres convention.

/**
 * TABLE: products
 *
 * SQL:
 *   CREATE TABLE products (
 *     id                    TEXT PRIMARY KEY,           -- internal catalog ID (e.g. 'elec-001')
 *     asin                  TEXT UNIQUE,                -- Amazon ASIN
 *     title                 TEXT NOT NULL,
 *     brand                 TEXT,
 *     category              TEXT NOT NULL,
 *     image_url             TEXT NOT NULL,
 *     is_active             BOOLEAN NOT NULL DEFAULT true,
 *     check_frequency_mins  INTEGER NOT NULL DEFAULT 360,
 *     priority              TEXT NOT NULL DEFAULT 'normal',
 *     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   CREATE INDEX idx_products_category ON products (category);
 *   CREATE INDEX idx_products_is_active ON products (is_active);
 */
export interface DbProduct {
  id:                    string
  asin?:                 string | null
  title:                 string
  brand?:                string | null
  category:              string
  image_url:             string
  is_active:             boolean
  check_frequency_mins:  number
  priority:              'high' | 'normal' | 'low'
  created_at:            string
  updated_at:            string
}

/**
 * TABLE: retailers
 *
 * SQL:
 *   CREATE TABLE retailers (
 *     id                            TEXT PRIMARY KEY,
 *     name                          TEXT NOT NULL,
 *     slug                          TEXT NOT NULL UNIQUE,
 *     base_url                      TEXT NOT NULL,
 *     countries                     TEXT[] NOT NULL,
 *     currency                      TEXT NOT NULL,
 *     affiliate_support             BOOLEAN NOT NULL DEFAULT false,
 *     affiliate_tag                 TEXT,
 *     ships_to_colombia_directly    BOOLEAN NOT NULL DEFAULT false,
 *     shipping_min_days             INTEGER,
 *     shipping_max_days             INTEGER,
 *     estimated_shipping_cost_usd   NUMERIC(8,2),
 *     colombia_customs_threshold    NUMERIC(8,2) DEFAULT 200.00
 *   );
 */
export interface DbRetailer {
  id:                           string
  name:                         string
  slug:                         string
  base_url:                     string
  countries:                    string[]
  currency:                     string
  affiliate_support:            boolean
  affiliate_tag?:               string | null
  ships_to_colombia_directly:   boolean
  shipping_min_days?:           number | null
  shipping_max_days?:           number | null
  estimated_shipping_cost_usd?: number | null
  colombia_customs_threshold?:  number | null
}

/**
 * TABLE: retailer_offers
 *
 * Stores the CURRENT price at each retailer for each product.
 * Updated in-place on each successful price check.
 * Historical data flows to price_snapshots, not here.
 *
 * SQL:
 *   CREATE TABLE retailer_offers (
 *     product_id                TEXT NOT NULL REFERENCES products(id),
 *     retailer_id               TEXT NOT NULL REFERENCES retailers(id),
 *     external_id               TEXT NOT NULL,
 *     url                       TEXT NOT NULL,
 *     affiliate_url             TEXT,
 *     price                     NUMERIC(12,2) NOT NULL,
 *     currency                  TEXT NOT NULL,
 *     price_usd                 NUMERIC(10,2) NOT NULL,
 *     old_price                 NUMERIC(12,2),
 *     discount_percent          SMALLINT,
 *     availability              TEXT NOT NULL DEFAULT 'unknown',
 *     ships_to_colombia         BOOLEAN NOT NULL DEFAULT false,
 *     shipping_cost_usd         NUMERIC(8,2),
 *     total_landed_cost_usd     NUMERIC(10,2),
 *     last_checked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     source                    TEXT NOT NULL DEFAULT 'manual',
 *     is_verified               BOOLEAN NOT NULL DEFAULT false,
 *     valid_until               TIMESTAMPTZ,
 *     PRIMARY KEY (product_id, retailer_id)
 *   );
 *   CREATE INDEX idx_offers_product ON retailer_offers (product_id);
 *   CREATE INDEX idx_offers_availability ON retailer_offers (availability);
 */
export interface DbRetailerOffer {
  product_id:               string
  retailer_id:              string
  external_id:              string
  url:                      string
  affiliate_url?:           string | null
  price:                    number
  currency:                 string
  price_usd:                number
  old_price?:               number | null
  discount_percent?:        number | null
  availability:             string
  ships_to_colombia:        boolean
  shipping_cost_usd?:       number | null
  total_landed_cost_usd?:   number | null
  last_checked_at:          string
  source:                   string
  is_verified:              boolean
  valid_until?:             string | null
}

/**
 * TABLE: price_snapshots
 *
 * Append-only table — rows are NEVER updated, only inserted.
 * This is the source of truth for all historical analysis.
 *
 * Partitioning strategy (Phase N+4):
 *   PARTITION BY RANGE (recorded_at) — monthly partitions
 *   Oldest partition archived to cold storage after 2 years
 *
 * SQL:
 *   CREATE TABLE price_snapshots (
 *     id                TEXT PRIMARY KEY,
 *     product_id        TEXT NOT NULL REFERENCES products(id),
 *     retailer_id       TEXT NOT NULL REFERENCES retailers(id),
 *     price             NUMERIC(12,2) NOT NULL,
 *     currency          TEXT NOT NULL,
 *     price_usd         NUMERIC(10,2) NOT NULL,
 *     exchange_rate     NUMERIC(10,4),
 *     availability      TEXT NOT NULL,
 *     recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     source            TEXT NOT NULL,
 *     was_all_time_low  BOOLEAN DEFAULT false,
 *     metadata          JSONB
 *   );
 *   CREATE INDEX idx_snapshots_product_time
 *     ON price_snapshots (product_id, retailer_id, recorded_at DESC);
 *   CREATE INDEX idx_snapshots_recorded_at
 *     ON price_snapshots (recorded_at DESC);
 */
export interface DbPriceSnapshot {
  id:               string
  product_id:       string
  retailer_id:      string
  price:            number
  currency:         string
  price_usd:        number
  exchange_rate?:   number | null
  availability:     string
  recorded_at:      string
  source:           string
  was_all_time_low: boolean
  metadata?:        Record<string, unknown> | null
}

/**
 * TABLE: price_history_daily
 *
 * Pre-aggregated daily summaries compressed from price_snapshots.
 * Generated by a scheduled job: "compress yesterday's snapshots".
 * Enables fast chart rendering without scanning thousands of snapshots.
 *
 * SQL:
 *   CREATE TABLE price_history_daily (
 *     product_id            TEXT NOT NULL REFERENCES products(id),
 *     retailer_id           TEXT NOT NULL REFERENCES retailers(id),
 *     date                  DATE NOT NULL,
 *     lowest_price_usd      NUMERIC(10,2) NOT NULL,
 *     highest_price_usd     NUMERIC(10,2) NOT NULL,
 *     average_price_usd     NUMERIC(10,2) NOT NULL,
 *     end_of_day_avail      TEXT NOT NULL,
 *     snapshot_count        SMALLINT NOT NULL DEFAULT 1,
 *     PRIMARY KEY (product_id, retailer_id, date)
 *   );
 *   CREATE INDEX idx_history_product_date
 *     ON price_history_daily (product_id, date DESC);
 */
export interface DbPriceHistoryDaily {
  product_id:         string
  retailer_id:        string
  date:               string    // YYYY-MM-DD
  lowest_price_usd:   number
  highest_price_usd:  number
  average_price_usd:  number
  end_of_day_avail:   string
  snapshot_count:     number
}

/**
 * TABLE: product_price_stats
 *
 * Materialized statistics per product — updated after each ingestion batch.
 * 1:1 with products. If missing, stats have not yet been computed.
 *
 * SQL:
 *   CREATE TABLE product_price_stats (
 *     product_id                TEXT PRIMARY KEY REFERENCES products(id),
 *     computed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     data_points               INTEGER NOT NULL DEFAULT 0,
 *     period_start              DATE,
 *     period_end                DATE,
 *     current_best_price_usd    NUMERIC(10,2),
 *     current_best_retailer_id  TEXT,
 *     all_time_lowest_usd       NUMERIC(10,2),
 *     all_time_lowest_at        TIMESTAMPTZ,
 *     all_time_lowest_retailer  TEXT,
 *     all_time_highest_usd      NUMERIC(10,2),
 *     average_price_usd         NUMERIC(10,2),
 *     median_price_usd          NUMERIC(10,2),
 *     avg_30d_usd               NUMERIC(10,2),
 *     avg_90d_usd               NUMERIC(10,2),
 *     trend                     TEXT NOT NULL DEFAULT 'unknown',
 *     volatility_score          NUMERIC(5,4) NOT NULL DEFAULT 0,
 *     price_change_7d_usd       NUMERIC(10,2),
 *     price_change_30d_pct      NUMERIC(6,2),
 *     savings_vs_high_pct       SMALLINT,
 *     savings_vs_avg90d_pct     SMALLINT,
 *     is_near_all_time_low      BOOLEAN NOT NULL DEFAULT false,
 *     buy_signal                TEXT NOT NULL DEFAULT 'neutral'
 *   );
 */
export interface DbProductPriceStats {
  product_id:               string
  computed_at:              string
  data_points:              number
  period_start?:            string | null
  period_end?:              string | null
  current_best_price_usd?:  number | null
  current_best_retailer_id?:string | null
  all_time_lowest_usd?:     number | null
  all_time_lowest_at?:      string | null
  all_time_lowest_retailer?:string | null
  all_time_highest_usd?:    number | null
  average_price_usd?:       number | null
  median_price_usd?:        number | null
  avg_30d_usd?:             number | null
  avg_90d_usd?:             number | null
  trend:                    string
  volatility_score:         number
  price_change_7d_usd?:     number | null
  price_change_30d_pct?:    number | null
  savings_vs_high_pct?:     number | null
  savings_vs_avg90d_pct?:   number | null
  is_near_all_time_low:     boolean
  buy_signal:               string
}

/**
 * TABLE: price_alerts
 *
 * SQL:
 *   CREATE TABLE price_alerts (
 *     id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *     product_id            TEXT NOT NULL REFERENCES products(id),
 *     retailer_id           TEXT REFERENCES retailers(id),
 *     trigger               TEXT NOT NULL,
 *     target_price_usd      NUMERIC(10,2),
 *     target_drop_percent   SMALLINT,
 *     is_active             BOOLEAN NOT NULL DEFAULT true,
 *     created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     last_triggered_at     TIMESTAMPTZ,
 *     trigger_count         INTEGER NOT NULL DEFAULT 0,
 *     notification_channel  TEXT NOT NULL DEFAULT 'email',
 *     notification_target   TEXT NOT NULL
 *   );
 *   CREATE INDEX idx_alerts_user       ON price_alerts (user_id, is_active);
 *   CREATE INDEX idx_alerts_product    ON price_alerts (product_id, is_active);
 */
export interface DbPriceAlert {
  id:                   string
  user_id:              string
  product_id:           string
  retailer_id?:         string | null
  trigger:              string
  target_price_usd?:    number | null
  target_drop_percent?: number | null
  is_active:            boolean
  created_at:           string
  last_triggered_at?:   string | null
  trigger_count:        number
  notification_channel: string
  notification_target:  string
}

/**
 * TABLE: users
 *
 * Minimal user model for alert subscriptions.
 * Phase N+2: integrate with Supabase Auth (auth.users table).
 * The id here references auth.users.id.
 *
 * SQL:
 *   CREATE TABLE users (
 *     id            UUID PRIMARY KEY,  -- matches auth.users.id
 *     email         TEXT NOT NULL UNIQUE,
 *     display_name  TEXT,
 *     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     alert_count   INTEGER NOT NULL DEFAULT 0,
 *     max_alerts    INTEGER NOT NULL DEFAULT 10
 *   );
 */
export interface DbUser {
  id:           string
  email:        string
  display_name?: string | null
  created_at:   string
  alert_count:  number
  max_alerts:   number
}
