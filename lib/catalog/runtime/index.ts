/**
 * lib/catalog/runtime/index.ts
 *
 * Public API for the Runtime Catalog.
 *
 * Import from '@/lib/catalog/runtime' for all runtime catalog operations.
 *
 * SERVER-ONLY — never import in Client Components.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  RuntimeProduct,
  RuntimeProductStatus,
  RuntimeProductSource,
  RuntimeCatalogStore,
  CategoryConfig,
  CategoryConfigStore,
  CategoryDeficit,
  RuntimeCatalogStats,
} from './types'

// ── Validation utilities ──────────────────────────────────────────────────────
export {
  isValidAsin,
  VALID_CATEGORIES,
  emptyRuntimeCatalogStore,
  defaultCategoryConfigStore,
  validateRuntimeCatalogStore,
  validateCategoryConfigStore,
} from './validation'

// ── Readers ───────────────────────────────────────────────────────────────────
export {
  readRuntimeCatalog,
  getRuntimeProducts,
  getRuntimeProductByAsin,
  getRuntimeCategoryProducts,
  getRuntimeCatalogStats,
} from './reader'

// ── Writers ───────────────────────────────────────────────────────────────────
export {
  saveRuntimeCatalog,
  addRuntimeProduct,
  updateRuntimeProduct,
  removeRuntimeProduct,
} from './writer'

// ── Category config ───────────────────────────────────────────────────────────
export {
  getCategoryConfig,
  getCategoryMinimum,
  getCategoryCurrentCount,
  computeCategoryDeficits,
  saveCategoryConfig,
  updateCategoryMinimum,
} from './category-config'
