/**
 * lib/catalog/repair/reports.ts
 *
 * Generates the repair report for the admin dashboard and API endpoint.
 *
 * The repair report is computed fresh on each call — it reads live data from:
 *   - The current catalog (getAllProducts)
 *   - The public catalog filter (getPublicProducts)
 *   - History files (replacements.json, failures.json)
 *   - A live diagnosis pass on all products
 *
 * It does NOT trigger a repair pipeline run.
 * Use runRepairPipeline() from replacement-engine.ts for that.
 */

import { getAllProducts } from '@/data/catalog'
import { categories } from '@/data/categories'

import type { RepairReport, CategoryRepairStats, PipelineResult } from './types'
import {
  getReplacementHistory,
  getFailures,
  getHistorySummary,
} from './history'
import { diagnoseProduct } from './replacement-engine'

// ── Report generation ──────────────────────────────────────────────────────────

/**
 * Generates the full repair report.
 * @param lastRun  Optional: inject the most recent PipelineResult (if available)
 */
export function generateRepairReport(
  lastRun: PipelineResult | null = null,
): RepairReport {
  const now = new Date().toISOString()

  const all     = getAllProducts()
  const history = getReplacementHistory()
  const failures = getFailures()
  const summary  = getHistorySummary()

  // ── Per-product diagnosis ────────────────────────────────────────────────────
  const needingRepair = all.filter(p => diagnoseProduct(p).length > 0)
  const needsPaapiSet = new Set(
    needingRepair
      .filter(p => p.image?.includes('/images/P/'))
      .map(p => p.id),
  )

  // ── Per-category stats ────────────────────────────────────────────────────────
  const byCategory: CategoryRepairStats[] = categories.map(cat => {
    const catAll    = all.filter(p => p.category === cat.slug)
    const catBroken = catAll.filter(p => diagnoseProduct(p).length > 0)
    const catRepaired = history.filter(
      h => {
        const prod = all.find(p => p.id === h.productId)
        return prod?.category === cat.slug && h.status === 'auto_replaced'
      },
    )
    const catManual = history.filter(
      h => {
        const prod = all.find(p => p.id === h.productId)
        return prod?.category === cat.slug && h.status === 'manual_review_required'
      },
    )
    const catPaapi = catBroken.filter(p => needsPaapiSet.has(p.id ?? ''))

    return {
      slug:         cat.slug,
      totalProducts: catAll.length,
      needsRepair:  catBroken.length,
      repaired:     catRepaired.length,
      manualReview: catManual.length,
      needsPaapi:   catPaapi.length,
    }
  })

  // ── Success rate ─────────────────────────────────────────────────────────────
  const totalAttempted = history.length + failures.length
  const successRate = totalAttempted > 0
    ? Math.round((summary.totalReplacements / totalAttempted) * 100)
    : 0

  // ── Recent replacements (last 20) ────────────────────────────────────────────
  const recentReplacements = history.slice(-20).reverse()

  return {
    generatedAt:          now,
    totalProducts:        all.length,
    productsNeedingRepair: needingRepair.length,
    repairedAllTime:      summary.totalReplacements,
    pendingManualReview:  summary.pendingManualReview,
    needsPaapi:           needsPaapiSet.size,
    successRate,
    lastRun,
    byCategory,
    recentReplacements,
    openFailures:         failures,
  }
}

/**
 * Returns a compact summary suitable for the admin dashboard header cards.
 */
export function getRepairSummary(): {
  totalNeedingRepair: number
  autoRepairedAllTime: number
  pendingManualReview: number
  openFailures: number
  needsPaapi: number
  successRate: number
} {
  const all     = getAllProducts()
  const history = getReplacementHistory()
  const failures = getFailures()
  const summary  = getHistorySummary()

  const needingRepair = all.filter(p => diagnoseProduct(p).length > 0)
  const needsPaapi = needingRepair.filter(
    p => p.image?.includes('/images/P/'),
  ).length

  const totalAttempted = history.length + failures.length
  const successRate = totalAttempted > 0
    ? Math.round((summary.totalReplacements / totalAttempted) * 100)
    : 0

  return {
    totalNeedingRepair: needingRepair.length,
    autoRepairedAllTime: summary.totalReplacements,
    pendingManualReview: summary.pendingManualReview,
    openFailures: failures.length,
    needsPaapi,
    successRate,
  }
}
