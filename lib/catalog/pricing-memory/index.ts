/**
 * lib/catalog/pricing-memory/index.ts
 *
 * Barrel exports + runPricingScan() coordinator — Sprint 4E.
 *
 * runPricingScan():
 *   1. Read all price history
 *   2. For every product with history, recompute analytics
 *   3. Write updated intelligence store in a single batch
 *   4. Compute governance summary
 *   5. Append OPS log
 *
 * SERVER-ONLY.
 */

export type {
  PriceSnapshot,
  ProductPriceHistory,
  PriceHistoryStore,
  PriceTrend,
  ProductIntelligence,
  ProductIntelligenceStore,
  PricingGovernance,
} from './types'

export {
  readPriceHistory,
  savePriceHistory,
  updatePriceHistory,
  readProductIntelligence,
  saveProductIntelligence,
  updateProductIntelligence,
} from './state'

export {
  computePriceVolatility,
  computePriceTrend,
  computePriceOpportunity,
  computeProductAnalytics,
} from './analytics'

export { getPricingGovernance } from './governance'

// ── Scan coordinator ──────────────────────────────────────────────────────────

import { readPriceHistory, saveProductIntelligence, readProductIntelligence } from './state'
import { computeProductAnalytics } from './analytics'
import { getPricingGovernance }    from './governance'
import { appendLog }               from '@/lib/ops/logs'
import type { OpsLog }             from '@/lib/ops/logs/types'
import type { ProductIntelligenceStore } from './types'
import { rebuildRecommendations }  from '@/lib/catalog/recommendations/state'
import { generateAlerts }          from '@/lib/catalog/alerts/state'

export interface PricingScanResult {
  productsScanned:    number
  intelligenceUpdated: number
  governance:         ReturnType<typeof getPricingGovernance>
}

export function runPricingScan(pipelineId?: string): PricingScanResult {
  const startMs = Date.now()

  const priceHistory   = readPriceHistory()
  const intelligenceStore = readProductIntelligence()

  const historyProducts = Object.values(priceHistory.products)
  const productsScanned = historyProducts.length

  let intelligenceUpdated = 0

  const now = new Date().toISOString()

  const updatedStore: ProductIntelligenceStore = {
    updatedAt: now,
    products:  { ...intelligenceStore.products },
  }

  for (const history of historyProducts) {
    if (history.snapshots.length === 0) continue

    const { volatility, trend, opportunity } = computeProductAnalytics(history)

    const existing = intelligenceStore.products[history.asin]

    // Detect price drop: trend is falling or latestPrice < previous latestPrice
    const prevLatest = existing?.lastPriceDropAt
    const lastPriceDropAt: string | null = (() => {
      if (trend === 'falling') return now
      return existing?.lastPriceDropAt ?? null
    })()

    const totalPriceChanges = history.snapshots.length - 1

    updatedStore.products[history.asin] = {
      asin:              history.asin,
      volatilityScore:   volatility,
      opportunityScore:  opportunity,
      trend,
      lastPriceDropAt,
      totalPriceChanges: Math.max(0, totalPriceChanges),
    }

    intelligenceUpdated++
    void prevLatest  // suppress unused-var lint
  }

  saveProductIntelligence(updatedStore)

  const governance = getPricingGovernance()
  const durationMs = Date.now() - startMs

  const notes = [
    `scanned: ${productsScanned}`,
    `updated: ${intelligenceUpdated}`,
    `rising: ${governance.rising}`,
    `falling: ${governance.falling}`,
    `stable: ${governance.stable}`,
    `opportunities: ${governance.opportunities}`,
    `avgVolatility: ${governance.averageVolatility}`,
    `avgOpportunity: ${governance.averageOpportunity}`,
    `durationMs: ${durationMs}`,
  ].join(' | ')

  const startedAt  = new Date(Date.now() - durationMs).toISOString()
  const completedAt = new Date().toISOString()
  const logId       = pipelineId ?? `pricing-scan-${Date.now()}`

  const log: OpsLog = {
    id:          logId,
    jobType:     'catalog-pricing',
    trigger:     'pipeline',
    pipelineId,
    startedAt,
    completedAt,
    durationMs,
    status:      'success',
    summary:     `Pricing: ${productsScanned} products scanned, ${intelligenceUpdated} updated, ${governance.opportunities} opportunities`,
    actions:     { removed: [], repaired: [], suppressed: [], recovered: [], flagged: [] },
    errors:      [],
    warnings:    [],
    notes,
  }

  try {
    appendLog(log)
  } catch {
    // best-effort — never block the scan
  }

  // Sprint 4F: rebuild recommendations + alerts after intelligence is updated
  try {
    rebuildRecommendations()
    generateAlerts()
  } catch {
    // best-effort
  }

  return { productsScanned, intelligenceUpdated, governance }
}
