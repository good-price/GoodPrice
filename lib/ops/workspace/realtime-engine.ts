/**
 * lib/ops/workspace/realtime-engine.ts
 *
 * Builds the OpsSnapshot — a fast, synchronous snapshot of current
 * operational state. Called on every polling tick by the live API.
 *
 * Design principle: NEVER do expensive computation here.
 * Only reads from already-computed data (files, memory).
 *
 * SERVER-ONLY.
 */

import { computeVisibilityRatios }      from '@/lib/catalog/stabilization/visibility-balancer'
import { computeCatalogHealthScore }   from '@/lib/catalog/stabilization/catalog-health'
import { loadAllOverrides }          from '@/lib/ops/actions/override-engine'
import { getPendingQueueItems }      from '@/lib/ops/actions/bulk-actions'
import { runHealthCheck }            from '@/lib/ops/health'
import { getWorkspaceLiveEvents }    from './live-events'
import { getWorkspaceActiveJobs, getActiveJobCount } from './execution-stream'
import type { OpsSnapshot }          from './types'
export type { SectionCounts }        from './section-counts'
export { buildSectionCounts }        from './section-counts'

// ── Snapshot builder ──────────────────────────────────────────────────────────

/**
 * Builds a fast OpsSnapshot from existing data sources.
 * Synchronous — reads only from files and in-memory caches.
 * Typical execution time: <5ms.
 */
export function buildOpsSnapshot(): OpsSnapshot {
  // ── Visibility ratios ─────────────────────────────────────────────────────
  let visibility: OpsSnapshot['visibility'] = {
    active: 0, warning: 0, degraded: 0, suppressed: 0, total: 0, visiblePct: 0,
  }
  try {
    const ratios = computeVisibilityRatios()
    visibility = {
      active:     ratios.active,
      warning:    ratios.warning,
      degraded:   ratios.degraded,
      suppressed: ratios.suppressed,
      total:      ratios.total,
      visiblePct: ratios.visiblePct,
    }
  } catch { /* catalog not yet initialised */ }

  // ── Health score (computed live — single source of truth) ────────────────
  // report.json is kept only as historical cache for /api/catalog/stabilization/report.
  // The dashboard, sidebar, and ops page all derive their score from here.
  let healthScore = 0
  let systemStatus: OpsSnapshot['systemStatus'] = 'ok'
  try {
    healthScore  = computeCatalogHealthScore().overall
    systemStatus = healthScore >= 70 ? 'ok' : healthScore >= 40 ? 'degraded' : 'critical'
  } catch {
    // Fall back to system health check if catalog is not yet initialised
    const health = runHealthCheck()
    systemStatus = health.status as OpsSnapshot['systemStatus']
    healthScore  = health.status === 'ok' ? 80 : health.status === 'degraded' ? 50 : 20
  }

  // ── Override count ────────────────────────────────────────────────────────
  let overrideCount = 0
  try {
    overrideCount = loadAllOverrides().size
  } catch { /* no overrides file yet */ }

  // ── Pending queue jobs ────────────────────────────────────────────────────
  let pendingQueueJobs = 0
  try {
    pendingQueueJobs = getPendingQueueItems().length
  } catch { /* no queue file yet */ }

  // ── Active jobs ───────────────────────────────────────────────────────────
  const activeJobCount = getActiveJobCount()

  // ── Live events ───────────────────────────────────────────────────────────
  const recentEvents = getWorkspaceLiveEvents(15)

  // ── Active jobs (workspace format) ───────────────────────────────────────
  const activeJobs = getWorkspaceActiveJobs()

  return {
    timestamp:        new Date().toISOString(),
    healthScore,
    systemStatus,
    visibility,
    overrideCount,
    pendingQueueJobs,
    activeJobCount,
    recentEvents,
    activeJobs,
  }
}

// ── Section counts — re-exported from section-counts.ts (pure, client-safe) ──
// (SectionCounts and buildSectionCounts are exported at the top of this file)
