/**
 * GOODPRICE Pricing — Price Check Job Orchestrator
 *
 * Delegates to the Amazon price sync job (Fase A).
 * Called by the Vercel Cron job via POST /api/pricing/check.
 *
 * `forceSearch` is accepted for API compatibility but has no effect in Fase A
 * (Amazon scraping doesn't have a cached-mapping concept).
 */

import { runAmazonPriceSyncJob, type AmazonSyncProductResult } from './sync-amazon-prices'

// ── Job result types ──────────────────────────────────────────────────────────

export interface PriceCheckJobResult {
  startedAt:   string
  completedAt: string
  durationMs:  number
  processed:   number
  skipped:     number
  summary: {
    success:     number   // overrides written
    duplicate:   number   // suspicious delta — skipped
    not_found:   number   // ASIN 404
    no_match:    number   // redirected or unavailable
    match_found: number   // price ok, within threshold
    error:       number   // blocked or extraction failed
  }
  reports: AmazonSyncProductResult[]
}

// ── Status mapping ────────────────────────────────────────────────────────────

function toSummaryKey(
  status: AmazonSyncProductResult['status'],
): keyof PriceCheckJobResult['summary'] {
  switch (status) {
    case 'overridden':   return 'success'
    case 'ok':           return 'match_found'
    case 'invalid_asin': return 'not_found'
    case 'redirected':
    case 'unavailable':  return 'no_match'
    case 'suspicious':   return 'duplicate'
    case 'blocked':
    case 'failed':       return 'error'
  }
}

// ── Price check job ───────────────────────────────────────────────────────────

export async function runPriceCheckJob(options: {
  productIds?: string[]
  forceSearch?: boolean
} = {}): Promise<PriceCheckJobResult> {
  const sync = await runAmazonPriceSyncJob({ productIds: options.productIds })

  const summary = {
    success:     0,
    duplicate:   0,
    not_found:   0,
    no_match:    0,
    match_found: 0,
    error:       0,
  }

  for (const r of sync.results) {
    summary[toSummaryKey(r.status)]++
  }

  return {
    startedAt:   sync.startedAt,
    completedAt: sync.completedAt,
    durationMs:  sync.durationMs,
    processed:   sync.processed,
    skipped:     sync.skipped,
    summary,
    reports:     sync.results,
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatJobSummary(result: PriceCheckJobResult): string {
  const { processed, summary, durationMs } = result
  const sec   = (durationMs / 1_000).toFixed(1)
  const parts = [
    `${processed} processed`,
    summary.success     > 0 ? `${summary.success} overridden`   : '',
    summary.match_found > 0 ? `${summary.match_found} ok`       : '',
    summary.no_match    > 0 ? `${summary.no_match} no_match`    : '',
    summary.not_found   > 0 ? `${summary.not_found} not_found`  : '',
    summary.duplicate   > 0 ? `${summary.duplicate} suspicious` : '',
    summary.error       > 0 ? `${summary.error} error`          : '',
  ].filter(Boolean)

  return `[price-check] ${parts.join(', ')} — ${sec}s`
}
