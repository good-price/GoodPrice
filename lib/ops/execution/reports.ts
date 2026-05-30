/**
 * lib/ops/execution/reports.ts
 *
 * Aggregated execution reports for the admin dashboard.
 *
 * SERVER-ONLY.
 */

import type { ExecReport }         from './types'
import { getRecentJobs, getActiveJobs, getRecentPipelines } from './queue-engine'
import { getRecentLog }             from './execution-log'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a summary execution report for the admin dashboard.
 */
export function getExecutionReport(jobLimit = 20): ExecReport {
  const recent   = getRecentJobs(jobLimit)
  const active   = getActiveJobs()
  const pipelines = getRecentPipelines(5)

  const completed  = recent.filter(j => j.status === 'completed').length
  const failed     = recent.filter(j => j.status === 'failed').length
  const cancelled  = recent.filter(j => j.status === 'cancelled').length

  const durations = recent
    .filter(j => j.startedAt && j.completedAt)
    .map(j => new Date(j.completedAt!).getTime() - new Date(j.startedAt!).getTime())

  const avgDurationMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0

  return {
    generatedAt:     new Date().toISOString(),
    totalRuns:       recent.length,
    completedRuns:   completed,
    failedRuns:      failed,
    cancelledRuns:   cancelled,
    avgDurationMs,
    activeJobs:      active,
    recentJobs:      recent.slice(0, 10),
    recentPipelines: pipelines,
  }
}

/**
 * Returns recent execution log entries for display in the admin dashboard.
 */
export { getRecentLog }
