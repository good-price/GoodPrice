/**
 * lib/currency/cache.ts
 *
 * Disk-backed exchange-rate cache with an in-process TTL layer.
 *
 * File: data/currency/usd-cop.json
 *
 * Two-level caching:
 *   L1 — In-process module singleton (refreshed every hour).
 *        Survives across multiple requests in the same server instance.
 *   L2 — JSON file on disk (written by the update API / cron).
 *        Survives server restarts and Vercel function cold-starts.
 *
 * Graceful degradation:
 *   - No file on disk → use FALLBACK_RATE (4100 COP/USD)
 *   - Corrupt file     → use FALLBACK_RATE
 *   - Expired file     → return stale rate (update job will refresh it)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { StoredRate, RateProvider } from './types'
import { dataPath } from '@/lib/data-path'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Conservative estimate used when no rate is available on disk. */
export const FALLBACK_RATE: number = 4100

/** In-process cache refreshes once per hour (disk reads are cheap but not free). */
const IN_PROCESS_TTL = 60 * 60 * 1000   // 1 hour

/** Rate on disk expires after 25 hours (generous buffer over the 24 h cron cycle). */
export const DISK_TTL_HOURS = 25

// ── File path ──────────────────────────────────────────────────────────────────

function getRatePath(): string {
  return dataPath('data', 'currency', 'usd-cop.json')
}

// ── Disk I/O ───────────────────────────────────────────────────────────────────

/**
 * Reads the stored rate from disk. Returns null if absent or corrupt.
 */
export function readStoredRate(): StoredRate | null {
  const path = getRatePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredRate
    // Basic shape validation
    if (typeof raw.rate !== 'number' || raw.rate <= 0) return null
    return raw
  } catch {
    return null
  }
}

/**
 * Writes a rate to disk, creating data/currency/ if needed.
 * Called by exchange-service.ts after a successful provider fetch.
 */
export function writeStoredRate(
  rate: number,
  source: RateProvider,
): StoredRate {
  const now      = new Date()
  const expires  = new Date(now.getTime() + DISK_TTL_HOURS * 60 * 60 * 1000)

  const stored: StoredRate = {
    rate,
    source,
    fetchedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  }

  const path = getRatePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(stored, null, 2), 'utf8')
  } catch (err) {
    console.error('[currency/cache] Failed to write rate to disk:', err)
  }

  return stored
}

// ── In-process singleton ───────────────────────────────────────────────────────

let _cachedRate: number = FALLBACK_RATE
let _cacheTime  = 0

/**
 * Returns the current USD→COP exchange rate.
 *
 * - Reads from the in-process cache when fresh (< 1 hour old).
 * - Refreshes from disk when stale.
 * - Falls back to FALLBACK_RATE when no disk file exists.
 *
 * IMPORTANT: This is synchronous and safe to call from server components.
 * Never call this in a client ('use client') component — use the pre-formatted
 * `copPrice` prop passed from the server instead.
 */
export function getCachedRate(): number {
  const now = Date.now()
  if (now - _cacheTime > IN_PROCESS_TTL) {
    const stored = readStoredRate()
    _cachedRate  = stored?.rate ?? FALLBACK_RATE
    _cacheTime   = now
  }
  return _cachedRate
}

/**
 * Returns metadata about the current cached rate (for admin dashboard).
 */
export function getRateMeta(): {
  rate:      number
  source:    RateProvider
  fetchedAt: string | null
  expiresAt: string | null
  isExpired: boolean
  isFallback: boolean
} {
  const stored = readStoredRate()
  if (!stored) {
    return {
      rate:      FALLBACK_RATE,
      source:    'hardcoded-fallback',
      fetchedAt: null,
      expiresAt: null,
      isExpired: true,
      isFallback: true,
    }
  }

  const isExpired = new Date(stored.expiresAt).getTime() < Date.now()
  return {
    rate:      stored.rate,
    source:    stored.source,
    fetchedAt: stored.fetchedAt,
    expiresAt: stored.expiresAt,
    isExpired,
    isFallback: false,
  }
}
