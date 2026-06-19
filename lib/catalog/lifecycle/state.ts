/**
 * lib/catalog/lifecycle/state.ts
 *
 * Lifecycle store persistence — Sprint 4D.
 *
 * Persists to data/catalog/lifecycle.json using OPS V3 atomic writes.
 *
 * Public API:
 *   readLifecycleStore()              — fault-tolerant, default on missing/corrupt
 *   saveLifecycleStore(store)         — tmp → rename atomic
 *   updateProductLifecycle(asin, ...) — read-merge-write per product
 *   batchUpdateLifecycle(updates)     — single read-write for multiple products
 *   syncLifecycleFromRuntimeCatalog() — seeds/refreshes store from runtime catalog
 *
 * Never throws.
 * SERVER-ONLY.
 */

import path from 'path'
import { storage } from '@/lib/storage/StorageFactory'
import { getRuntimeProducts } from '@/lib/catalog/runtime/reader'
import { computeLifecycleHealth } from './health'
import type { LifecycleStore, ProductLifecycle } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LIFECYCLE_FILE = path.resolve(process.cwd(), 'data/catalog/lifecycle.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultStore(): LifecycleStore {
  return { updatedAt: null, products: {} }
}

function atomicWrite(filePath: string, content: string): void {
  const tmp = filePath + '.tmp'
  storage.write(tmp, content)
  storage.rename(tmp, filePath)
}

