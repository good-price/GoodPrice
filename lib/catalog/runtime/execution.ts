/**
 * lib/catalog/runtime/execution.ts
 *
 * Reader and types for the Catalog Execution State.
 *
 * Persisted to: data/catalog/catalog-execution.json
 *
 * This file tracks the current or last Auto Fill pipeline execution.
 * It is written by the Auto Fill pipeline (future sprint) and read
 * by the Catalog Center Execution zone for display only.
 *
 * All reads:
 *   - Fault-tolerant (never throw)
 *   - Return idle default state on missing or corrupt file
 *   - Synchronous fs operations
 *
 * SERVER-ONLY.
 */

import path from 'path'

import { storage } from '@/lib/storage/StorageFactory'

// ── File path ─────────────────────────────────────────────────────────────────

const EXECUTION_FILE = path.resolve(
  process.cwd(),
  'data/catalog/catalog-execution.json',
)

// ── Types ─────────────────────────────────────────────────────────────────────

export type CatalogExecutionStage =
  | 'idle'        // no execution in progress or no history
  | 'calculating' // Sprint 3E — computing deficits, selecting target category
  | 'discovering' // Sprint 3F — running product discovery
  | 'validating'  // Sprint 3F — validating candidates
  | 'admitting'   // Sprint 3F — admitting approved products to the catalog
  | 'completed'   // execution completed successfully (Sprint 3E+)
  | 'done'        // backward-compat alias for completed
  | 'failed'      // execution completed with errors

export interface CatalogExecutionState {
  /** True while an Auto Fill pipeline is actively running. */
  isRunning:        boolean
  /** Category slug being filled, null when idle. */
  category:         string | null
  /** Current pipeline stage. */
  stage:            CatalogExecutionStage
  /** How many products were needed when the pipeline started. */
  deficit:          number
  /** Candidates discovered (found) in this run. */
  found:            number
  /** Candidates that passed the validation checks. Sprint 3F+ */
  validated:        number
  /** Products prepared for admission (not yet written). Sprint 3F+ */
  admitted:         number
  /** ISO timestamp when the current/last execution started. */
  startedAt:        string | null
  /** ISO timestamp when the last execution completed. null while running. */
  completedAt:      string | null
  /** OPS pipeline ID for traceability. */
  pipelineId:       string | null
  /** Current batch number (1-indexed). 0 when not in batch mode. Sprint 3F+ */
  currentBatch:     number
  /** Total number of batches planned. Sprint 3F+ */
  totalBatches:     number
  /** ASIN of the candidate currently being processed. null when idle. Sprint 3F+ */
  currentCandidate: string | null
  /** Non-fatal errors accumulated during this run. Sprint 3F+ */
  errors:           string[]
  /** Number of discovery iterations completed in this fill. Sprint 3G+ */
  iterations:       number
  /** Remaining deficit after the last iteration. Sprint 3G+ */
  remainingDeficit: number
  /** ASIN of the last product admitted to the catalog. Sprint 3G+ */
  lastAdmittedAsin: string | null
  /** Category currently being processed in multi-category fill. Sprint 3H+ */
  currentCategory:      string | null
  /** Number of categories processed so far in this multi-category run. Sprint 3H+ */
  categoriesProcessed:  number
  /** Number of categories successfully resolved (deficit→0) this run. Sprint 3H+ */
  categoriesResolved:   number
  /** Category slugs whose candidate pool was refreshed this run. Sprint 3H+ */
  refreshedPools:       string[]
  /** Non-fatal warnings accumulated during multi-category run. Sprint 3H+ */
  warnings:             string[]
}

// ── Default ───────────────────────────────────────────────────────────────────

