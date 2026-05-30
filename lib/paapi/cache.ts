/**
 * PA-API response cache — per-ASIN JSON files on disk.
 *
 * Layout:
 *   data/paapi/cache/{ASIN}.json   ← one file per ASIN
 *
 * TTL strategy:
 *   - Images: 7 days   (rarely change; avoid re-fetching on every sync)
 *   - Errors: 1 hour   (retry failed ASINs sooner)
 *
 * Reading: synchronous (used in server components and scripts)
 * Writing: synchronous (atomic — write whole file at once)
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { PaapiCacheEntry, PaapiItem, PaapiItemSummary } from './types'
import { extractSummary } from './types'

// ── Paths ──────────────────────────────────────────────────────────────────────

const CACHE_DIR = join(process.cwd(), 'data', 'paapi', 'cache')

// ── TTL constants ──────────────────────────────────────────────────────────────

/** 7 days — images rarely change */
export const IMAGE_TTL_HOURS = 168
/** 1 hour — retry error ASINs sooner */
export const ERROR_TTL_HOURS = 1

// ── Internal helpers ───────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
}

function cachePath(asin: string): string {
  return join(CACHE_DIR, `${asin}.json`)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Read a cached entry for the given ASIN.
 * Returns null if not cached or if the entry has expired.
 */
export function getCached(asin: string): PaapiCacheEntry | null {
  const path = cachePath(asin)
  if (!existsSync(path)) return null
  try {
    const entry = JSON.parse(readFileSync(path, 'utf-8')) as PaapiCacheEntry
    if (new Date(entry.expiresAt) < new Date()) return null  // expired
    return entry
  } catch {
    return null
  }
}

/**
 * Write a PA-API item to cache.
 * Pass `item = null` to cache a failure (uses ERROR_TTL_HOURS).
 */
export function setCached(
  asin: string,
  item: PaapiItem | null,
  error?: string,
  ttlHours = item ? IMAGE_TTL_HOURS : ERROR_TTL_HOURS,
): PaapiCacheEntry {
  ensureDir()
  const now = new Date()
  const entry: PaapiCacheEntry = {
    asin,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlHours * 3_600_000).toISOString(),
    item,
    summary: item ? extractSummary(item) : null,
    error,
  }
  writeFileSync(cachePath(asin), JSON.stringify(entry, null, 2), 'utf-8')
  return entry
}

/**
 * Remove cached entry for one ASIN, or clear the entire cache if no ASIN given.
 */
export function clearCache(asin?: string): void {
  ensureDir()
  if (asin) {
    const path = cachePath(asin)
    if (existsSync(path)) unlinkSync(path)
    return
  }
  for (const f of readdirSync(CACHE_DIR)) {
    if (f.endsWith('.json')) unlinkSync(join(CACHE_DIR, f))
  }
}

/** Aggregate stats across all cached entries */
export function getCacheStats(): {
  total: number
  valid: number
  expired: number
  errors: number
  oldestFetchedAt: string | null
  newestFetchedAt: string | null
} {
  ensureDir()
  const files = readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'))
  let valid = 0, expired = 0, errors = 0
  let oldest: string | null = null
  let newest: string | null = null
  const now = new Date()

  for (const f of files) {
    try {
      const entry = JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf-8')) as PaapiCacheEntry
      if (entry.error && !entry.item) {
        errors++
      } else if (new Date(entry.expiresAt) < now) {
        expired++
      } else {
        valid++
      }
      if (!oldest || entry.fetchedAt < oldest) oldest = entry.fetchedAt
      if (!newest || entry.fetchedAt > newest) newest = entry.fetchedAt
    } catch {
      errors++
    }
  }

  return { total: files.length, valid, expired, errors, oldestFetchedAt: oldest, newestFetchedAt: newest }
}

/**
 * Load all valid cached summaries (for admin display without re-fetching).
 * Returns a map of ASIN → PaapiItemSummary.
 */
export function getAllCachedSummaries(): Map<string, PaapiItemSummary> {
  ensureDir()
  const result = new Map<string, PaapiItemSummary>()
  const now = new Date()
  for (const f of readdirSync(CACHE_DIR)) {
    if (!f.endsWith('.json')) continue
    try {
      const entry = JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf-8')) as PaapiCacheEntry
      if (entry.summary && !entry.error && new Date(entry.expiresAt) >= now) {
        result.set(entry.asin, entry.summary)
      }
    } catch { /* skip corrupt files */ }
  }
  return result
}
