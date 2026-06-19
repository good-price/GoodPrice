/**
 * lib/catalog/runtime/validation.ts
 *
 * Schema validation and field-level coercion for the Runtime Catalog.
 *
 * Uses manual type-guard migration functions — the same pattern as
 * lib/ops/runtime/reader.ts throughout OPS V3. This avoids adding an
 * external dependency (Zod is not in the project's package.json) while
 * providing the same guarantees: unknown/malformed JSON is coerced to
 * safe defaults rather than throwing.
 *
 * Key exports:
 *   validateRuntimeCatalogStore() — validates and migrates a parsed JSON object
 *   validateCategoryConfigStore() — validates and migrates category config
 *   isValidAsin()                 — 10-char A-Z0-9 check
 *   VALID_CATEGORIES              — canonical slug set
 *
 * SERVER-ONLY.
 */

import type {
  RuntimeCatalogStore,
  RuntimeProduct,
  RuntimeProductStatus,
  RuntimeProductSource,
  CategoryConfig,
  CategoryConfigStore,
} from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const VALID_CATEGORIES = new Set([
  'electronica',
  'gaming',
  'hogar',
  'cocina',
  'deporte',
  'oficina',
  'belleza',
  'mascotas',
  'bebes',
  'herramientas',
])

const VALID_STATUSES = new Set<RuntimeProductStatus>([
  'active', 'inactive', 'unverified', 'stale',
])

const VALID_SOURCES = new Set<RuntimeProductSource>([
  'legacy', 'auto-fill', 'manual', 'repair',
])

const ASIN_RE = /^[A-Z0-9]{10}$/

// ── Primitive guards ──────────────────────────────────────────────────────────

export function isValidAsin(value: unknown): value is string {
  return typeof value === 'string' && ASIN_RE.test(value)
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && isFinite(value) ? value : fallback
}

function numOrUndef(value: unknown): number | undefined {
  return typeof value === 'number' && isFinite(value) ? value : undefined
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

// ── Product migration ─────────────────────────────────────────────────────────

/**
 * Coerces a raw parsed object into a valid RuntimeProduct.
 * Any missing or type-mismatched field falls back to a safe default.
 * Returns null if the object lacks both id and asin (not a recognisable product).
 */
export function migrateRuntimeProduct(
  raw: Record<string, unknown>,
): RuntimeProduct | null {
  const id   = str(raw.id,   '')
  const asin = str(raw.asin, '')
  if (!id || !asin) return null

  const rawStatus = raw.status as unknown
  const status: RuntimeProductStatus =
    typeof rawStatus === 'string' && VALID_STATUSES.has(rawStatus as RuntimeProductStatus)
      ? (rawStatus as RuntimeProductStatus)
      : 'unverified'

  const rawSource = raw.source as unknown
  const source: RuntimeProductSource =
    typeof rawSource === 'string' && VALID_SOURCES.has(rawSource as RuntimeProductSource)
      ? (rawSource as RuntimeProductSource)
      : 'legacy'

  return {
    id,
    asin,
    category:     str(raw.category, 'electronica'),
    title:        str(raw.title,       ''),
    amazonTitle:  str(raw.amazonTitle, ''),
    brand:        str(raw.brand,       ''),
    image:        str(raw.image,       ''),
    price:        num(raw.price,   0),
    rating:       num(raw.rating,  0),
    reviews:      num(raw.reviews, 0),
    status,
    shipsToColombiaConfirmed: bool(raw.shipsToColombiaConfirmed, false),
    source,
    admittedAt:   str(raw.admittedAt, new Date().toISOString()),
    lastValidated: strOrNull(raw.lastValidated),
    trustScore:      numOrUndef(raw.trustScore),
    validationScore: numOrUndef(raw.validationScore),
    lastPriceSync: typeof raw.lastPriceSync === 'string' ? raw.lastPriceSync : null,
    lastImageSync: typeof raw.lastImageSync === 'string' ? raw.lastImageSync : null,
    addedByPipelineId:       typeof raw.addedByPipelineId       === 'string' ? raw.addedByPipelineId       : undefined,
    lastUpdatedByPipelineId: typeof raw.lastUpdatedByPipelineId === 'string' ? raw.lastUpdatedByPipelineId : undefined,
  }
}

// ── Store migration ───────────────────────────────────────────────────────────

/**
 * Validates and migrates a raw parsed JSON object into a RuntimeCatalogStore.
 * Never throws. Returns an empty store on complete garbage input.
 */
export function validateRuntimeCatalogStore(
  raw: unknown,
): RuntimeCatalogStore {
  const empty = emptyRuntimeCatalogStore()

  if (typeof raw !== 'object' || raw === null) return empty

  const obj = raw as Record<string, unknown>

  const rawProducts = Array.isArray(obj.products) ? obj.products : []
  const products: RuntimeProduct[] = []
  for (const item of rawProducts) {
    if (typeof item === 'object' && item !== null) {
      const p = migrateRuntimeProduct(item as Record<string, unknown>)
      if (p !== null) products.push(p)
    }
  }

  return {
    version:       num(obj.version, 1),
    updatedAt:     strOrNull(obj.updatedAt),
    updatedBy:     str(obj.updatedBy, 'system'),
    totalProducts: products.length,  // always authoritative — ignore stored value
    products,
  }
}

// ── Category config migration ─────────────────────────────────────────────────

function migrateCategoryConfig(raw: unknown): CategoryConfig {
  const obj = (typeof raw === 'object' && raw !== null)
    ? raw as Record<string, unknown>
    : {}
  return { minimum: Math.max(0, Math.round(num(obj.minimum, 20))) }
}

/**
 * Validates and migrates a raw parsed JSON object into a CategoryConfigStore.
 * Unknown categories are kept; categories with invalid data get minimum = 20.
 * Never throws. Returns a store with all 10 canonical categories at 20 if garbage.
 */
export function validateCategoryConfigStore(raw: unknown): CategoryConfigStore {
  if (typeof raw !== 'object' || raw === null) return defaultCategoryConfigStore()

  const obj = raw as Record<string, unknown>
  const result: CategoryConfigStore = {}

  for (const slug of Array.from(VALID_CATEGORIES)) {
    result[slug] = migrateCategoryConfig(obj[slug])
  }

  // Preserve any additional category slugs the operator may have added
  for (const [slug, val] of Object.entries(obj)) {
    if (!VALID_CATEGORIES.has(slug)) {
      result[slug] = migrateCategoryConfig(val)
    }
  }

  return result
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export function emptyRuntimeCatalogStore(): RuntimeCatalogStore {
  return {
    version:       1,
    updatedAt:     null,
    updatedBy:     'system',
    totalProducts: 0,
    products:      [],
  }
}

export function defaultCategoryConfigStore(): CategoryConfigStore {
  const store: CategoryConfigStore = {}
  for (const slug of Array.from(VALID_CATEGORIES)) {
    store[slug] = { minimum: 20 }
  }
  return store
}