function defaultExecutionState(): CatalogExecutionState {
  return {
    isRunning:        false,
    category:         null,
    stage:            'idle',
    deficit:          0,
    found:            0,
    validated:        0,
    admitted:         0,
    startedAt:        null,
    completedAt:      null,
    pipelineId:       null,
    currentBatch:     0,
    totalBatches:     1,
    currentCandidate: null,
    errors:           [],
    iterations:       0,
    remainingDeficit: 0,
    lastAdmittedAsin: null,
    currentCategory:      null,
    categoriesProcessed:  0,
    categoriesResolved:   0,
    refreshedPools:       [],
    warnings:             [],
  }
}

// ── Migration ─────────────────────────────────────────────────────────────────

const VALID_STAGES = new Set<CatalogExecutionStage>([
  'idle', 'calculating', 'discovering', 'validating', 'admitting',
  'completed', 'done', 'failed',
])

function migrateExecutionState(raw: Record<string, unknown>): CatalogExecutionState {
  const defaults = defaultExecutionState()

  const rawStage = raw.stage as unknown
  const stage: CatalogExecutionStage =
    typeof rawStage === 'string' && VALID_STAGES.has(rawStage as CatalogExecutionStage)
      ? (rawStage as CatalogExecutionStage)
      : defaults.stage

  return {
    isRunning:        typeof raw.isRunning        === 'boolean' ? raw.isRunning        : defaults.isRunning,
    category:         typeof raw.category         === 'string'  ? raw.category         : defaults.category,
    stage,
    deficit:          typeof raw.deficit          === 'number'  ? raw.deficit          : defaults.deficit,
    found:            typeof raw.found            === 'number'  ? raw.found            : defaults.found,
    validated:        typeof raw.validated        === 'number'  ? raw.validated        : defaults.validated,
    admitted:         typeof raw.admitted         === 'number'  ? raw.admitted         : defaults.admitted,
    startedAt:        typeof raw.startedAt        === 'string'  ? raw.startedAt        : defaults.startedAt,
    completedAt:      typeof raw.completedAt      === 'string'  ? raw.completedAt      : defaults.completedAt,
    pipelineId:       typeof raw.pipelineId       === 'string'  ? raw.pipelineId       : defaults.pipelineId,
    currentBatch:     typeof raw.currentBatch     === 'number'  ? raw.currentBatch     : defaults.currentBatch,
    totalBatches:     typeof raw.totalBatches     === 'number'  ? raw.totalBatches     : defaults.totalBatches,
    currentCandidate: typeof raw.currentCandidate === 'string'  ? raw.currentCandidate : defaults.currentCandidate,
    errors:           Array.isArray(raw.errors)                 ? (raw.errors as string[]).filter(e => typeof e === 'string') : defaults.errors,
    iterations:       typeof raw.iterations       === 'number'  ? raw.iterations       : defaults.iterations,
    remainingDeficit: typeof raw.remainingDeficit === 'number'  ? raw.remainingDeficit : defaults.remainingDeficit,
    lastAdmittedAsin: typeof raw.lastAdmittedAsin === 'string'  ? raw.lastAdmittedAsin : defaults.lastAdmittedAsin,
    currentCategory:      typeof raw.currentCategory      === 'string'  ? raw.currentCategory      : defaults.currentCategory,
    categoriesProcessed:  typeof raw.categoriesProcessed  === 'number'  ? raw.categoriesProcessed  : defaults.categoriesProcessed,
    categoriesResolved:   typeof raw.categoriesResolved   === 'number'  ? raw.categoriesResolved   : defaults.categoriesResolved,
    refreshedPools:       Array.isArray(raw.refreshedPools)              ? (raw.refreshedPools as string[]).filter(s => typeof s === 'string') : defaults.refreshedPools,
    warnings:             Array.isArray(raw.warnings)                    ? (raw.warnings    as string[]).filter(s => typeof s === 'string') : defaults.warnings,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads the current catalog execution state.
 * Returns the idle default if the file is missing or corrupt.
 * Never throws.
 */
export function readCatalogExecutionState(): CatalogExecutionState {
  const raw = storage.read(EXECUTION_FILE)
  if (raw === null) return defaultExecutionState()
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return migrateExecutionState(parsed)
  } catch {
    return defaultExecutionState()
  }
}
