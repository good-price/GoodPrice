/**
 * lib/catalog/runtime/reader.ts
 *
 * Fault-tolerant readers for the Runtime Catalog.
 *
 * Read strategy (in order):
 *   1. Read data/catalog/runtime-catalog.json
 *   2. If missing or corrupt: read data/catalog/runtime-catalog.backup.json
 *   3. If backup also missing or corrupt: return an empty store
 *
 * All functions:
 *   - Never throw
 *   - All fs operations synchronous
 *   - Return safe defaults on any error
 *
 * SERVER-ONLY.
 */

import path from 'path'

import { storage } from '@/lib/storage/StorageFactory'

import type {
  RuntimeCatalogStore,
  RuntimeProduct,
  RuntimeCatalogStats,
} from './types'
import {
  validateRuntimeCatalogStore,
  emptyRuntimeCatalogStore,
} from './validation'

// ── File paths ────────────────────────────────────────────────────────────────

const ROOT         = process.cwd()
const CATALOG_FILE = path.resolve(ROOT, 'data/catalog/runtime-catalog.json')
const BACKUP_FILE  = path.resolve(ROOT, 'data/catalog/runtime-catalog.backup.json')

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseFile(filePath: string): RuntimeCatalogStore | null {
  try {
    const raw = storage.read(filePath)
    if (raw === null) return null
    return validateRuntimeCatalogStore(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

// ── Public API — Store ────────────────────────────────────────────────────────

/**
 * Reads the full RuntimeCatalogStore.
 * Falls back to backup, then to empty store.
 * Never throws.
 */
export function readRuntimeCatalog(): RuntimeCatalogStore {
  return parseFile(CATALOG_FILE)
    ?? parseFile(BACKUP_FILE)
    ?? emptyRuntimeCatalogStore()
}

// ── Public API — Products ─────────────────────────────────────────────────────

/**
 * Returns all products in the runtime catalog.
 * Never throws.
 */
export function getRuntimeProducts(): RuntimeProduct[] {
  return readRuntimeCatalog().products
}

/**
 * Returns the product matching the given ASIN, or null if not found.
 * Never throws.
 */
export function getRuntimeProductByAsin(asin: string): RuntimeProduct | null {
  return getRuntimeProducts().find(p => p.asin === asin) ?? null
}

/**
 * Returns all products in the given category slug.
 * Never throws.
 */
export function getRuntimeCategoryProducts(slug: string): RuntimeProduct[] {
  return getRuntimeProducts().filter(p => p.category === slug)
}

// ── Public API — Stats ────────────────────────────────────────────────────────

/**
 * Computes a summary stats snapshot from the current runtime catalog.
 * Never throws.
 */
export function getRuntimeCatalogStats(): RuntimeCatalogStats {
  const store = readRuntimeCatalog()
  const products = store.products

  const byCategory: Record<string, number> = {}
  let active = 0, inactive = 0, unverified = 0, stale = 0, colombia = 0

  for (const p of products) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1

    switch (p.status) {
      case 'active':     active++;     break
      case 'inactive':   inactive++;   break
      case 'unverified': unverified++; break
      case 'stale':      stale++;      break
    }

    if (p.shipsToColombiaConfirmed) colombia++
  }

  return {
    totalProducts:      products.length,
    activeProducts:     active,
    inactiveProducts:   inactive,
    unverifiedProducts: unverified,
    staleProducts:      stale,
    colombiaConfirmed:  colombia,
    byCategory,
    version:            store.version,
    updatedAt:          store.updatedAt,
  }
}
