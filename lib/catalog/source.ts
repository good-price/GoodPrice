/**
 * lib/catalog/source.ts
 *
 * Catalog Compatibility Layer — Sprint 3B.
 *
 * Provides a unified read interface that transparently switches between:
 *   'legacy'  — data/catalog/*.ts (static TypeScript files)
 *   'runtime' — data/catalog/runtime-catalog.json (mutable JSON store)
 *
 * Source selection (in priority order):
 *   1. CATALOG_SOURCE env var ('legacy' | 'runtime') — operator override / rollback
 *   2. Auto-detect: runtime if runtime-catalog.json has totalProducts > 0, else legacy
 *
 * Rollback: set CATALOG_SOURCE=legacy in environment variables — instant, zero-deploy.
 * Force runtime: set CATALOG_SOURCE=runtime — bypasses the count check.
 *
 * Consumers:
 *   lib/catalog/public.ts  — replaces direct calls to getColombiaProducts() / getAllProducts()
 *   Any other internal module that currently reads from data/catalog/index.ts
 *
 * SERVER-ONLY — never import in Client Components.
 */

import { buildAsinUrl }        from '@/lib/affiliate'
import { applyColombiaRules }  from '@/lib/catalog/colombia'
import {
  getAllProducts,
  getColombiaProducts,
  getCatalogStats as getLegacyCatalogStats,
} from '@/data/catalog'
import {
  readRuntimeCatalog,
  getRuntimeProducts,
} from '@/lib/catalog/runtime/reader'
import type { RuntimeProduct } from '@/lib/catalog/runtime/types'
import type { Product, CatalogStats } from '@/types'

// ── Source type ───────────────────────────────────────────────────────────────

export type CatalogSource = 'legacy' | 'runtime'

// ── Source resolver ───────────────────────────────────────────────────────────

/**
 * Determines which catalog source to use for this request.
 *
 * Reads the filesystem on every call — intentional. With force-dynamic pages
 * and serverless cold-starts, there is no warm module-level cache to worry
 * about, and we want each invocation to reflect the current state.
 *
 * Never throws.
 */
export function getCatalogSource(): CatalogSource {
  // Operator override — allows instant rollback via env var
  const override = process.env.CATALOG_SOURCE
  if (override === 'legacy')  return 'legacy'
  if (override === 'runtime') return 'runtime'

  // Auto-detect: switch to runtime once the catalog has been populated
  try {
    const store = readRuntimeCatalog()
    return store.totalProducts > 0 ? 'runtime' : 'legacy'
  } catch {
    return 'legacy'
  }
}

// ── RuntimeProduct → Product adapter ─────────────────────────────────────────

/**
 * Converts a RuntimeProduct into the Product interface expected by
 * lib/catalog/public.ts and all public-facing pages.
 *
 * Adds: amazonUrl (affiliate URL built from ASIN).
 * Preserves: all optional editorial flags if present (isTopSeller, etc.).
 */
function runtimeToProduct(p: RuntimeProduct): Product {
  return {
    id:                       p.id,
    asin:                     p.asin,
    category:                 p.category,
    title:                    p.title,
    amazonTitle:              p.amazonTitle || undefined,
    brand:                    p.brand       || undefined,
    image:                    p.image,
    price:                    p.price,
    rating:                   p.rating,
    reviews:                  p.reviews,
    status:                   p.status,
    shipsToColombiaConfirmed: p.shipsToColombiaConfirmed,
    lastValidated:            p.lastValidated ?? undefined,
    amazonUrl:                buildAsinUrl(p.asin),
    // ── Editorial flags (preserved from legacy migration) ──────────────────
    isTopSeller:  p.isTopSeller,
    isOffer:      p.isOffer,
    badge:        p.badge,
    oldPrice:     p.oldPrice,
    shortTitle:   p.shortTitle,
    description:  p.description,
  }
}

// ── Unified readers ───────────────────────────────────────────────────────────

/**
 * All products in the active catalog, filtered for Colombia eligibility.
 *
 * Runtime path:  active-only → hydrate → applyColombiaRules → filter restrictions
 * Legacy path:   getColombiaProducts() (identical behaviour)
 *
 * Drop-in replacement for getColombiaProducts() from data/catalog/index.ts.
 * Used by lib/catalog/public.ts as the base product set for 11-gate filtering.
 *
 * Never throws.
 */
export function getCatalogProducts(): Product[] {
  try {
    if (getCatalogSource() === 'runtime') {
      return getRuntimeProducts()
        .filter(p => p.status !== 'inactive')
        .map(runtimeToProduct)
        .map(applyColombiaRules)
        .filter(p => !p.colombiaRestriction)
    }
  } catch {
    // Fall through to legacy on any error
  }
  return getColombiaProducts()
}

/**
 * Full catalog — all statuses, no Colombia filtering.
 *
 * Drop-in replacement for getAllProducts() from data/catalog/index.ts.
 * Used by lib/catalog/public.ts for admin stats (total count, broken images, etc.).
 *
 * Never throws.
 */
export function getCatalogAllProducts(): Product[] {
  try {
    if (getCatalogSource() === 'runtime') {
      return getRuntimeProducts().map(runtimeToProduct)
    }
  } catch {
    // Fall through to legacy on any error
  }
  return getAllProducts()
}

/**
 * Finds a single product by ASIN from the active Colombia-filtered catalog.
 * Returns null if not found.
 * Never throws.
 */
export function getCatalogProductByAsin(asin: string): Product | null {
  try {
    return getCatalogProducts().find(p => p.asin === asin) ?? null
  } catch {
    return null
  }
}

/**
 * Returns all Colombia-filtered products for a given category slug.
 * Never throws.
 */
export function getCatalogCategoryProducts(slug: string): Product[] {
  try {
    return getCatalogProducts().filter(p => p.category === slug)
  } catch {
    return []
  }
}

/**
 * Catalog health stats from the active source.
 * Never throws.
 */
export function getCatalogStats(): CatalogStats {
  try {
    if (getCatalogSource() === 'runtime') {
      const store = readRuntimeCatalog()
      const all   = store.products
      const byCategory: Record<string, number> = {}
      for (const p of all) {
        byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
      }
      return {
        total:       all.length,
        active:      all.filter(p => p.status === 'active').length,
        inactive:    all.filter(p => p.status === 'inactive').length,
        unverified:  all.filter(p => p.status === 'unverified').length,
        stale:       all.filter(p => p.status === 'stale').length,
        byCategory,
        lastUpdated: store.updatedAt ?? new Date().toISOString(),
      }
    }
  } catch {
    // Fall through to legacy on any error
  }
  return getLegacyCatalogStats()
}
