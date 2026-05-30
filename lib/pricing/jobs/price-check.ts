/**
 * GOODPRICE Pricing — Price Check Job Orchestrator
 *
 * Iterates all mapped catalog products and triggers ML ingestion for each.
 * Called by the Vercel Cron job via POST /api/pricing/check.
 *
 * Processing strategy:
 *   - Sequential (not parallel) to respect ML API rate limits
 *   - Products with an existing mlItemId are checked first (mapped)
 *   - Unmapped products trigger a search (slower, more API calls)
 *   - Products without a searchQuery are skipped
 *   - Per-product errors are isolated — one failure doesn't stop the job
 *
 * Catalog price index:
 *   Prices are loaded dynamically from data/catalog at runtime via getRawProducts().
 *   These are the Amazon USD prices used for ML price sanity scoring.
 *   No manual sync required — adding a product to the catalog is sufficient.
 *
 * Concurrency note: Vercel Cron functions run as single-process lambdas.
 * Sequential processing is safe — no file-lock issues with FileStore.
 */

import { ingestMLProduct, type IngestionReport } from './ingest-ml'
import { getPricingStore } from '../store'
import { getRawProducts } from '@/data/catalog'

// ── Catalog price index ───────────────────────────────────────────────────────

/**
 * Builds the catalog price map dynamically from the catalog data layer.
 * Returns a map of productId → Amazon USD price.
 * Called once per job run — no stale data risk.
 */
function buildCatalogPriceMap(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const product of getRawProducts()) {
    map[product.id] = product.price
  }
  return map
}

// ── Job result types ──────────────────────────────────────────────────────────

export interface PriceCheckJobResult {
  /** When the job started */
  startedAt:   string
  /** When the job finished */
  completedAt: string
  /** Total duration in ms */
  durationMs:  number
  /** How many products were processed */
  processed:   number
  /** How many products were skipped (no search query) */
  skipped:     number
  /** Counts by status */
  summary: {
    success:     number
    duplicate:   number
    not_found:   number
    no_match:    number
    match_found: number
    error:       number
  }
  /** Individual results (one per product) */
  reports: IngestionReport[]
}

// ── Price check job ───────────────────────────────────────────────────────────

/**
 * Run a full price check cycle across all mapped products.
 *
 * @param options.productIds - If provided, only check these product IDs (subset mode)
 * @param options.forceSearch - Re-run search even for products with existing mlItemId
 */
export async function runPriceCheckJob(options: {
  productIds?: string[]
  forceSearch?: boolean
} = {}): Promise<PriceCheckJobResult> {
  const startedAt = new Date().toISOString()
  const start     = Date.now()

  const store    = getPricingStore()
  const mappings = await store.getMappings()

  // Build price map once per job run from the live catalog
  const CATALOG_PRICES_USD = buildCatalogPriceMap()

  // Build list of mappings to process
  let targets = Object.values(mappings)

  if (options.productIds && options.productIds.length > 0) {
    const ids = new Set(options.productIds)
    targets = targets.filter(m => ids.has(m.productId))
  }

  // If forceSearch: clear mlItemId to trigger search flow
  if (options.forceSearch) {
    targets = targets.map(m => ({ ...m, mlItemId: null, mlItemTitle: null }))
  }

  const reports: IngestionReport[] = []
  let skipped = 0

  // Process sequentially to respect rate limits
  for (const mapping of targets) {
    // Skip products with no search query and no mlItemId
    if (!mapping.searchQuery && !mapping.mlItemId) {
      skipped++
      continue
    }

    const expectedUSD = CATALOG_PRICES_USD[mapping.productId] ?? 100

    try {
      const report = await ingestMLProduct(mapping, expectedUSD)
      reports.push(report)
    } catch (err) {
      // Unexpected error not caught by ingestMLProduct — shouldn't happen
      reports.push({
        productId:  mapping.productId,
        status:     'error',
        mlItemId:   mapping.mlItemId,
        error:      `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
      })
    }
  }

  const completedAt = new Date().toISOString()

  // Tally results
  const summary = {
    success:     0,
    duplicate:   0,
    not_found:   0,
    no_match:    0,
    match_found: 0,
    error:       0,
  }

  for (const r of reports) {
    if (r.status === 'success')     summary.success++
    else if (r.status === 'duplicate')   summary.duplicate++
    else if (r.status === 'not_found')   summary.not_found++
    else if (r.status === 'no_match')    summary.no_match++
    else if (r.status === 'match_found') summary.match_found++
    else if (r.status === 'error')       summary.error++
  }

  return {
    startedAt,
    completedAt,
    durationMs:  Date.now() - start,
    processed:   reports.length,
    skipped,
    summary,
    reports,
  }
}

/**
 * Get a short status string for logging/monitoring.
 *
 * @example
 * const result = await runPriceCheckJob()
 * console.log(formatJobSummary(result))
 * // → "[price-check] 17 processed, 8 success, 5 duplicate, 2 no_match, 1 error — 45.2s"
 */
export function formatJobSummary(result: PriceCheckJobResult): string {
  const { processed, summary, durationMs } = result
  const sec = (durationMs / 1_000).toFixed(1)
  const parts = [
    `${processed} processed`,
    summary.success     > 0 ? `${summary.success} success`     : '',
    summary.match_found > 0 ? `${summary.match_found} matched`  : '',
    summary.duplicate   > 0 ? `${summary.duplicate} duplicate`  : '',
    summary.no_match    > 0 ? `${summary.no_match} no_match`    : '',
    summary.not_found   > 0 ? `${summary.not_found} not_found`  : '',
    summary.error       > 0 ? `${summary.error} error`          : '',
  ].filter(Boolean)

  return `[price-check] ${parts.join(', ')} — ${sec}s`
}
