/**
 * lib/ops/system-health.ts
 *
 * Computes a dimensional platform health score (0-100) covering:
 *   - Truth health:       avg truth score × coverage %
 *   - Catalog health:     public / total ratio
 *   - Suppression health: 1 - (suppressed / public)
 *   - Queue health:       queue freshness
 *   - Freshness health:   % products checked in last 48h
 *   - Availability health: Colombia + link health
 *
 * NOTE: This is separate from SubsystemHealth in lib/ops/health.ts which
 * checks individual jobs. This module checks DATA quality dimensions.
 *
 * SERVER-ONLY.
 */

import {
  loadReport as loadTruthReport,
  loadAllResults,
  loadQueue,
  getSuppressedCount,
} from '@/lib/catalog/live-truth'
import { getPublicCatalogStats }              from '@/lib/catalog/public'
import { getAllProducts }                      from '@/data/catalog'
import { analyseCatalogLinkHealth }           from '@/lib/catalog/link-health'
import { analyseCatalogColombiaAvailability } from '@/lib/catalog/colombia-availability'
import type { PlatformHealthScore }           from './types'

// ── Weight config ─────────────────────────────────────────────────────────────

const WEIGHTS = {
  truth:       25,
  catalog:     20,
  suppression: 20,
  queue:       15,
  freshness:   10,
  availability: 10,
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function ageMs(iso: string | null | undefined): number {
  if (!iso) return Infinity
  return Date.now() - new Date(iso).getTime()
}

const H48 = 48 * 3_600_000

// ── Dimension computers ───────────────────────────────────────────────────────

function computeTruthHealth(): number {
  const report = loadTruthReport()
  if (!report || report.totalChecked === 0) return 50   // neutral when never run

  const coveragePct = report.totalInCatalog > 0
    ? report.totalChecked / report.totalInCatalog
    : 0
  // Weighted: 70% from avg score, 30% from coverage
  return clamp((report.avgTruthScore * 0.7) + (coveragePct * 100 * 0.3))
}

function computeCatalogHealth(): number {
  const stats = getPublicCatalogStats()
  if (stats.total === 0) return 0
  const publicRatio = stats.public / stats.total
  return clamp(publicRatio * 100)
}

function computeSuppressionHealth(): number {
  const stats      = getPublicCatalogStats()
  const suppressed = getSuppressedCount()
  const base       = stats.public + suppressed
  if (base === 0) return 100
  // Penalty: each suppressed product reduces score
  const ratio = suppressed / base
  return clamp((1 - ratio) * 100)
}

function computeQueueHealth(): number {
  const queue = loadQueue()
  if (!queue || !queue.updatedAt) return 50   // neutral

  const age = ageMs(queue.updatedAt)
  // Fresh = 100pts, 48h old = 0pts, linear
  const score = Math.max(0, 1 - age / H48) * 100
  return clamp(score)
}

function computeFreshnessHealth(): number {
  const results  = loadAllResults()
  const keys     = Object.keys(results)
  if (keys.length === 0) return 0

  const freshCount = keys.filter(id => {
    const checkedAt = results[id].checkedAt
    return checkedAt && ageMs(checkedAt) < H48
  }).length

  return clamp((freshCount / keys.length) * 100)
}

function computeAvailabilityHealth(): number {
  const products = getAllProducts()
  if (products.length === 0) return 100

  let linkScore     = 100
  let colombiaScore = 100

  try {
    const linkReport = analyseCatalogLinkHealth(products)
    if (linkReport.total > 0) {
      linkScore = clamp(linkReport.alive / linkReport.total * 100)
    }
  } catch { /* graceful */ }

  try {
    const colReport = analyseCatalogColombiaAvailability(products)
    if (colReport.total > 0 && colReport.lastAuditAt) {
      const available = colReport.available + colReport.rateLimited + colReport.unknown
      colombiaScore = clamp(available / colReport.total * 100)
    }
  } catch { /* graceful */ }

  return clamp((linkScore + colombiaScore) / 2)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the composite platform health score.
 * All dimensions are normalized to 0-100 and weighted.
 */
export function computePlatformHealthScore(): PlatformHealthScore {
  const truthHealth       = computeTruthHealth()
  const catalogHealth     = computeCatalogHealth()
  const suppressionHealth = computeSuppressionHealth()
  const queueHealth       = computeQueueHealth()
  const freshnessHealth   = computeFreshnessHealth()
  const availabilityHealth = computeAvailabilityHealth()

  const overall = clamp(
    (truthHealth       * WEIGHTS.truth)       / 100 +
    (catalogHealth     * WEIGHTS.catalog)     / 100 +
    (suppressionHealth * WEIGHTS.suppression) / 100 +
    (queueHealth       * WEIGHTS.queue)       / 100 +
    (freshnessHealth   * WEIGHTS.freshness)   / 100 +
    (availabilityHealth * WEIGHTS.availability) / 100,
  )

  return {
    overall,
    truthHealth,
    catalogHealth,
    suppressionHealth,
    queueHealth,
    freshnessHealth,
    availabilityHealth,
    computedAt: new Date().toISOString(),
  }
}
