/**
 * lib/catalog/live-truth/cache.ts
 *
 * Module-level in-memory cache for live truth results.
 * Prevents redundant Amazon fetches within the same server process lifetime.
 *
 * TTL: 6 hours (results stay useful for multiple admin requests in one day)
 *
 * This cache is process-scoped — it evaporates on serverless cold-starts.
 * The file-based results store (reports.ts) provides cross-restart persistence.
 */

import type { LiveTruthResult } from './types'

const CACHE_TTL_MS = 6 * 60 * 60 * 1_000   // 6 hours

interface CacheEntry {
  result:    LiveTruthResult
  expiresAt: number
}

const _cache = new Map<string, CacheEntry>()

// ── Public API ────────────────────────────────────────────────────────────────

export function getCachedResult(productId: string): LiveTruthResult | null {
  const entry = _cache.get(productId)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    _cache.delete(productId)
    return null
  }
  return entry.result
}

export function cacheResult(result: LiveTruthResult): void {
  _cache.set(result.productId, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
}

export function clearCache(): void {
  _cache.clear()
}

export function getCacheSize(): number {
  return _cache.size
}

/**
 * Pre-warm the in-memory cache from the file-based results store.
 * Call this once on admin page load so subsequent reads are instant.
 */
export function warmCacheFromStore(results: Record<string, LiveTruthResult>): void {
  for (const [productId, result] of Object.entries(results)) {
    // Only cache results that haven't expired relative to their checkedAt time
    const ageMs = Date.now() - new Date(result.checkedAt).getTime()
    if (ageMs < CACHE_TTL_MS) {
      _cache.set(productId, {
        result,
        expiresAt: new Date(result.checkedAt).getTime() + CACHE_TTL_MS,
      })
    }
  }
}
