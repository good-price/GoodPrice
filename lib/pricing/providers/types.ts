/**
 * GOODPRICE Pricing Infrastructure — Provider Interface Contracts
 *
 * A RetailerProvider encapsulates all knowledge about how to interact
 * with a specific retailer: URL patterns, affiliate logic, availability
 * strings, price format quirks, and (future) fetch implementations.
 *
 * Provider implementations live in lib/pricing/providers/[retailer].ts
 * Each file exports a singleton implementing RetailerProvider.
 *
 * Provider registry: lib/pricing/providers/index.ts
 *   → maps retailer ID → provider instance
 *   → consumers call getProvider('amazon') — no direct imports of provider files
 *
 * Future implementation pattern:
 *   Phase 2: providers have normalizeData() but fetchProduct() is a stub
 *   Phase 3: providers implement fetchProduct() using Vercel Edge Functions
 *   Phase 4: providers implement fetchSearch() and bulk fetch capabilities
 *
 * Provider contract principles:
 *   1. All methods are pure functions (no side effects, no I/O)
 *   2. Normalization is idempotent — running twice gives the same result
 *   3. URL building never throws — always returns a valid string
 *   4. Validation returns structured results, never throws
 *   5. All fetch methods are marked as optional (not all providers support all ops)
 */

import type {
  Retailer,
  AvailabilityStatus,
  RawRetailerData,
  NormalizedRetailerProduct,
  ValidationResult,
} from '../types'

// ── Core provider interface ───────────────────────────────────────────────────

export interface RetailerProvider {
  /** Static retailer metadata */
  readonly retailer: Retailer

  // ── URL building ──────────────────────────────────────────────────────────

  /**
   * Build a direct product URL from the retailer's external product ID.
   *
   * @param externalId - Retailer's product identifier (ASIN, permalink ID, etc.)
   * @returns Full product URL without affiliate parameters
   *
   * @example
   * amazon.buildProductUrl('B0CHWRXH8B')
   * // → 'https://www.amazon.com/dp/B0CHWRXH8B'
   */
  buildProductUrl(externalId: string): string

  /**
   * Append affiliate tracking parameters to a product URL.
   *
   * Must preserve the original URL's path and query params.
   * Returns the input URL unchanged if affiliateSupport = false.
   *
   * @param productUrl - Clean product URL (from buildProductUrl or external)
   * @returns URL with affiliate parameters appended
   *
   * @example
   * amazon.buildAffiliateUrl('https://www.amazon.com/dp/B0CHWRXH8B')
   * // → 'https://www.amazon.com/dp/B0CHWRXH8B?tag=upgoodprice-20'
   */
  buildAffiliateUrl(productUrl: string): string

  /**
   * Build a search results URL for a given query string.
   * Used for discovery and for verifying product existence.
   *
   * @param query - Search terms
   * @returns Full search URL for this retailer
   */
  buildSearchUrl(query: string): string

  // ── Normalization ─────────────────────────────────────────────────────────

  /**
   * Parse a raw availability string from this retailer into a typed status.
   *
   * Each retailer uses different availability text. This method knows the
   * retailer-specific strings:
   *   Amazon:       "In Stock", "Only 3 left in stock", "Currently unavailable"
   *   MercadoLibre: "Disponible", "Sin stock", "Últimas unidades"
   *   Alkosto:      "Disponible", "Agotado", "Próximamente"
   *
   * @param rawStatus - Raw availability string from retailer
   * @returns Normalized AvailabilityStatus
   */
  normalizeAvailability(rawStatus: string): AvailabilityStatus

  /**
   * Parse and normalize a raw price value from this retailer.
   *
   * Handles retailer-specific formatting quirks:
   *   - MercadoLibre/Colombia: "1.299.000" (dot as thousands separator)
   *   - Amazon: "$1,299.00" or numeric 1299.0
   *   - Falabella/Éxito: "$1.299.000" (COP with dot separator)
   *
   * @param rawPrice - Raw price string or number from retailer
   * @param rawCurrency - Optional raw currency string for validation
   * @returns Parsed numeric price in retailer's native currency, or NaN on failure
   */
  normalizePrice(rawPrice: string | number, currency?: string): number

