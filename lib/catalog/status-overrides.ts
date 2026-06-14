/**
 * lib/catalog/status-overrides.ts
 *
 * Runtime suppression registry for active products that fail the daily
 * health check (unavailable, invalid ASIN, missing image, missing price).
 *
 * Products in this store are hidden from the public catalog even if their
 * status field in the TypeScript catalog files still reads 'active'. This
 * allows automatic suppression without requiring a git commit per product.
 *
 * A product is removed from the store when the daily audit detects it has
 * recovered (passes the health gates again) — self-healing behavior.
 *
 * Storage: data/catalog/status-overrides.json  (writable via dataPath)
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname } from 'path'
import { dataPath } from '@/lib/data-path'

// ── Types ─────────────────────────────────────────────────────────────────────

export type OverrideReason =
  | 'unavailable'
  | 'invalid_asin'
  | 'image_missing'
  | 'price_missing'

export interface StatusOverrideEntry {
  productId:      string
  asin:           string
  reason:         OverrideReason
  gatesFailed:    string[]
  overriddenAt:   string   // first detected
  lastCheckedAt:  string   // most recent check that confirmed the failure
  checkCount:     number   // how many consecutive daily audits confirmed this
}

interface StatusOverrideStore {
  updatedAt: string
  /** productId → override entry */
  overrides: Record<string, StatusOverrideEntry>
}

// ── I/O ────────────────────────────────────────────────────────────────────────

const STORE_PATH = dataPath('data', 'catalog', 'status-overrides.json')

function readStore(): StatusOverrideStore {
  if (!existsSync(STORE_PATH)) return { updatedAt: '', overrides: {} }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as StatusOverrideStore
  } catch {
    return { updatedAt: '', overrides: {} }
  }
}

function writeStore(store: StatusOverrideStore): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = STORE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns a Set of suppressed product IDs — fast bulk lookup for public.ts. */
export function getSuppressedProductIds(): Set<string> {
  return new Set(Object.keys(readStore().overrides))
}

export function getStatusOverrides(): StatusOverrideEntry[] {
  return Object.values(readStore().overrides)
}

export function isProductSuppressed(productId: string): boolean {
  return productId in readStore().overrides
}

/**
 * Adds or refreshes a suppression entry for a product.
 * Increments checkCount on repeat calls to track persistence of the issue.
 */
export function suppressProduct(
  productId: string,
  asin:      string,
  reason:    OverrideReason,
  gatesFailed: string[],
): StatusOverrideEntry {
  const store  = readStore()
  const now    = new Date().toISOString()
  const existing = store.overrides[productId]
  const entry: StatusOverrideEntry = {
    productId,
    asin,
    reason,
    gatesFailed,
    overriddenAt:  existing?.overriddenAt ?? now,
    lastCheckedAt: now,
    checkCount:    (existing?.checkCount ?? 0) + 1,
  }
  store.overrides[productId] = entry
  store.updatedAt = now
  writeStore(store)
  return entry
}

/**
 * Removes a product from the suppression store (recovery detected).
 * Safe to call if the product is not suppressed — no-op.
 */
export function recoverProduct(productId: string): boolean {
  const store = readStore()
  if (!(productId in store.overrides)) return false
  delete store.overrides[productId]
  store.updatedAt = new Date().toISOString()
  writeStore(store)
  return true
}
