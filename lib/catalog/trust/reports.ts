/**
 * lib/catalog/trust/reports.ts
 *
 * Generates and persists the TrustReport — a catalog-wide visibility snapshot.
 *
 * The report captures:
 *   — Distribution across visibility tiers (active/warning/degraded/suppressed)
 *   — Average public trust score
 *   — Suppression reason breakdown
 *   — Warning badge distribution
 *   — Recovery candidate count
 *
 * Reports are saved to data/catalog/trust/trust-report.json and can be
 * retrieved without recomputing via loadTrustReport().
 *
 * SERVER-ONLY.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { dirname }                      from 'path'
import { dataPath } from '@/lib/data-path'
import { getAllProducts }                      from '@/data/catalog'
import type { TrustReport } from './types'
import { computeCatalogVisibility, buildVisibilityContext } from './visibility-engine'
import { findRecoveryCandidates }             from './recovery-engine'

// ── Path ──────────────────────────────────────────────────────────────────────

const REPORT_PATH = dataPath('data', 'catalog', 'trust', 'trust-report.json')

// ── Persistence ───────────────────────────────────────────────────────────────

export function saveTrustReport(report: TrustReport): void {
  const dir = dirname(REPORT_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = REPORT_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8')
  renameSync(tmp, REPORT_PATH)
}

export function loadTrustReport(): TrustReport | null {
  if (!existsSync(REPORT_PATH)) return null
  try {
    return JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as TrustReport
  } catch {
    return null
  }
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Computes the full trust report from the current catalog state.
 * This is a synchronous, in-memory computation with no network calls.
 * Typically takes < 50ms for catalogs up to 500 products.
 */
export function buildTrustReport(): TrustReport {
  const products = getAllProducts()
  const results  = computeCatalogVisibility(products)
  const context  = buildVisibilityContext()

  // Tier counts
  let active = 0, warning = 0, degraded = 0, suppressed = 0

  // Suppression breakdown: reason → count
  const suppressionBreakdown: Record<string, number> = {}

  // Warning badge breakdown
  const warningBreakdown: Record<string, number> = {}

  // Total public score (for average)
  let totalScore = 0

  for (const result of results) {
    totalScore += result.publicScore

    switch (result.tier) {
      case 'active':    active++;    break
      case 'warning':   warning++;   break
      case 'degraded':  degraded++;  break
      case 'suppressed':
        suppressed++
        if (result.suppressionReason) {
          // Normalise reason to a short key for the breakdown
          const key = normaliseSuppressionKey(result.suppressionReason)
          suppressionBreakdown[key] = (suppressionBreakdown[key] ?? 0) + 1
        }
        break
    }

    // Badge distribution
    for (const badge of result.warnings) {
      warningBreakdown[badge.code] = (warningBreakdown[badge.code] ?? 0) + 1
    }
  }

  const total            = results.length
  const visible          = active + warning + degraded
  const avgPublicScore   = total > 0 ? Math.round(totalScore / total) : 0

  // Recovery candidates
  const recoveryCandidates = findRecoveryCandidates(products, results, context)

  return {
    totalProducts:       total,
    active,
    warning,
    degraded,
    suppressed,
    visible,
    avgPublicScore,
    suppressionBreakdown,
    warningBreakdown,
    recoveryCandidates:  recoveryCandidates.length,
    computedAt:          new Date().toISOString(),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseSuppressionKey(reason: string): string {
  if (reason.includes('inactive'))               return 'inactive_status'
  if (reason.includes('Colombia restriction'))   return 'colombia_restriction'
  if (reason.includes('quarantine'))             return 'quarantine'
  if (reason.includes('ASIN'))                   return 'invalid_asin'
  if (reason.includes('structurally invalid'))   return 'invalid_image_url'
  if (reason.includes('dead ASIN'))              return 'dead_asin_image'
  if (reason.includes('consecutive audit'))      return 'consecutive_audit_failures'
  if (reason.includes('CRITICAL'))               return 'intelligence_critical'
  if (reason.includes('Dead Amazon link'))       return 'dead_amazon_link'
  if (reason.includes('healing'))                return 'healing_suppression'
  return 'other'
}