  /**
   * Normalize a complete raw product response into a structured product.
   *
   * Future: accepts RawRetailerData and returns NormalizedRetailerProduct.
   * Currently: accepts a typed partial response and fills defaults.
   *
   * @param raw - Raw data from the fetcher (future: from scraper/API)
   * @returns Normalized product data ready for validation and storage
   */
  normalizeProduct(raw: RawRetailerData): NormalizedRetailerProduct | null

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Validate that a string is a valid external product ID for this retailer.
   *
   * @param externalId - Candidate product identifier
   * @returns true if the ID matches the retailer's expected format
   *
   * @example
   * amazon.validateExternalId('B0CHWRXH8B') // → true
   * amazon.validateExternalId('not-an-asin') // → false
   */
  validateExternalId(externalId: string): boolean

  /**
   * Validate a normalized product against business rules.
   *
   * Checks:
   *   - Price > 0
   *   - Price within reasonable bounds for category
   *   - Required fields present
   *   - URL matches retailer's domain
   *   - External ID format valid
   *
   * @param product - Normalized product to validate
   * @returns Validation result with errors (fatal) and warnings (non-fatal)
   */
  validateProduct(product: NormalizedRetailerProduct): ValidationResult

  // ── Future: fetch adapters (intentionally deferred) ───────────────────────
  //
  // These methods are commented out to keep Phase 15 infrastructure-only.
  // They will be implemented in Phase N+2 when scraper workers are built.
  //
  // The interface is designed so implementations can be added incrementally
  // without breaking existing code — all fetch methods are optional.

  /**
   * Fetch raw product data from the retailer.
   *
   * @deferred Phase N+2 — requires scraper/API integration
   * @param externalId - Retailer's product identifier
   * @returns Raw unprocessed retailer response
   */
  // fetchProduct?(externalId: string): Promise<RawRetailerData>

  /**
   * Fetch search results for a query string.
   *
   * @deferred Phase N+2 — requires search scraper
   * @param query - Search terms
   * @param maxResults - Maximum results to return
   * @returns Array of raw retailer responses
   */
  // fetchSearch?(query: string, maxResults?: number): Promise<RawRetailerData[]>

  /**
   * Fetch multiple products in a single batch request.
   *
   * @deferred Phase N+3 — requires bulk API support (Amazon PA-API batch)
   * @param externalIds - Array of retailer product identifiers
   * @returns Map from externalId to raw data
   */
  // fetchBatch?(externalIds: string[]): Promise<Map<string, RawRetailerData>>
}

// ── Provider registry types ───────────────────────────────────────────────────

/** Map of retailer ID → provider instance */
export type ProviderRegistry = Map<string, RetailerProvider>

/** Result of looking up a provider */
export type ProviderLookupResult =
  | { found: true; provider: RetailerProvider }
  | { found: false; reason: string }

// ── Fetch adapter types (future) ──────────────────────────────────────────────

/**
 * Configuration for a retailer fetch operation.
 *
 * @deferred Phase N+2 — used by future fetch adapters
 */
export interface FetchConfig {
  /** Maximum time to wait for a response in ms */
  timeoutMs: number
  /** Number of retry attempts on transient failures */
  retries: number
  /** Delay between retries in ms (exponential backoff base) */
  retryDelayMs: number
  /** Optional HTTP headers to include */
  headers?: Record<string, string>
  /** Rate limit: minimum ms between requests to same retailer */
  rateLimitMs?: number
}

/**
 * Default fetch configuration per retailer risk profile.
 * Conservative = respectful of retailer servers + avoids blocks.
 *
 * @deferred Phase N+2
 */
export const DEFAULT_FETCH_CONFIGS: Record<string, Partial<FetchConfig>> = {
  amazon:       { timeoutMs: 10_000, retries: 2, retryDelayMs: 1_000, rateLimitMs: 2_000 },
  mercadolibre: { timeoutMs: 8_000,  retries: 3, retryDelayMs: 500,   rateLimitMs: 500  },
  alkosto:      { timeoutMs: 8_000,  retries: 2, retryDelayMs: 1_000, rateLimitMs: 3_000 },
  falabella:    { timeoutMs: 8_000,  retries: 2, retryDelayMs: 1_000, rateLimitMs: 3_000 },
  exito:        { timeoutMs: 8_000,  retries: 2, retryDelayMs: 1_000, rateLimitMs: 3_000 },
}
