/**
 * MercadoLibre API Client
 *
 * Thin, typed wrapper around the MercadoLibre public REST API.
 * Uses native fetch — zero additional dependencies.
 *
 * Public API limits (no OAuth):
 *   ~60 requests/minute per IP on standard endpoints
 *   Rate limiting is handled externally by jobs/rate-limiter.ts
 *
 * Retry strategy: exponential backoff for 429 (rate limited) and 5xx errors.
 * 4xx client errors are not retried (bad request or item not found).
 *
 * Exchange rate caching:
 *   COP/USD rate is fetched from ML's own API and cached in module memory
 *   for EXCHANGE_RATE_TTL_MS (6 hours). Falls back to 4,150 COP/USD if the
 *   API call fails.
 */

import type {
  MLSearchResponse,
  MLItemResponse,
  MLBatchItemResult,
  MLCurrencyConversionResponse,
  CachedExchangeRate,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const ML_BASE_URL    = 'https://api.mercadolibre.com'
const ML_SITE_ID     = 'MCO'   // Colombia
const FALLBACK_RATE  = 4_150   // COP per USD (reference May 2025)
const EXCHANGE_RATE_TTL_MS = 6 * 60 * 60 * 1_000  // 6 hours

// ── Exchange rate cache (module-level singleton) ───────────────────────────────

let _exchangeRateCache: CachedExchangeRate | null = null

// ── Core fetch wrapper ─────────────────────────────────────────────────────────

interface FetchOptions {
  retries?: number
  retryDelayMs?: number
  timeoutMs?: number
}

async function mlFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { retries = 2, retryDelayMs = 1_000, timeoutMs = 10_000 } = options
  const url = path.startsWith('http') ? path : `${ML_BASE_URL}${path}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelayMs * Math.pow(2, attempt - 1)
      await sleep(delay)
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GOODPRICE-PriceTracker/1.0',
        },
        // Next.js: disable caching so we always get fresh data
        cache: 'no-store',
      })

      clearTimeout(timer)

      // Rate limited — retry after suggested delay
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10)
        lastError = new Error(`ML API rate limited (429), retry after ${retryAfter}s`)
        await sleep(retryAfter * 1_000)
        continue
      }

      // Not found or bad request — don't retry
      if (response.status === 404) throw new MLNotFoundError(url)
      if (response.status === 400) {
        const body = await response.text()
        throw new Error(`ML API bad request (400): ${body}`)
      }

      // Server error — retry
      if (response.status >= 500) {
        lastError = new Error(`ML API server error: ${response.status}`)
        continue
      }

      if (!response.ok) {
        throw new Error(`ML API error: ${response.status} ${response.statusText}`)
      }

      return response.json() as Promise<T>
    } catch (err) {
      if (err instanceof MLNotFoundError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new Error(`ML API request timed out after ${timeoutMs}ms: ${url}`)
      } else {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }
  }

  throw lastError ?? new Error(`ML API request failed after ${retries + 1} attempts: ${url}`)
}

export class MLNotFoundError extends Error {
  constructor(url: string) {
    super(`ML item not found: ${url}`)
    this.name = 'MLNotFoundError'
  }
}

// ── Public API methods ────────────────────────────────────────────────────────

/**
 * Search for products in Colombia (MCO site).
 *
 * @param query     - Search keywords (e.g. "Logitech MX Master 3S")
 * @param limit     - Max results to return (1–50, default: 10)
 * @param condition - Filter by condition ('new' | 'used')
 */
export async function searchProducts(
  query: string,
  limit = 10,
  condition: 'new' | 'used' | undefined = 'new',
): Promise<MLSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(limit, 50)),
  })
  if (condition) params.set('condition', condition)

  return mlFetch<MLSearchResponse>(
    `/sites/${ML_SITE_ID}/search?${params.toString()}`,
  )
}

/**
 * Fetch full details for a single ML item.
 *
 * @param itemId - ML item ID, e.g. "MCO1234567890"
 * @throws MLNotFoundError if item does not exist
 */
export async function getItem(itemId: string): Promise<MLItemResponse> {
  return mlFetch<MLItemResponse>(`/items/${itemId}`)
}

/**
 * Batch-fetch up to 20 ML items in a single request.
 * Uses the /items?ids= endpoint for efficiency.
 *
 * Returns a map of itemId → item (or null if not found).
 *
 * @param itemIds - Array of ML item IDs (max 20)
 */
export async function getItemsBatch(
  itemIds: string[],
): Promise<Map<string, MLItemResponse | null>> {
  if (itemIds.length === 0) return new Map()

  const ids = itemIds.slice(0, 20).join(',')
  const results = await mlFetch<MLBatchItemResult[]>(`/items?ids=${ids}`)

  const map = new Map<string, MLItemResponse | null>()
  for (const result of results) {
    // Find which item this result corresponds to (order matches request)
    if (result.code === 200) {
      const item = result.body as MLItemResponse
      map.set(item.id, item)
    } else {
      // 404 or other error — item not available
      const idx = results.indexOf(result)
      if (idx < itemIds.length) map.set(itemIds[idx], null)
    }
  }
  return map
}

/**
 * Get the current COP→USD exchange rate from ML's own API.
 * Result is cached in module memory for 6 hours.
 *
 * Falls back to the hardcoded reference rate if the API call fails.
 *
 * @returns COP per 1 USD (e.g. 4150)
 */
export async function getCOPtoUSDRate(): Promise<number> {
  const now = Date.now()

  // Return cached rate if still fresh
  if (_exchangeRateCache && (now - _exchangeRateCache.fetchedAt) < EXCHANGE_RATE_TTL_MS) {
    return _exchangeRateCache.copPerUSD
  }

  try {
    const data = await mlFetch<MLCurrencyConversionResponse>(
      '/currency_conversions/search?from=COP&to=USD',
      { retries: 1, timeoutMs: 5_000 },
    )

    // inv_ratio = COP per 1 USD (e.g. 4149.37)
    const copPerUSD = data.inv_ratio > 0 ? data.inv_ratio : (1 / data.ratio)

    _exchangeRateCache = {
      copPerUSD: Math.round(copPerUSD),
      fetchedAt: now,
      source: 'ml_api',
    }

    return _exchangeRateCache.copPerUSD
  } catch {
    // API unavailable — use fallback rate
    if (!_exchangeRateCache) {
      _exchangeRateCache = {
        copPerUSD: FALLBACK_RATE,
        fetchedAt: now,
        source: 'fallback',
      }
    }
    return _exchangeRateCache.copPerUSD
  }
}

/** Invalidate the cached exchange rate (useful in tests or after rate spike) */
export function invalidateExchangeRateCache(): void {
  _exchangeRateCache = null
}

/** Return the current cached exchange rate metadata (for logging) */
export function getExchangeRateInfo(): CachedExchangeRate | null {
  return _exchangeRateCache
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
