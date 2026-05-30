/**
 * lib/ops/activation/execution-insights.ts
 *
 * Analyzes the execution report to surface actionable insights:
 * success rates per job type, stalled queues, failure patterns,
 * suppression spikes, and recovery bottlenecks.
 *
 * SERVER-ONLY.
 */

import { getExecutionReport }  from '@/lib/ops/execution/reports'
import { getActiveJobs }       from '@/lib/ops/execution/queue-engine'
import type { ExecJob }        from '@/lib/ops/execution/types'
import type { ExecutionInsights, JobTypeInsight } from './types'

const JOB_LABELS: Record<string, string> = {
  'trust-recompute':   'Trust Recompute',
  'repair':            'Image Repair',
  'live-truth':        'Live Truth',
  'link-audit':        'Link Audit',
  'colombia-audit':    'Colombia Audit',
  'self-healing':      'Self-Healing',
  'paapi-sync':        'PA-API Sync',
  'recovery-pipeline': 'Recovery Pipeline',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function durationMs(job: ExecJob): number {
  if (!job.startedAt || !job.completedAt) return 0
  return new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
}

function groupByType(jobs: ExecJob[]): Map<string, ExecJob[]> {
  const map = new Map<string, ExecJob[]>()
  for (const job of jobs) {
    const list = map.get(job.type) ?? []
    list.push(job)
    map.set(job.type, list)
  }
  return map
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildExecutionInsights(): ExecutionInsights {
  let report = {
    totalRuns: 0, completedRuns: 0, failedRuns: 0, avgDurationMs: 0,
    recentJobs: [] as ExecJob[], activeJobs: [] as ExecJob[],
  }

  try {
    const r = getExecutionReport(30)
    report = {
      totalRuns:    r.totalRuns,
      completedRuns: r.completedRuns,
      failedRuns:   r.failedRuns,
      avgDurationMs: r.avgDurationMs,
      recentJobs:   r.recentJobs as ExecJob[],
      activeJobs:   r.activeJobs as ExecJob[],
    }
  } catch { /* execution system not initialized */ }

  let activeCount = 0
  try {
    activeCount = getActiveJobs().length
  } catch { /* ignore */ }

  const successRate = report.totalRuns > 0
    ? Math.round((report.completedRuns / report.totalRuns) * 100)
    : 0

  // Per-type breakdown
  const grouped = groupByType(report.recentJobs)
  const byType: JobTypeInsight[] = []
  grouped.forEach((jobs, type) => {
    const completed  = jobs.filter(j => j.status === 'completed')
    const failed     = jobs.filter(j => j.status === 'failed')
    const durations  = completed.map(durationMs).filter(d => d > 0)
    const avgMs      = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0
    const last       = [...jobs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]

    byType.push({
      type,
      label:         JOB_LABELS[type] ?? type,
      totalRuns:     jobs.length,
      completedRuns: completed.length,
      failedRuns:    failed.length,
      successRate:   jobs.length > 0 ? Math.round((completed.length / jobs.length) * 100) : 0,
      avgDurationMs: avgMs,
      lastRunAt:     last?.completedAt ?? last?.startedAt ?? null,
      lastStatus:    last?.status ?? null,
    })
  })

  // Stalled queues: job types that have failed ≥2 consecutive times
  const stalledQueues: string[] = []
  grouped.forEach((jobs, type) => {
    const recent = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)
    if (recent.length >= 2 && recent.every(j => j.status === 'failed')) {
      stalledQueues.push(JOB_LABELS[type] ?? type)
    }
  })

  // Failure patterns: unique error messages from failed jobs
  const seenErrors = new Set<string>()
  const failurePatterns: string[] = []
  report.recentJobs
    .filter(j => j.status === 'failed' && j.error)
    .slice(0, 5)
    .forEach(j => {
      if (j.error && !seenErrors.has(j.error)) {
        seenErrors.add(j.error)
        failurePatterns.push(j.error)
      }
    })

  // Suppression spike: check if recent trust-recompute jobs show high suppression
  const suppressionSpike = report.recentJobs.some(j =>
    j.type === 'trust-recompute' &&
    j.status === 'completed' &&
    (j.progress.suppressed ?? 0) > (j.progress.total ?? 1) * 0.4,
  )

  // Bottleneck: job type with lowest success rate (if < 50%)
  let bottleneck: string | null = null
  const worstType = byType
    .filter(t => t.totalRuns >= 2)
    .sort((a, b) => a.successRate - b.successRate)[0]
  if (worstType && worstType.successRate < 50) {
    bottleneck = `${worstType.label} (${worstType.successRate}% éxito)`
  }

  return {
    computedAt:     new Date().toISOString(),
    totalJobs:      report.totalRuns,
    successRate,
    avgDurationMs:  report.avgDurationMs,
    stalledQueues,
    failurePatterns,
    byType,
    hasActiveJobs:  activeCount > 0,
    activeJobCount: activeCount,
    suppressionSpike,
    bottleneck,
  }
}
