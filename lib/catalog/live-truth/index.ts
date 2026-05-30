/**
 * lib/catalog/live-truth/index.ts
 *
 * Public API for the GOODPRICE Live Product Truth system.
 *
 * ⚠ SERVER-ONLY — this module imports from reports.ts which uses Node.js fs.
 * Do not import from client components.
 *
 * Usage (API routes and admin page):
 *   import { loadReport, validateProduct, ... } from '@/lib/catalog/live-truth'
 */

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  LiveTruthResult,
  TruthReport,
  TruthResultStore,
  ValidationQueue,
  QueueItem,
  ExtractedProductData,
  ExtractionConfidence,
  ValidationStatus,
  AvailabilityStatus,
  TitleValidation,
  PricingValidation,
  AvailabilityValidation,
  ImageValidation,
} from './types'

// ── Core validator ────────────────────────────────────────────────────────────
export { validateProduct } from './product-validator'

// ── Reports / persistence ─────────────────────────────────────────────────────
export {
  loadReport,
  saveReport,
  loadAllResults,
  loadProductHistory,
  saveResult,
  buildReport,
  loadQueue,
  saveQueue,
} from './reports'

// ── Freshness / queue ─────────────────────────────────────────────────────────
export { buildQueue, dequeueNext, computePriority } from './freshness-engine'

// ── In-memory cache ───────────────────────────────────────────────────────────
export { getCachedResult, cacheResult, warmCacheFromStore, clearCache, getCacheSize } from './cache'

// ── Scoring utilities ─────────────────────────────────────────────────────────
export { computeTruthScore, classifyStatus, freshnessScore } from './truth-score'

// ── Title similarity (reusable) ────────────────────────────────────────────────
export { jaccardSimilarity } from './title-validator'

// ── Auto-suppression (Gate 11) ────────────────────────────────────────────────
export {
  isHealingSuppressed,
  suppressProduct,
  unsuppressProduct,
  loadSuppressedStore,
  getSuppressedCount,
  invalidateSuppressedCache,
} from './suppression'
export type { SuppressedEntry, SuppressedStore } from './suppression'

// ── Metadata overrides (self-healing price / image corrections) ───────────────
export {
  applyLiveTruthOverrides,
  setOverride,
  removeOverride,
  loadOverrideStore,
  getOverrideCount,
  invalidateOverrideCache,
} from './overrides'
export type { MetadataOverride, OverrideStore } from './overrides'
