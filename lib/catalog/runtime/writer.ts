/**
 * lib/catalog/runtime/writer.ts
 *
 * Atomic, fault-tolerant writers for the Runtime Catalog.
 *
 * Write protocol (every operation):
 *   1. Read current store
 *   2. Copy current file → backup file (atomic rename)
 *   3. Apply mutation to store in memory
 *   4. Increment version, set updatedAt, recalculate totalProducts
 *   5. Write to .tmp file
 *   6. renameSync(.tmp → runtime-catalog.json)
 *
 * Invariants maintained automatically:
 *   - version increments on every successful write
 *   - updatedAt reflects the time of the write
 *   - totalProducts always equals products.length
 *   - backup always holds the previous valid state
 *
 * All functions:
 *   - Never throw
 *   - All fs operations synchronous
 *
 * SERVER-ONLY.
 */

import path from 'path'

import { storage } from '@/lib/storage/StorageFactory'

import type { RuntimeCatalogStore, RuntimeProduct } from './types'
import { readRuntimeCatalog } from './reader'
import { validateRuntimeCatalogStore } from './validation'

// ── File paths ────────────────────────────────────────────────────────────────

const ROOT         = process.cwd()
const CATALOG_FILE = path.resolve(ROOT, 'data/catalog/runtime-catalog.json')
const BACKUP_FILE  = path.resolve(ROOT, 'data/catalog/runtime-catalog.backup.json')

// ── Internal helpers ──────────────────────────────────────────────────────────

function rotateBackup(): void {
  try {
    storage.copy(CATALOG_FILE, BACKUP_FILE)
  } catch {
    // best-effort
  }
}

function atomicWriteStore(store: RuntimeCatalogStore): void {
  const tmp = CATALOG_FILE + '.tmp'
  storage.write(tmp, JSON.stringify(store, null, 2))
  storage.rename(tmp, CATALOG_FILE)
}

function stamp(
  store: RuntimeCatalogStore,
  updatedBy: string,
  products: RuntimeProduct[],
): RuntimeCatalogStore {
  return {
    ...store,
    version:       store.version + 1,
    updatedAt:     new Date().toISOString(),
    updatedBy,
    totalProducts: products.length,
    products,
  }
}

// ── Core writer ───────────────────────────────────────────────────────────────

/**
 * Persists an already-validated RuntimeCatalogStore.
 *
 * Always increments version, sets updatedAt, recalculates totalProducts.
 * Rotates backup before writing.
 * Never throws.
 */
export function saveRuntimeCatalog(
  incoming: RuntimeCatalogStore,
  updatedBy = 'system',
): void {
  try {
    const current = readRuntimeCatalog()
    rotateBackup()

    const next = stamp(
      { ...current, ...incoming },
      updatedBy,
      incoming.products,
    )

    // Re-validate before writing to prevent persisting garbage
    const safe = validateRuntimeCatalogStore(next)
    atomicWriteStore(safe)
  } catch {
    // Intentionally swallowed
  }
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

/**
 * Appends a new product to the catalog.
 *
 * If a product with the same ASIN already exists, the call is a no-op
 * (use updateRuntimeProduct to mutate existing products).
 * Never throws.
 */
export function addRuntimeProduct(
  product: RuntimeProduct,
  updatedBy = 'auto-fill',
): void {
  try {
    const store = readRuntimeCatalog()

    if (store.products.some(p => p.asin === product.asin)) return

    const products = [...store.products, product]
    rotateBackup()
    atomicWriteStore(stamp(store, updatedBy, products))
  } catch {
    // Intentionally swallowed
  }
}

/**
 * Applies a partial update to the product matching the given ASIN.
 *
 * Fields not included in `patch` are left unchanged.
 * If no product with that ASIN exists, the call is a no-op.
 * Never throws.
 */
export function updateRuntimeProduct(
  asin: string,
  patch: Partial<RuntimeProduct>,
  updatedBy = 'repair',
): void {
  try {
    const store = readRuntimeCatalog()
    const idx   = store.products.findIndex(p => p.asin === asin)
    if (idx === -1) return

    const products = store.products.map((p, i) =>
      i === idx ? { ...p, ...patch, asin: p.asin, id: p.id } : p,
    )

    rotateBackup()
    atomicWriteStore(stamp(store, updatedBy, products))
  } catch {
    // Intentionally swallowed
  }
}

/**
 * Removes the product with the given ASIN from the catalog.
 *
 * If no product with that ASIN exists, the call is a no-op.
 * Never throws.
 */
export function removeRuntimeProduct(
  asin: string,
  updatedBy = 'repair',
): void {
  try {
    const store    = readRuntimeCatalog()
    const products = store.products.filter(p => p.asin !== asin)
    if (products.length === store.products.length) return

    rotateBackup()
    atomicWriteStore(stamp(store, updatedBy, products))
  } catch {
    // Intentionally swallowed
  }
}
