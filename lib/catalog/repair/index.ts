/**
 * lib/catalog/repair/index.ts
 *
 * Public API for the GOODPRICE autonomous catalog repair system.
 *
 * Usage:
 *   import { runCatalogRepair, getRepairReport } from '@/lib/catalog/repair'
 *
 * The repair system can work without PA-API credentials:
 *   - Fixes broken images-na CDN URLs via CDN swap (high confidence, auto-applied)
 *   - Flags /images/P/ paths as 'needs_paapi' (cannot fix without product image hash)
 *   - Future sources: amazon_page, paapi, manual (stubs return empty arrays)
 *
 * When PA-API credentials are available:
 *   - Use scripts/paapi-sync.ts for full ASIN verification and image refresh
 */

// ── Re-export all types ────────────────────────────────────────────────────────
export type {
  RepairReason,
  RepairStatus,
  CandidateSource,
  CandidateScoreBreakdown,
  RepairCandidate,
  CatalogPatch,
  RepairJob,
  RepairOptions,
  PipelineResult,
  ReplacementEntry,
  FailureEntry,
  HistoryFile,
  RepairReport,
  CategoryRepairStats,
} from './types'

// ── Core pipeline ──────────────────────────────────────────────────────────────
export {
  runRepairPipeline,
  repairProduct,
  diagnoseProduct,
  findProductsNeedingRepair,
  buildPatchesForCandidate,
} from './replacement-engine'

// ── Candidate search ───────────────────────────────────────────────────────────
export {
  searchCandidates,
  searchAmazonPage,
  searchPaapi,
  searchManualOverrides,
  buildCdnSwapCandidate,
  buildRepairedImageUrl,
  verifyImageUrl,
  buildSearchQuery,
} from './candidate-search'

// ── Candidate scoring ──────────────────────────────────────────────────────────
export {
  scoreCandidates,
  scoreCandidate,
  jaccardSimilarity,
} from './candidate-scoring'

// ── Patch application ──────────────────────────────────────────────────────────
export {
  applyPatch,
  applyPatches,
} from './auto-fix'

// ── History ────────────────────────────────────────────────────────────────────
export {
  recordReplacement,
  recordFailure,
  getReplacementHistory,
  getFailures,
  clearFailure,
  getHistorySummary,
} from './history'

// ── Reports ────────────────────────────────────────────────────────────────────
export {
  generateRepairReport,
  getRepairSummary,
} from './reports'

// ── Convenience wrapper ────────────────────────────────────────────────────────

/**
 * Run the catalog repair pipeline.
 * Alias for runRepairPipeline() with friendlier name for API routes.
 */
export { runRepairPipeline as runCatalogRepair } from './replacement-engine'

/**
 * Generate the repair report for the admin dashboard.
 * Alias for generateRepairReport() with friendlier name.
 */
export { generateRepairReport as getRepairReport } from './reports'
