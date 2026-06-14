/**
 * lib/catalog/deleted-products.ts
 *
 * File-backed registry of permanently deleted products.
 * Used as a runtime filter in data/catalog/index.ts so deleted products
 * are immediately hidden from the public catalog and OPS views without
 * requiring edits to the TypeScript source files.
 *
 * Storage: data/catalog/deleted-products.json
 * Forensic: deletion metadata (operator, reason, timestamp) is preserved here.
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeletedProductRecord {
  productId:  string
  asin:       string
  title:      string
  category:   string
  tier:       string
  operator:   string
  reason:     string
  deletedAt:  string  // ISO
}

interface DeletedProductStore {
  updatedAt: string
  products:  DeletedProductRecord[]
}

// ── Path ───────────────────────────────────────────────────────────────────────

const STORE_PATH = dataPath('data', 'catalog', 'deleted-products.json')

// ── I/O ────────────────────────────────────────────────────────────────────────

function readStore(): DeletedProductStore {
  if (!existsSync(STORE_PATH)) return { updatedAt: '', products: [] }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as DeletedProductStore
  } catch {
    return { updatedAt: '', products: [] }
  }
}

function writeStore(store: DeletedProductStore): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = STORE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns true if the product has been permanently deleted. */
export function isProductDeleted(productId: string): boolean {
  return readStore().products.some(p => p.productId === productId)
}

/** Returns a Set of all deleted product IDs (fast bulk lookup). */
export function getDeletedProductIds(): Set<string> {
  return new Set(readStore().products.map(p => p.productId))
}

/** Returns all deleted product records. */
export function getDeletedProducts(): DeletedProductRecord[] {
  return readStore().products
}

/** Marks a product as permanently deleted. Idempotent — safe to call twice. */
export function markProductDeleted(
  record: Omit<DeletedProductRecord, 'deletedAt'>,
): DeletedProductRecord {
  const store = readStore()
  const full: DeletedProductRecord = {
    ...record,
    deletedAt: new Date().toISOString(),
  }
  // Remove any existing entry for this product before pushing
  store.products = store.products.filter(p => p.productId !== record.productId)
  store.products.push(full)
  store.updatedAt = full.deletedAt
  writeStore(store)
  return full
}
