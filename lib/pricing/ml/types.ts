/**
 * MercadoLibre API — Response Type Definitions
 *
 * Typed shapes for the MercadoLibre public REST API responses.
 * All fields are typed as they actually appear in the API; optional
 * fields use `| null` for API nulls vs `?` for fields that may be absent.
 *
 * API docs: https://developers.mercadolibre.com.co/
 * Site ID for Colombia: MCO
 *
 * No auth required for the endpoints used here:
 *   - /sites/MCO/search        — product search
 *   - /items/{id}             — item detail
 *   - /items?ids=A,B,C        — batch item fetch (up to 20)
 *   - /currency_conversions/search?from=COP&to=USD — exchange rate
 */

// ── Search endpoint ───────────────────────────────────────────────────────────

export interface MLShipping {
  free_shipping: boolean
  mode: string                  // 'me2', 'custom', 'not_specified', etc.
  local_pick_up: boolean
  store_pick_up?: boolean
}

export interface MLSeller {
  id: number
  nickname: string
}

/** A single result item from the /search endpoint */
export interface MLSearchItem {
  id: string                    // e.g. "MCO1234567890"
  title: string
  price: number                 // COP integer (e.g. 1299000)
  original_price: number | null // null = no discount
  currency_id: string           // "COP"
  available_quantity: number
  sold_quantity: number
  condition: 'new' | 'used' | 'not_specified'
  listing_type_id: string       // "gold_special", "gold_pro", etc.
  permalink: string             // direct product URL
  thumbnail: string             // ML CDN image URL (small)
  seller: MLSeller
  shipping: MLShipping
  /** Relevance score — ML's internal ranking (0–1, higher = more relevant) */
  relevance_score?: number
}

export interface MLSearchPaging {
  total: number
  primary_results: number
  offset: number
  limit: number
}

export interface MLSearchResponse {
  site_id: string               // "MCO"
  query: string
  paging: MLSearchPaging
  results: MLSearchItem[]
}

// ── Item detail endpoint ──────────────────────────────────────────────────────

export type MLItemStatus = 'active' | 'paused' | 'closed' | 'under_review' | 'inactive'

export interface MLItemAttribute {
  id: string
  name: string
  value_name: string | null
  value_type: string
}

/** Full item detail from /items/{id} */
export interface MLItemResponse {
  id: string
  title: string
  subtitle: string | null
  price: number
  original_price: number | null
  currency_id: string
  available_quantity: number
  sold_quantity: number
  condition: 'new' | 'used' | 'not_specified'
  listing_type_id: string
  status: MLItemStatus
  sub_status: string[]
  permalink: string
  thumbnail: string
  secure_thumbnail: string
  seller_id: number
  category_id: string
  domain_id: string | null
  shipping: MLShipping
  attributes: MLItemAttribute[]
  /** Date the listing was created */
  date_created: string
  /** Date of last update */
  last_updated: string
}

/** Response shape when batch-fetching items: /items?ids=A,B */
export interface MLBatchItemResult {
  code: number              // HTTP code for this item (200 = success, 404 = not found)
  body: MLItemResponse | { message: string; error: string }
}

// ── Exchange rate endpoint ────────────────────────────────────────────────────

export interface MLCurrencyConversionResponse {
  from: string              // "COP"
  to: string                // "USD"
  /** How many USD per 1 COP (e.g. 0.000241) */
  ratio: number
  inv_ratio: number         // Inverse: how many COP per 1 USD (e.g. 4149.37)
  date_creation: string
  valid_until: string
}

// ── Internal mapping types ────────────────────────────────────────────────────

/**
 * A GOODPRICE catalog product's mapping to one or more ML listings.
 * Stored in data/pricing/mappings.json.
 */
export interface ProductMapping {
  /** GOODPRICE internal product ID */
  productId: string
  /** Display title (for readability in the JSON) */
  productTitle: string
  /** Query used when searching ML for this product */
  searchQuery: string
  /** Primary ML item ID (populated after search + selection) */
  mlItemId: string | null
  /** Title of the matched ML listing (for verification) */
  mlItemTitle: string | null
  /** Whether this mapping has been manually confirmed correct */
  verified: boolean
  /** When we last searched ML for this product */
  lastSearchedAt: string | null
  /** When we last fetched the price for this mapping */
  lastCheckedAt: string | null
  /** Alternative ML item IDs (fallbacks if primary is unavailable) */
  alternativeIds: string[]
}

/** Map of productId → ProductMapping */
export type MappingsStore = Record<string, ProductMapping>

// ── Cached exchange rate ──────────────────────────────────────────────────────

export interface CachedExchangeRate {
  /** How many COP per 1 USD */
  copPerUSD: number
  fetchedAt: number  // Date.now() timestamp
  source: 'ml_api' | 'fallback'
}
