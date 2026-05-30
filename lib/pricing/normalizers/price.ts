/**
 * GOODPRICE Pricing — Price Normalizer
 *
 * Converts raw price values from any retailer into clean numeric USD amounts.
 *
 * Normalization is a two-step process:
 *   1. Parse:   raw string/number → native currency numeric
 *   2. Convert: native currency → USD using current exchange rate
 *
 * Each retailer uses different price formats. This module handles all known
 * Colombian and US formats. Unknown formats fall back to NaN with a warning.
 *
 * Exchange rate strategy (Phase 15 — no live API yet):
 *   - Hardcoded reference rates for architecture testing
 *   - Phase N+2: replace with daily fetch from exchangerate-api.com
 *   - Phase N+3: cache rates in Supabase with hourly refresh
 *
 * Price format reference:
 *   USD  (Amazon):             "$1,299.00"  or  1299.0
 *   COP  (ML/Alkosto/Falabella/Éxito):
 *                              "$ 1.299.000" or "1.299.000" or "1299000"
 *   Mixed decimal/thousands:   varies by retailer (see each provider's normalizePrice)
 */

import type { Currency, ExchangeRateSnapshot } from '../types'

// ── Reference exchange rates ───────────────────────────────────────────────────
// Updated: 2025-05-26
// Source: Banco de la República / xe.com reference
// Phase N+2: replace with live API fetch

const REFERENCE_RATES: Record<Currency, ExchangeRateSnapshot> = {
  USD: {
    baseCurrency: 'USD',
    targetCurrency: 'USD',
    rate: 1,
    fetchedAt: '2025-05-26T00:00:00Z',
    source: 'manual',
  },
  COP: {
    baseCurrency: 'USD',
    targetCurrency: 'COP',
    rate: 4_150, // 1 USD = ~4,150 COP (May 2025)
    fetchedAt: '2025-05-26T00:00:00Z',
    source: 'manual',
  },
  EUR: {
    baseCurrency: 'USD',
    targetCurrency: 'EUR',
    rate: 0.92, // 1 USD = ~0.92 EUR (May 2025)
    fetchedAt: '2025-05-26T00:00:00Z',
    source: 'manual',
  },
}

// ── Exchange rate utilities ───────────────────────────────────────────────────

/**
 * Get the reference exchange rate for a currency (how many units per 1 USD).
 * Phase N+2: this will query a live rate store instead.
 */
export function getReferenceRate(currency: Currency): ExchangeRateSnapshot {
  return REFERENCE_RATES[currency]
}

/**
 * Convert an amount in a given currency to USD.
 *
 * @param amount   - Numeric price in the source currency
 * @param currency - Source currency
 * @param rate     - Override exchange rate (units of currency per 1 USD).
 *                   If omitted, uses the hardcoded reference rate.
 * @returns Price in USD, rounded to 2 decimal places
 */
export function toUSD(
  amount: number,
  currency: Currency,
  rate?: number,
): number {
  if (!isFinite(amount) || amount < 0) return NaN
  if (currency === 'USD') return round2(amount)

  const effectiveRate = rate ?? REFERENCE_RATES[currency].rate
  if (!effectiveRate || effectiveRate <= 0) return NaN

  return round2(amount / effectiveRate)
}

/**
 * Convert a USD amount to a target currency.
 *
 * @param usdAmount - Price in USD
 * @param currency  - Target currency
 * @param rate      - Override exchange rate. If omitted, uses reference rate.
 * @returns Price in target currency, rounded to 0 decimal places for COP
 */
export function fromUSD(
  usdAmount: number,
  currency: Currency,
  rate?: number,
): number {
  if (!isFinite(usdAmount) || usdAmount < 0) return NaN
  if (currency === 'USD') return round2(usdAmount)

  const effectiveRate = rate ?? REFERENCE_RATES[currency].rate
  const converted = usdAmount * effectiveRate

  // COP has no cents — round to nearest peso
  return currency === 'COP' ? Math.round(converted) : round2(converted)
}

// ── Price string parsers ──────────────────────────────────────────────────────

/**
 * Parse a USD price string into a number.
 * Handles: "$1,299.00", "1299", "1,299", "$1299.99"
 *
 * @returns Numeric price or NaN on parse failure
 */
export function parseUSDPrice(raw: string | number): number {
  if (typeof raw === 'number') return isFinite(raw) && raw >= 0 ? raw : NaN

  const cleaned = raw
    .replace(/[$\s]/g, '')   // strip $ and whitespace
    .replace(/,/g, '')        // remove thousands commas
    .trim()

  const parsed = parseFloat(cleaned)
  return isFinite(parsed) && parsed >= 0 ? parsed : NaN
}

/**
 * Parse a COP price string into a number.
 * Handles Colombian peso format where dot = thousands separator:
 *   "$ 1.299.000"  → 1_299_000
 *   "1.299.000"    → 1_299_000
 *   "1299000"      → 1_299_000
 *   "1.299.000,50" → 1_299_000.50
 *
 * @returns Numeric COP price or NaN on parse failure
 */
export function parseCOPPrice(raw: string | number): number {
  if (typeof raw === 'number') return isFinite(raw) && raw >= 0 ? raw : NaN

  const cleaned = raw
    .replace(/[$\s]/g, '')   // strip $ and whitespace
    .replace(/\./g, '')       // remove thousands dots
    .replace(',', '.')        // decimal comma → dot
    .trim()

  const parsed = parseFloat(cleaned)
  return isFinite(parsed) && parsed >= 0 ? parsed : NaN
}

/**
 * Auto-detect currency format and parse to number.
 * Falls back to USD parsing if currency is unknown.
 */
export function parsePrice(raw: string | number, currency: Currency): number {
  switch (currency) {
    case 'COP': return parseCOPPrice(raw)
    case 'USD': return parseUSDPrice(raw)
    case 'EUR': return parseUSDPrice(raw) // EUR uses same dot-decimal format
    default:    return parseUSDPrice(raw)
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Reasonable price bounds by currency for sanity checking */
const PRICE_BOUNDS: Record<Currency, { min: number; max: number }> = {
  USD: { min: 0.01,       max: 100_000 },    // $0.01 – $100,000
  COP: { min: 100,        max: 500_000_000 }, // 100 COP – 500M COP (~$120k USD)
  EUR: { min: 0.01,       max: 100_000 },
}

/** Returns true if the price falls within reasonable bounds for its currency */
export function isPriceReasonable(price: number, currency: Currency): boolean {
  if (!isFinite(price) || price < 0) return false
  const bounds = PRICE_BOUNDS[currency]
  return price >= bounds.min && price <= bounds.max
}

/**
 * Detect if a price is a likely parse error (off by factor of 100, wrong currency, etc.)
 * Used as a soft check — returns a warning string or null.
 */
export function detectPriceAnomaly(
  price: number,
  currency: Currency,
  expectedCurrency: Currency,
): string | null {
  if (currency !== expectedCurrency) {
    return `Currency mismatch: got ${currency}, expected ${expectedCurrency}`
  }
  if (!isPriceReasonable(price, currency)) {
    return `Price ${price} ${currency} is outside expected bounds`
  }
  // Heuristic: COP price that looks like a USD price (e.g. 79.99 COP is wrong)
  if (currency === 'COP' && price < 1_000) {
    return `COP price ${price} is suspiciously low — may be parsed as USD`
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
