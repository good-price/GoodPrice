/**
 * lib/catalog/runtime/category-config.ts
 *
 * Reader and writer for data/catalog/category-config.json.
 *
 * Stores the operator-configured minimum product count per category.
 * Used by the Catalog Center and the Auto Fill pipeline to determine
 * which categories are below target and need new products.
 *
 * All operations:
 *   - Synchronous
 *   - Fault-tolerant (never throw)
 *   - Writes are atomic (tmp file + renameSync)
 *
 * SERVER-ONLY.
 */

import path from 'path'

import { storage } from '@/lib/storage/StorageFactory'

import type {
  CategoryConfigStore,
  CategoryDeficit,
} from './types'
import {
  validateCategoryConfigStore,
  defaultCategoryConfigStore,
  VALID_CATEGORIES,
} from './validation'
import { getRuntimeCategoryProducts } from './reader'

// ── File path ─────────────────────────────────────────────────────────────────

const CONFIG_FILE = path.resolve(process.cwd(), 'data/catalog/category-config.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

function atomicWriteConfig(store: CategoryConfigStore): void {
  const tmp = CONFIG_FILE + '.tmp'
  storage.write(tmp, JSON.stringify(store, null, 2))
  storage.rename(tmp, CONFIG_FILE)
}

// ── Readers ───────────────────────────────────────────────────────────────────

/**
 * Reads the full category config store.
 * Returns defaults (minimum 20 per category) if file is missing or corrupt.
 * Never throws.
 */
export function getCategoryConfig(): CategoryConfigStore {
  try {
    const raw = storage.read(CONFIG_FILE)
    if (raw === null) return defaultCategoryConfigStore()
    return validateCategoryConfigStore(JSON.parse(raw) as unknown)
  } catch {
    return defaultCategoryConfigStore()
  }
}

/**
 * Returns the minimum product count configured for the given category slug.
 * Falls back to 20 if not configured.
 * Never throws.
 */
export function getCategoryMinimum(slug: string): number {
  try {
    return getCategoryConfig()[slug]?.minimum ?? 20
  } catch {
    return 20
  }
}

/**
 * Returns the count of runtime products currently in the given category.
 * Never throws.
 */
export function getCategoryCurrentCount(slug: string): number {
  try {
    return getRuntimeCategoryProducts(slug).length
  } catch {
    return 0
  }
}

/**
 * Computes the deficit for every configured category.
 *
 * Returns all categories — deficit = 0 means the category is at or above target.
 * Categories are sorted: highest deficit first, then by slug alphabetically.
 *
 * Never throws.
 */
export function computeCategoryDeficits(): CategoryDeficit[] {
  try {
    const config = getCategoryConfig()
    const deficits: CategoryDeficit[] = []

    const allSlugs = Array.from(
      new Set([...Array.from(VALID_CATEGORIES), ...Object.keys(config)]),
    )

    for (const category of allSlugs) {
      const minimum = config[category]?.minimum ?? 20
      const current = getCategoryCurrentCount(category)
      deficits.push({
        category,
        current,
        minimum,
        deficit: Math.max(0, minimum - current),
      })
    }

    // Sort: largest deficit first, then alphabetically
    return deficits.sort((a, b) =>
      b.deficit !== a.deficit
        ? b.deficit - a.deficit
        : a.category.localeCompare(b.category),
    )
  } catch {
    return []
  }
}

// ── Writers ───────────────────────────────────────────────────────────────────

/**
 * Persists a full category config store atomically.
 * Never throws.
 */
export function saveCategoryConfig(store: CategoryConfigStore): void {
  try {
    atomicWriteConfig(store)
  } catch {
    // Intentionally swallowed — config writes are best-effort
  }
}

/**
 * Updates the minimum for a single category slug.
 * Other categories are left unchanged.
 * Never throws.
 */
export function updateCategoryMinimum(slug: string, minimum: number): void {
  try {
    const current = getCategoryConfig()
    const updated: CategoryConfigStore = {
      ...current,
      [slug]: { minimum: Math.max(0, Math.round(minimum)) },
    }
    atomicWriteConfig(updated)
  } catch {
    // Intentionally swallowed
  }
}
