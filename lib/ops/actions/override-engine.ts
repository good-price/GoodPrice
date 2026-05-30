/**
 * lib/ops/actions/override-engine.ts
 *
 * Persistent manual override store for product visibility tiers.
 *
 * Overrides survive:
 *   - Trust tier recompute (they live in their own file, not the trust context)
 *   - Healing cycles (healing does not clear override store)
 *   - Server restarts (file-backed persistence)
 *
 * Overrides are applied AFTER the trust engine runs:
 *   computeProductTier() → result → applyOverride() → final result
 *
 * SAFETY: Only soft-gate suppressions can be overridden.
 * action-validators.ts enforces this at the action layer.
 *
 * Storage: data/ops/actions/overrides.json
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { dirname } from 'path'
import type { ProductOverride, OverrideStore, OverrideTier } from './types'
import type { VisibilityResult } from '@/lib/catalog/trust/types'
import { dataPath } from '@/lib/data-path'

// ── Path ───────────────────────────────────────────────────────────────────────

const STORE_PATH = dataPath('data', 'ops', 'actions', 'overrides.json')

// ── I/O ────────────────────────────────────────────────────────────────────────

function ensureDir(): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readStore(): OverrideStore {
  if (!existsSync(STORE_PATH)) return { updatedAt: '', overrides: {} }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as OverrideStore
  } catch {
    return { updatedAt: '', overrides: {} }
  }
}

function writeStore(store: OverrideStore): void {
  ensureDir()
  const tmp = STORE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

function isExpired(override: ProductOverride): boolean {
  if (!override.expiresAt) return false
  return new Date(override.expiresAt).getTime() < Date.now()
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Sets a manual override for a product's visibility tier.
 * Returns the created override.
 */
export function setOverride(
  productId:  string,
  tier:       OverrideTier,
  operator:   string,
  reason:     string,
  protected_: boolean = false,
  expiresAt?: string,
): ProductOverride {
  const store = readStore()
  const override: ProductOverride = {
    productId,
    tier,
    operator,
    reason,
    appliedAt:  new Date().toISOString(),
    protected:  protected_,
    expiresAt,
  }
  store.overrides[productId] = override
  store.updatedAt = override.appliedAt
  writeStore(store)
  return override
}

/**
 * Removes the manual override for a product.
 * Returns true if an override existed, false otherwise.
 */
export function removeOverride(productId: string): boolean {
  const store = readStore()
  if (!store.overrides[productId]) return false
  delete store.overrides[productId]
  store.updatedAt = new Date().toISOString()
  writeStore(store)
  return true
}

/**
 * Returns the active (non-expired) override for a product, or null.
 */
export function getOverride(productId: string): ProductOverride | null {
  const store = readStore()
  const override = store.overrides[productId]
  if (!override) return null
  if (isExpired(override)) {
    // Lazy cleanup
    delete store.overrides[productId]
    store.updatedAt = new Date().toISOString()
    writeStore(store)
    return null
  }
  return override
}

/**
 * Returns all active (non-expired) overrides as a Map for efficient lookup.
 * Used by computeCatalogVisibility to apply overrides in bulk.
 */
export function loadAllOverrides(): Map<string, ProductOverride> {
  const store = readStore()
  const map   = new Map<string, ProductOverride>()
  const now   = Date.now()
  let modified = false

  for (const [id, override] of Object.entries(store.overrides)) {
    if (override.expiresAt && new Date(override.expiresAt).getTime() < now) {
      delete store.overrides[id]
      modified = true
      continue
    }
    map.set(id, override)
  }

  if (modified) {
    store.updatedAt = new Date().toISOString()
    writeStore(store)
  }

  return map
}

/**
 * Returns all active overrides as an array (for admin display).
 */
export function getAllOverrides(): ProductOverride[] {
  return Array.from(loadAllOverrides().values())
}

/**
 * Applies a product override to a VisibilityResult.
 * Only modifies tier, isPublic, and suppressionReason.
 * All gate signals are preserved for admin transparency.
 */
export function applyOverrideToResult(
  result:   VisibilityResult,
  override: ProductOverride,
): VisibilityResult {
  const isPublic = override.tier !== 'suppressed'
  return {
    ...result,
    tier:              override.tier,
    isPublic,
    suppressionReason: isPublic
      ? null
      : `Manual override by ${override.operator}: ${override.reason}`,
  }
}