function migrateStore(raw: unknown): LifecycleStore {
  if (!raw || typeof raw !== 'object') return defaultStore()
  const r = raw as Record<string, unknown>

  const products: Record<string, ProductLifecycle> = {}
  const rawProds = r['products']
  if (rawProds && typeof rawProds === 'object' && !Array.isArray(rawProds)) {
    for (const [asin, v] of Object.entries(rawProds as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const p = v as Record<string, unknown>

      const health = p['health']
      const validHealth = health === 'healthy' || health === 'aging' ||
                          health === 'stale'   || health === 'critical'
        ? health as ProductLifecycle['health']
        : 'stale'

      products[asin] = {
        asin:              typeof p['asin']              === 'string'  ? p['asin']              : asin,
        category:          typeof p['category']          === 'string'  ? p['category']          : '',
        firstSeenAt:       typeof p['firstSeenAt']       === 'string'  ? p['firstSeenAt']       : new Date().toISOString(),
        lastSeenAt:        typeof p['lastSeenAt']        === 'string'  ? p['lastSeenAt']        : new Date().toISOString(),
        lastValidatedAt:   typeof p['lastValidatedAt']   === 'string'  ? p['lastValidatedAt']   : null,
        lastPriceSyncAt:   typeof p['lastPriceSyncAt']   === 'string'  ? p['lastPriceSyncAt']   : null,
        ageDays:           typeof p['ageDays']           === 'number'  ? p['ageDays']           : 0,
        staleDays:         typeof p['staleDays']         === 'number'  ? p['staleDays']         : 0,
        health:            validHealth,
        confidenceScore:   typeof p['confidenceScore']   === 'number'  ? p['confidenceScore']   : 0,
        qualityScore:      typeof p['qualityScore']      === 'number'  ? p['qualityScore']      : 0,
        validationCount:   typeof p['validationCount']   === 'number'  ? p['validationCount']   : 0,
        failureCount:      typeof p['failureCount']      === 'number'  ? p['failureCount']      : 0,
        needsRefresh:      typeof p['needsRefresh']      === 'boolean' ? p['needsRefresh']      : false,
        needsReplacement:  typeof p['needsReplacement']  === 'boolean' ? p['needsReplacement']  : false,
      }
    }
  }

  return {
    updatedAt: typeof r['updatedAt'] === 'string' ? r['updatedAt'] : null,
    products,
  }
}

// ── Derived field computation ──────────────────────────────────────────────────

function computeDerived(
  lc: ProductLifecycle,
): Pick<ProductLifecycle, 'ageDays' | 'staleDays' | 'health' | 'needsRefresh' | 'needsReplacement'> {
  const nowMs         = Date.now()
  const firstSeenMs   = new Date(lc.firstSeenAt).getTime()
  const refMs         = lc.lastValidatedAt
    ? new Date(lc.lastValidatedAt).getTime()
    : new Date(lc.lastSeenAt).getTime()

  const ageDays   = Math.max(0, Math.floor((nowMs - firstSeenMs) / 86_400_000))
  const staleDays = Math.max(0, Math.floor((nowMs - refMs) / 86_400_000))

  const { health, needsRefresh, needsReplacement } = computeLifecycleHealth(
    staleDays,
    lc.confidenceScore,
  )

  return { ageDays, staleDays, health, needsRefresh, needsReplacement }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function readLifecycleStore(): LifecycleStore {
  const raw = storage.read(LIFECYCLE_FILE)
  if (raw === null) return defaultStore()
  try {
    return migrateStore(JSON.parse(raw))
  } catch {
    return defaultStore()
  }
}

export function saveLifecycleStore(store: LifecycleStore): void {
  try {
    atomicWrite(LIFECYCLE_FILE, JSON.stringify(store, null, 2))
  } catch {
    // best-effort — must never block callers
  }
}

/** Returns a fresh default lifecycle record for an unknown ASIN. */
function defaultLifecycle(asin: string, now: string): ProductLifecycle {
  return {
    asin,
    category:         '',
    firstSeenAt:      now,
    lastSeenAt:       now,
    lastValidatedAt:  null,
    lastPriceSyncAt:  null,
    ageDays:          0,
    staleDays:        0,
    health:           'stale',
    confidenceScore:  0,
    qualityScore:     0,
    validationCount:  0,
    failureCount:     0,
    needsRefresh:     false,
    needsReplacement: false,
  }
}

/**
 * Updates a single product's lifecycle record.
 * Recomputes ageDays, staleDays, health, needsRefresh, needsReplacement.
 */
export function updateProductLifecycle(
  asin:    string,
  updates: Partial<Omit<ProductLifecycle, 'asin'>>,
): void {
  try {
    const store    = readLifecycleStore()
    const now      = new Date().toISOString()
    const existing = store.products[asin]

    // defaults → existing (override defaults) → updates (caller overrides) → asin (force)
    const base    = defaultLifecycle(asin, now)
    const merged: ProductLifecycle = { ...base, ...existing, ...updates, asin }

    const derived = computeDerived(merged)
    store.products[asin] = { ...merged, ...derived }
    store.updatedAt      = now
    saveLifecycleStore(store)
  } catch {
    // best-effort
  }
}

/**
 * Updates multiple products in a single read-write pass.
 * More efficient than calling updateProductLifecycle() N times.
 */
export function batchUpdateLifecycle(
  updates: Array<{ asin: string; updates: Partial<Omit<ProductLifecycle, 'asin'>> }>,
): void {
  if (updates.length === 0) return
  try {
    const store = readLifecycleStore()
    const now   = new Date().toISOString()

    for (const { asin, updates: u } of updates) {
      const existing = store.products[asin]
      const base     = defaultLifecycle(asin, now)
      const merged: ProductLifecycle = { ...base, ...existing, ...u, asin }
      store.products[asin] = { ...merged, ...computeDerived(merged) }
    }

    store.updatedAt = now
    saveLifecycleStore(store)
  } catch {
    // best-effort
  }
}

/**
 * Seeds and refreshes the lifecycle store from the runtime catalog.
 *
 * For every RuntimeProduct:
 *   - If no lifecycle entry exists → creates one from product metadata.
 *   - If an entry exists → updates timestamps and scores from runtime data,
 *     preserving validationCount and failureCount (incremented by pipelines).
 *
 * Returns the count of products processed.
 */
export function syncLifecycleFromRuntimeCatalog(): number {
  try {
    const products = getRuntimeProducts()
    if (products.length === 0) return 0

    const store   = readLifecycleStore()
    const now     = new Date().toISOString()

    for (const product of products) {
      const existing = store.products[product.asin]

      const firstSeenAt    = existing?.firstSeenAt    ?? product.admittedAt
      const lastValidatedAt = (
        product.lastValidated != null    ? product.lastValidated :
        existing?.lastValidatedAt        ? existing.lastValidatedAt :
                                           null
      )
      const lastPriceSyncAt = (
        product.lastPriceSync != null   ? product.lastPriceSync :
        existing?.lastPriceSyncAt       ? existing.lastPriceSyncAt :
                                          null
      )
      // lastSeenAt = most recent of lastValidated, lastSeen, admittedAt
      const candidateLastSeen = [
        lastValidatedAt,
        existing?.lastSeenAt,
        product.admittedAt,
      ].filter(Boolean) as string[]
      const lastSeenAt = candidateLastSeen.reduce((a, b) => (a > b ? a : b))

      const confidenceScore = existing?.confidenceScore ?? (product.trustScore      ?? product.validationScore ?? 50)
      const qualityScore    = existing?.qualityScore    ?? (product.validationScore ?? 50)
      const validationCount = existing?.validationCount ?? (product.lastValidated != null ? 1 : 0)
      const failureCount    = existing?.failureCount    ?? 0

      const base: ProductLifecycle = {
        asin:            product.asin,
        category:        product.category,
        firstSeenAt,
        lastSeenAt,
        lastValidatedAt,
        lastPriceSyncAt: lastPriceSyncAt ?? null,
        ageDays:         0,
        staleDays:       0,
        health:          'stale',
        confidenceScore,
        qualityScore,
        validationCount,
        failureCount,
        needsRefresh:     false,
        needsReplacement: false,
      }

      store.products[product.asin] = { ...base, ...computeDerived(base) }
    }

    store.updatedAt = now
    saveLifecycleStore(store)
    return products.length
  } catch {
    return 0
  }
}
