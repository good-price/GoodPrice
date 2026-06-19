/**
 * lib/catalog/pricing-memory/types.ts
 *
 * Core types for the Pricing Memory & Product Intelligence Engine — Sprint 4E.
 *
 * Price history tracks every observed price for each catalog product.
 * Product intelligence aggregates trend, volatility, and opportunity signals
 * computed from the price history.
 *
 * SERVER-ONLY.
 */

// ── Price history ─────────────────────────────────────────────────────────────

export interface PriceSnapshot {
  /** Price in USD at observation time. */
  price:     number
  /** ISO 8601 timestamp of the observation. */
  timestamp: string
}

export interface ProductPriceHistory {
  asin:         string
  /** Price observed when the product was first admitted. */
  firstPrice:   number
  /** Most recently observed price. */
  latestPrice:  number
  /** Lowest price ever observed. */
  lowestPrice:  number
  /** Highest price ever observed. */
  highestPrice: number
  /** Simple arithmetic mean across all snapshots. */
  averagePrice: number
  /** Ordered oldest-first. Maximum 100 entries. */
  snapshots:    PriceSnapshot[]
}

export interface PriceHistoryStore {
  /** ISO — last write. null before first snapshot. */
  updatedAt: string | null
  /** Keyed by ASIN. */
  products:  Record<string, ProductPriceHistory>
}

// ── Price analytics ───────────────────────────────────────────────────────────

export type PriceTrend = 'rising' | 'falling' | 'stable'

// ── Product intelligence ──────────────────────────────────────────────────────

export interface ProductIntelligence {
  asin: string
  /** 0–100: how much the price fluctuates (stddev-based). */
  volatilityScore:   number
  /** 0–100: how close current price is to historical low. */
  opportunityScore:  number
  trend:             PriceTrend
  /** ISO — when the last price drop occurred. null if price never dropped. */
  lastPriceDropAt:   string | null
  /** Total number of distinct price changes recorded. */
  totalPriceChanges: number
}

export interface ProductIntelligenceStore {
  /** ISO — last write. */
  updatedAt: string | null
  /** Keyed by ASIN. */
  products:  Record<string, ProductIntelligence>
}

// ── Governance ────────────────────────────────────────────────────────────────

export interface PricingGovernance {
  totalProducts:      number
  rising:             number
  falling:            number
  stable:             number
  /** Products with opportunityScore >= 60. */
  opportunities:      number
  /** Integer — average volatilityScore. */
  averageVolatility:  number
  /** Integer — average opportunityScore. */
  averageOpportunity: number
}
