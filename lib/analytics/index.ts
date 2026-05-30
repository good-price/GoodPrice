/**
 * Public API for the analytics system.
 * Import from here — not from individual lib/analytics/* files.
 */

// ── Adapter layer (storage backend) ──────────────────────────────────────────
export type { AnalyticsAdapter } from './adapter'
export { getAdapter, resetAdapter } from './adapter'

// ── Store (async public API — delegates to active adapter) ────────────────────
export {
  recordProductClick,
  recordCategoryView,
  getTopProducts,
  getTopCategories,
  getAnalyticsSummary,
  resetAnalyticsStore,
} from './store'

// ── Metrics (catalog cross-reference, report builders) ────────────────────────
export {
  buildObservabilityReport,
  buildCatalogMetrics,
} from './metrics'

export type {
  ProductMetric,
  CategoryMetric,
  ObservabilityReport,
  CatalogMetricsReport,
} from './metrics'
