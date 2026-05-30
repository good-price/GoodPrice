/**
 * lib/catalog/live-truth/overrides.ts
 *
 * Metadata override layer for the self-healing system.
 * Stores safe field patches (price, oldPrice, image) applied on top of
 * catalog data in getPublicProducts() — corrects stale/drifted values
 * without touching the canonical product data files.
 *
 * Title overrides are intentionally NOT supported here — title corrections
 * require admin review and are tracked in drift-suggestions.json.
 *
 * File: data/catalog/live-truth/metadata-overrides.json
 *
 * Cache: module-level map, invalidated by invalidateOverrideCache().
 * Fine for serverless — each instance has its own module scope.
 *
 * SERVER-ONLY — uses Node.js fs.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import type { Product } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetadataOverride {
  productId:  string
  asin:       string
  /** Corrected price in USD. Applied when live price diverges > threshold. */
  price?:     number
  /** Corrected compare-at price in USD. Applied when old price is suspect. */
  oldPrice?:  number
  /** Corrected image URL. Applied when image drift confirmed with high confidence. */
  image?:     string
  /** Human-readable reason for this override (logged, shown in admin). */
  reason:     string
  /** ISO timestamp when this override was written. */
  appliedAt:  string
}

export interface OverrideStore {
  updatedAt: string
  overrides: Record<string, MetadataOverride>
}

// ── Path ──────────────────────────────────────────────────────────────────────

const OVERRIDES_PATH = join(
  process.cwd(),
  'data', 'catalog', 'live-truth', 'metadata-overrides.json',
)

// ── Module-level cache ────────────────────────────────────────────────────────

let _cache: Map<string, MetadataOverride> | null = null

export function invalidateOverrideCache(): void {
  _cache = null
}

// ── File I/O ──────────────────────────────────────────────────────────────────

function loadStore(): OverrideStore {
  if (!existsSync(OVERRIDES_PATH)) {
    return { updatedAt: '', overrides: {} }
  }
  try {
    return JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8')) as OverrideStore
  } catch {
    return { updatedAt: '', overrides: {} }
  }
}

function saveStore(store: OverrideStore): void {
  const dir = dirname(OVERRIDES_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = OVERRIDES_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, OVERRIDES_PATH)
  invalidateOverrideCache()
}

// ── Internal cache accessor ───────────────────────────────────────────────────

function getOverrideMap(): Map<string, MetadataOverride> {
  if (_cache !== null) return _cache
  const store = loadStore()
  _cache = new Map(Object.entries(store.overrides))
  return _cache
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply any stored overrides to a product array.
 * Returns new Product objects (never mutates the originals).
 * Fast-path: returns input array unchanged when no overrides exist.
 */
export function applyLiveTruthOverrides(products: Product[]): Product[] {
  const map = getOverrideMap()
  if (map.size === 0) return products

  return products.map(p => {
    if (!p.id) return p
    const ov = map.get(p.id)
    if (!ov) return p
    return {
      ...p,
      ...(ov.price    !== undefined ? { price:    ov.price    } : {}),
      ...(ov.oldPrice !== undefined ? { oldPrice: ov.oldPrice } : {}),
      ...(ov.image    !== undefined ? { image:    ov.image    } : {}),
    }
  })
}

/** Write or update a single override. Invalidates the cache. */
export function setOverride(override: MetadataOverride): void {
  const store = loadStore()
  store.overrides[override.productId] = override
  store.updatedAt = new Date().toISOString()
  saveStore(store)
}

/** Remove an override once the underlying catalog data has been corrected. */
export function removeOverride(productId: string): boolean {
  const store = loadStore()
  if (!(productId in store.overrides)) return false
  delete store.overrides[productId]
  store.updatedAt = new Date().toISOString()
  saveStore(store)
  return true
}

/** Returns the full override store (for admin / reporting). */
export function loadOverrideStore(): OverrideStore {
  return loadStore()
}

/** Returns the count of active metadata overrides. */
export function getOverrideCount(): number {
  return getOverrideMap().size
}
