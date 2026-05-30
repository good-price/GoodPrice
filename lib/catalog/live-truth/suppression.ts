/**
 * lib/catalog/live-truth/suppression.ts
 *
 * Self-healing auto-suppression layer — Gate 11 in the public catalog filter.
 *
 * Separate from the human-curated quarantine.json. This layer stores products
 * that the self-healing system has temporarily suppressed due to consistently
 * failing live truth checks. Products can be programmatically un-suppressed
 * when they recover (truth score improves).
 *
 * File: data/catalog/live-truth/suppressed.json
 *
 * Cache strategy: module-level in-memory Set, invalidated by explicit calls
 * to invalidateSuppressedCache() after any write. Fine for serverless because
 * each function instance has its own module scope.
 *
 * SERVER-ONLY — uses Node.js fs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join, dirname } from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SuppressedEntry {
  productId:    string
  asin:         string
  suppressedAt: string
  reason:       string
  truthScore:   number
}

export interface SuppressedStore {
  updatedAt: string
  entries:   Record<string, SuppressedEntry>
}

// ── Path ──────────────────────────────────────────────────────────────────────

const SUPPRESSED_PATH = join(process.cwd(), 'data', 'catalog', 'live-truth', 'suppressed.json')

// ── Module-level cache ────────────────────────────────────────────────────────

let _set: Set<string> | null = null

export function invalidateSuppressedCache(): void {
  _set = null
}

// ── File I/O ──────────────────────────────────────────────────────────────────

function loadStore(): SuppressedStore {
  if (!existsSync(SUPPRESSED_PATH)) {
    return { updatedAt: '', entries: {} }
  }
  try {
    return JSON.parse(readFileSync(SUPPRESSED_PATH, 'utf8')) as SuppressedStore
  } catch {
    return { updatedAt: '', entries: {} }
  }
}

function saveStore(store: SuppressedStore): void {
  const dir = dirname(SUPPRESSED_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = SUPPRESSED_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, SUPPRESSED_PATH)
  invalidateSuppressedCache()
}

// ── Public API ────────────────────────────────────────────────────────────────

function getSuppressedSet(): Set<string> {
  if (_set !== null) return _set
  const store = loadStore()
  _set = new Set(Object.keys(store.entries))
  return _set
}

/**
 * Gate 11 predicate — called for every product in isPublicSafeProduct().
 * Must be fast: O(1) Set lookup backed by a module-level cache.
 */
export function isHealingSuppressed(productId: string | undefined): boolean {
  if (!productId) return false
  return getSuppressedSet().has(productId)
}

/** Suppress a product. No-op if already suppressed. */
export function suppressProduct(entry: SuppressedEntry): void {
  const store = loadStore()
  store.entries[entry.productId] = entry
  store.updatedAt = new Date().toISOString()
  saveStore(store)
}

/** Un-suppress a product (recovery). Returns true if it was suppressed. */
export function unsuppressProduct(productId: string): boolean {
  const store = loadStore()
  if (!(productId in store.entries)) return false
  delete store.entries[productId]
  store.updatedAt = new Date().toISOString()
  saveStore(store)
  return true
}

/** Returns all currently suppressed products. */
export function loadSuppressedStore(): SuppressedStore {
  return loadStore()
}

/** Returns the count of auto-suppressed products. */
export function getSuppressedCount(): number {
  return getSuppressedSet().size
}
