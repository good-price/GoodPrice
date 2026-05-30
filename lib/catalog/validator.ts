import { ProductStatus, ValidationResult } from '@/types'

// ── In-memory validation cache (24h TTL) ─────────────────────────────────────

interface CacheEntry {
  result: ValidationResult
  cachedAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const cache = new Map<string, CacheEntry>()

function getFromCache(asin: string): ValidationResult | null {
  const entry = cache.get(asin)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(asin)
    return null
  }
  return entry.result
}

function setCache(asin: string, result: ValidationResult): void {
  cache.set(asin, { result, cachedAt: Date.now() })
}

// ── ASIN format validation ────────────────────────────────────────────────────

const ASIN_REGEX = /^[A-Z0-9]{10}$/

export function isValidAsinFormat(asin: string): boolean {
  return ASIN_REGEX.test(asin)
}

// ── Staleness check ───────────────────────────────────────────────────────────

const STALE_DAYS = 30

export function isStale(lastValidated?: string): boolean {
  if (!lastValidated) return true
  const ms = Date.now() - new Date(lastValidated).getTime()
  return ms > STALE_DAYS * 24 * 60 * 60 * 1000
}

// ── Lightweight HTTP ASIN check ───────────────────────────────────────────────

async function httpCheckAsin(asin: string): Promise<{ status: ProductStatus; httpStatus?: number }> {
  try {
    const res = await fetch(`https://www.amazon.com/dp/${asin}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(6000),
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    })

    // Amazon returns 404 for truly non-existent ASINs
    // 200/301/302 all mean the page exists
    if (res.status === 404) {
      return { status: 'inactive', httpStatus: res.status }
    }
    return { status: 'active', httpStatus: res.status }
  } catch {
    // Network error, timeout, or Amazon blocking → unknown, do not false-positive
    return { status: 'unverified' }
  }
}

// ── Public validator API ──────────────────────────────────────────────────────

/** Validate a single ASIN. Uses cache if fresh, falls back to HTTP check. */
export async function validateAsin(asin: string): Promise<ValidationResult> {
  // 1. Format check (instant)
  if (!isValidAsinFormat(asin)) {
    return {
      asin,
      status: 'inactive',
      checkedAt: new Date().toISOString(),
      reason: 'Formato ASIN inválido (debe ser 10 caracteres alfanuméricos)',
    }
  }

  // 2. Cache hit
  const cached = getFromCache(asin)
  if (cached) return cached

  // 3. Lightweight HTTP check
  const { status, httpStatus } = await httpCheckAsin(asin)

  const result: ValidationResult = {
    asin,
    status,
    checkedAt: new Date().toISOString(),
    httpStatus,
    reason: status === 'inactive' ? 'Producto no encontrado en Amazon (404)' : undefined,
  }

  setCache(asin, result)
  return result
}

/** Validate a batch of ASINs concurrently with rate limiting.
 *  Returns a map of ASIN → ValidationResult. */
export async function validateBatch(
  asins: string[],
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Map<string, ValidationResult>> {
  const { concurrency = 3, delayMs = 500 } = options
  const results = new Map<string, ValidationResult>()

  for (let i = 0; i < asins.length; i += concurrency) {
    const batch = asins.slice(i, i + concurrency)

    const batchResults = await Promise.all(batch.map(asin => validateAsin(asin)))
    batchResults.forEach((r, idx) => results.set(batch[idx], r))

    // Rate limiting: wait between batches to avoid triggering Amazon blocks
    if (i + concurrency < asins.length) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  return results
}

/** Returns current cache size — useful for monitoring */
export function getValidationCacheSize(): number {
  return cache.size
}

/** Clear the validation cache */
export function clearValidationCache(): void {
  cache.clear()
}
