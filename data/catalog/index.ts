import { Product, RawProduct, CatalogStats } from '@/types'
import { buildAsinUrl } from '@/lib/affiliate'
import { applyColombiaRules } from '@/lib/catalog/colombia'

import electronica from './electronica'
import gaming from './gaming'
import hogar from './hogar'
import cocina from './cocina'
import deporte from './deporte'
import oficina from './oficina'
import belleza from './belleza'
import mascotas from './mascotas'
import bebes from './bebes'
import herramientas from './herramientas'

// Registry: add new category files here as the catalog grows
const REGISTRY: RawProduct[] = [
  ...electronica,
  ...gaming,
  ...hogar,
  ...cocina,
  ...deporte,
  ...oficina,
  ...belleza,
  ...mascotas,
  ...bebes,
  ...herramientas,
]

/** Convert a RawProduct (ASIN-based) to a full Product with affiliate URL */
function hydrate(raw: RawProduct): Product {
  return {
    ...raw,
    amazonUrl: buildAsinUrl(raw.asin),
  }
}

/** Full catalog — all statuses, all products */
export function getAllProducts(): Product[] {
  return REGISTRY.map(hydrate)
}

/** Active products only — the default for all UI */
export function getActiveProducts(): Product[] {
  return REGISTRY
    .filter(p => p.status !== 'inactive')
    .map(hydrate)
    .filter(p => !p.colombiaRestriction) // remove Colombia-blocked products
}

/** Apply Colombia rules and return the safe catalog */
export function getColombiaProducts(): Product[] {
  return REGISTRY
    .filter(p => p.status !== 'inactive')
    .map(hydrate)
    .map(applyColombiaRules)
    .filter(p => !p.colombiaRestriction)
}

/** Catalog health stats — for admin/monitoring */
export function getCatalogStats(): CatalogStats {
  const all = REGISTRY
  const byCategory: Record<string, number> = {}

  for (const p of all) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1
  }

  return {
    total: all.length,
    active: all.filter(p => p.status === 'active').length,
    inactive: all.filter(p => p.status === 'inactive').length,
    unverified: all.filter(p => p.status === 'unverified').length,
    stale: all.filter(p => p.status === 'stale').length,
    byCategory,
    lastUpdated: new Date().toISOString(),
  }
}

/** All raw products with their ASINs — for validation scripts */
export function getRawProducts(): RawProduct[] {
  return REGISTRY
}
