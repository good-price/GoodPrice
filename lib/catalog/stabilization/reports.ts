/**
 * lib/catalog/stabilization/reports.ts
 *
 * Builds, saves, and loads the full StabilizationReport.
 *
 * The report is persisted to data/catalog/stabilization/report.json.
 * Reads are always fast (disk cache). Writes require a full recompute
 * which may take a few seconds on large catalogs.
 *
 * SERVER-ONLY.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join, dirname }                         from 'path'
import { computeVisibilityRatios, classifyVisibilityHealth } from './visibility-balancer'
import { computeSuppressionPressure }            from './suppression-balancer'
import { buildPricingHealthReport }              from './stale-pricing'
import { getTrmStatus }                          from './trm-engine'
import { computeCatalogHealthScore }             from './catalog-health'
import { buildPrioritizedRecoveryCandidates }    from './degraded-priority'
import { analyzeAndRecommend }                   from './execution-analyzer'
import type { StabilizationReport }              from './types'

// ── Path ───────────────────────────────────────────────────────────────────────

const REPORT_PATH = join(
  process.cwd(), 'data', 'catalog', 'stabilization', 'report.json',
)

// ── Persistence ────────────────────────────────────────────────────────────────

export function saveStabilizationReport(report: StabilizationReport): void {
  const dir = dirname(REPORT_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = REPORT_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8')
  renameSync(tmp, REPORT_PATH)
}

export function loadStabilizationReport(): StabilizationReport | null {
  if (!existsSync(REPORT_PATH)) return null
  try {
    return JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as StabilizationReport
  } catch {
    return null
  }
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Computes the full StabilizationReport from current catalog state.
 * This is async because recovery candidates require the analytics adapter.
 */
export async function buildStabilizationReport(): Promise<StabilizationReport> {
  const ratios             = computeVisibilityRatios()
  const suppressionPressure = computeSuppressionPressure(ratios)
  const pricingHealth      = buildPricingHealthReport()
  const trmStatus          = getTrmStatus()
  const healthScore        = computeCatalogHealthScore()
  const visibilityStatus   = classifyVisibilityHealth(ratios)
  const recoveryCandidates = await buildPrioritizedRecoveryCandidates(20)
  const recommendations    = analyzeAndRecommend()

  return {
    computedAt:          new Date().toISOString(),
    healthScore,
    visibilityStatus,
    ratios,
    suppressionPressure,
    pricingHealth,
    trmStatus,
    recoveryCandidates,
    recommendations,
  }
}
